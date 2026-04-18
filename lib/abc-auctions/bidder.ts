import connectDB from "@/lib/mongoose";
import WatchedProduct from "@/models/WatchedProduct";
import logger from "@/lib/logger";
import { BidderStatus, MonitorStatus } from "./types";
import { TWENTY_FOUR_HOURS_MS, TEN_MINUTES_MS } from "./constants";
import { getLotDetail, placeBidApi, computeBidAmount } from "./api-client";
import { differenceInMilliseconds, isAfter } from "date-fns";
import cron, { type ScheduledTask } from "node-cron";

// Single shared cron job — processes all watched products every 10 minutes
let cronJob: ScheduledTask | null = null;

// ─── Lot status helpers ────────────────────────────────────────────────────

// ABC Auctions API: Status 0 = open/live. Adjust if the API uses different values.
function isLotClosed(status: number): boolean {
  return status !== 0;
}

// ─── DB status update ──────────────────────────────────────────────────────

async function updateStatus(
  id: string,
  status: BidderStatus,
  extra?: { lastBidAmount?: number; lastBidAt?: string }
) {
  await connectDB();
  await WatchedProduct.findByIdAndUpdate(id, {
    bidderStatus: status,
    ...(extra?.lastBidAmount != null && { lastBidAmount: extra.lastBidAmount }),
    ...(extra?.lastBidAt != null && { lastBidAt: extra.lastBidAt }),
  });
}

// ─── Per-product processing ────────────────────────────────────────────────

async function processSingleProduct(watched: InstanceType<typeof WatchedProduct>): Promise<void> {
  const id = String(watched._id);

  const detail = await getLotDetail(watched.productUrl);
  if (!detail) {
    logger.warn("🌕 Could not fetch lot detail, skipping", { id });
    return;
  }

  // Skip closed auctions — mark final outcome based on last bid
  if (isLotClosed(detail.Status)) {
    const currentPrice = detail.CurrentBid ?? detail.StartingBid;
    const status: BidderStatus =
      watched.lastBidAmount != null && currentPrice != null && currentPrice <= watched.lastBidAmount
        ? "won"
        : "outbid";
    await updateStatus(id, status);
    logger.info(`🟢 Auction closed — status: ${status}`, { id, currentPrice });
    return;
  }

  const now = new Date();
  const endTime = new Date(watched.auctionEndTime);

  // Auction already over by time
  if (isAfter(now, endTime)) {
    const currentPrice = detail.CurrentBid ?? detail.StartingBid;
    const status: BidderStatus =
      watched.lastBidAmount != null && currentPrice != null && currentPrice <= watched.lastBidAmount
        ? "won"
        : "outbid";
    await updateStatus(id, status);
    logger.info(`🟢 Auction ended — status: ${status}`, { id });
    return;
  }

  const timeLeftMs = differenceInMilliseconds(endTime, now);

  // More than 24 hours left — just wait
  if (timeLeftMs > TWENTY_FOUR_HOURS_MS) {
    await updateStatus(id, "waiting");
    logger.debug("🟣 Waiting for auction window", {
      id,
      hoursLeft: Math.round(timeLeftMs / 3_600_000),
    });
    return;
  }

  const currentPrice = detail.CurrentBid ?? detail.StartingBid ?? null;
  if (currentPrice === null) {
    logger.warn("🌕 No current price available, skipping", { id });
    return;
  }

  if (currentPrice >= watched.maxBid) {
    logger.info("🟢 Price reached maxBid — stopping", { id, currentPrice, maxBid: watched.maxBid });
    await updateStatus(id, "stopped");
    return;
  }

  const isFinalWindow = timeLeftMs <= TEN_MINUTES_MS;
  const hasPlacedEarlyBid = watched.lastBidAmount != null;
  const isOutbid = watched.lastBidAmount != null && currentPrice > watched.lastBidAmount;

  const shouldPlaceEarlyBid =
    !isFinalWindow && !hasPlacedEarlyBid && currentPrice >= watched.minBid;
  const shouldPlaceRecursiveBid =
    isFinalWindow && currentPrice >= watched.minBid && (!hasPlacedEarlyBid || isOutbid);

  if (shouldPlaceEarlyBid || shouldPlaceRecursiveBid) {
    const bidAmount = computeBidAmount(currentPrice, watched.maxBid);
    if (bidAmount == null) {
      logger.info("🟢 Next valid bid exceeds maxBid — stopping", {
        id,
        currentPrice,
        maxBid: watched.maxBid,
      });
      await updateStatus(id, "stopped");
      return;
    }

    await updateStatus(id, "active");
    const result = await placeBidApi(watched.externalId, bidAmount, watched.productUrl);

    if (result.success) {
      await updateStatus(id, "active", {
        lastBidAmount: result.bidAmount ?? bidAmount,
        lastBidAt: new Date().toISOString(),
      });
      logger.info("🟢 Bid placed", { id, bidAmount: result.bidAmount ?? bidAmount });
    } else {
      logger.warn("🌕 Bid failed", { id, error: result.error });
    }
  } else {
    logger.debug("🟣 Bidding conditions not met", {
      id,
      currentPrice,
      minBid: watched.minBid,
      isFinalWindow,
      hasPlacedEarlyBid,
      isOutbid,
    });
  }
}

// ─── Cron tick — processes all active watched products ─────────────────────

async function runCronTick(): Promise<void> {
  logger.info("🔵 Cron tick — checking all watched products");

  await connectDB();

  // Only process products that are not in a terminal state
  const activeProducts = await WatchedProduct.find({
    bidderStatus: { $nin: ["won", "outbid", "stopped"] },
  });

  if (activeProducts.length === 0) {
    logger.debug("🟣 No active products to monitor");
    return;
  }

  logger.info(`🔵 Processing ${activeProducts.length} watched product(s)`);

  await Promise.allSettled(
    activeProducts.map((watched) =>
      processSingleProduct(watched).catch((err) =>
        logger.error("🔴 Error processing product", { id: String(watched._id), err })
      )
    )
  );
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Ensure the shared cron monitor is running.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
function ensureCronRunning(): void {
  if (cronJob) return;

  // Run every 10 minutes
  cronJob = cron.schedule("*/10 * * * *", () => {
    runCronTick().catch((err) => logger.error("🔴 Cron tick failed", { err }));
  });

  logger.info("🟢 Cron monitor started — running every 10 minutes");

  // Run immediately so the product is picked up without waiting 10 minutes
  runCronTick().catch((err) => logger.error("🔴 Initial cron tick failed", { err }));
}

/**
 * Start monitoring a watched product.
 * Ensures the cron job is running — the product will be processed on the
 * next tick (or immediately on the first call).
 */
export function startMonitor(watchedProductId: string): void {
  logger.info("🟢 Start monitor requested", { watchedProductId });
  ensureCronRunning();
}

/**
 * Stop monitoring a specific watched product by marking it as stopped in the DB.
 * The cron job will skip it on subsequent ticks.
 */
export function stopMonitor(watchedProductId: string): void {
  logger.info("🟢 Stop monitor requested", { watchedProductId });
  updateStatus(watchedProductId, "stopped").catch((err) =>
    logger.error("🔴 Failed to set stopped status", { watchedProductId, err })
  );
}

/**
 * Get the current monitor statuses from the DB (products not in terminal states).
 */
export async function getMonitorStatuses(): Promise<MonitorStatus[]> {
  await connectDB();
  const products = await WatchedProduct.find({
    bidderStatus: { $nin: ["won", "outbid", "stopped", "idle"] },
  }).lean();

  return products.map((p) => ({
    watchedProductId: String(p._id),
    bidderStatus: p.bidderStatus,
    lastBidAmount: p.lastBidAmount ?? null,
    lastBidAt: p.lastBidAt ? new Date(p.lastBidAt).toISOString() : null,
  }));
}

/**
 * Stop the shared cron job entirely (e.g. for graceful shutdown).
 */
export function stopCronMonitor(): void {
  if (!cronJob) return;
  cronJob.stop();
  cronJob = null;
  logger.info("🟢 Cron monitor stopped");
}
