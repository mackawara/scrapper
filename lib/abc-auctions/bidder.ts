/**
 * Auto-bidder — incremental snipe strategy.
 *
 * Nothing is bid until a lot is inside its snipe window (default: the last 10
 * minutes). Once inside, we poll every 15s and, whenever we are not the high
 * bidder, place the *smallest* valid increment above the current price. That
 * repeats until either we hold the high bid at close or the next valid
 * increment would exceed maxBid, at which point we stop and let it go.
 *
 * Scheduling is a single 5s tick over a `nextCheckAt` column rather than one
 * timer per lot: lots outside the window are polled every few minutes, lots at
 * the wire every 15s, and the whole thing recovers by itself after a restart
 * because all the state lives in MongoDB.
 */

import connectDB from "@/lib/mongoose";
import WatchedProduct, { IWatchedProduct } from "@/models/WatchedProduct";
import logger from "@/lib/logger";
import { BidderStatus, MonitorStatus, SchedulerState, TERMINAL_BIDDER_STATUSES } from "./types";
import {
  LOT_STATUS,
  POLL_INTERVAL_SNIPE_MS,
  POST_CLOSE_GRACE_MS,
  SCHEDULER_TICK_MS,
  SNIPE_WINDOW_MS,
  pollIntervalFor,
} from "./constants";
import {
  LotDetailResponse,
  computeBidAmount,
  ensureAuthToken,
  getBidIncrements,
  getLotDetail,
  placeBidApi,
} from "./api-client";
import { finalizeBid, logBid } from "./bid-logger";

let schedulerTimer: NodeJS.Timeout | null = null;
let lastTickAt: Date | null = null;

/** Lots currently being processed, so a slow poll can't be entered twice. */
const inFlight = new Set<string>();

/** Max lots processed concurrently in a single tick. */
const MAX_CONCURRENT = 8;

// ─── Lot status helpers ────────────────────────────────────────────────────

function isLotLive(status: number): boolean {
  return status === LOT_STATUS.LIVE;
}

// ─── DB helpers ────────────────────────────────────────────────────────────

interface UpdateFields {
  bidderStatus?: BidderStatus;
  lastBidAmount?: number;
  lastBidAt?: Date;
  currentPrice?: number | null;
  isHighestBidder?: boolean | null;
  lastError?: string | null;
  nextCheckAt?: Date;
  auctionEndTime?: Date;
  $inc?: Record<string, number>;
}

async function update(id: string, fields: UpdateFields): Promise<void> {
  const { $inc, ...set } = fields;
  await WatchedProduct.findByIdAndUpdate(id, {
    ...(Object.keys(set).length > 0 && { $set: set }),
    ...($inc && { $inc }),
  });
}

/** Push a lot's next check out by the interval appropriate to its time left. */
function nextCheckFor(timeLeftMs: number): Date {
  return new Date(Date.now() + pollIntervalFor(timeLeftMs));
}

// ─── Winning detection ─────────────────────────────────────────────────────

/**
 * Whether we currently hold the high bid.
 *
 * `HighestBidder` comes straight from the API and is authoritative, but only
 * when the request carried a token. Without one we fall back to comparing the
 * price to our last bid, which is a guess — it cannot tell "nobody outbid us"
 * from "someone matched us and won on timestamp".
 */
function resolveIsWinning(
  detail: LotDetailResponse,
  lastBidAmount: number | null,
  authenticated: boolean
): { winning: boolean; authoritative: boolean } {
  if (authenticated && typeof detail.HighestBidder === "boolean") {
    return { winning: detail.HighestBidder, authoritative: true };
  }

  const currentPrice = detail.CurrentBid ?? detail.StartingBid ?? 0;
  return {
    winning: lastBidAmount != null && currentPrice <= lastBidAmount,
    authoritative: false,
  };
}

// ─── Auction close ─────────────────────────────────────────────────────────

async function settleClosedLot(
  watched: IWatchedProduct,
  detail: LotDetailResponse | null,
  authenticated: boolean
): Promise<void> {
  const id = String(watched._id);
  const currentPrice = detail?.CurrentBid ?? detail?.StartingBid ?? watched.currentPrice ?? null;

  let won: boolean;
  if (detail && authenticated && typeof detail.HighestBidder === "boolean") {
    won = detail.HighestBidder;
  } else {
    // Best effort: we won if the closing price never went above our last bid.
    won =
      watched.lastBidAmount != null &&
      currentPrice != null &&
      currentPrice <= watched.lastBidAmount;
  }

  const status: BidderStatus = won ? "won" : "lost";

  await update(id, {
    bidderStatus: status,
    currentPrice,
    isHighestBidder: won,
    nextCheckAt: new Date(Date.now() + 365 * 24 * 3600_000),
  });

  if (watched.bidCount > 0) {
    await finalizeBid(id, won ? "won" : "lost");
  }

  logger.info(`🟢 Auction settled — ${status}`, {
    id,
    title: watched.title,
    currentPrice,
    ourLastBid: watched.lastBidAmount,
    authoritative: authenticated && typeof detail?.HighestBidder === "boolean",
  });
}

// ─── Per-lot processing ────────────────────────────────────────────────────

async function processLot(watched: IWatchedProduct): Promise<void> {
  const id = String(watched._id);
  const now = Date.now();

  // A token makes HighestBidder trustworthy and is required to bid at all.
  const token = await ensureAuthToken();
  const authenticated = token != null;

  const detail = await getLotDetail(watched.productUrl, { authenticated });

  if (!detail) {
    // Transient API problem — retry on the normal cadence, don't lose the lot.
    const timeLeftMs = new Date(watched.auctionEndTime).getTime() - now;
    await update(id, {
      lastError: "Could not fetch lot detail",
      nextCheckAt: nextCheckFor(timeLeftMs),
    });
    logger.warn("🌕 Could not fetch lot detail", { id, title: watched.title });
    return;
  }

  // Trust the API's end date over our stored copy — it is what moves if the
  // platform extends a lot on a late bid.
  const apiEndTime = new Date(detail.EndDate);
  const endTimeChanged =
    Number.isFinite(apiEndTime.getTime()) &&
    apiEndTime.getTime() !== new Date(watched.auctionEndTime).getTime();

  if (endTimeChanged) {
    logger.info("🔵 Auction end time moved", {
      id,
      from: new Date(watched.auctionEndTime).toISOString(),
      to: apiEndTime.toISOString(),
    });
    watched.auctionEndTime = apiEndTime;
  }

  const endTimeMs = apiEndTime.getTime();
  const timeLeftMs = endTimeMs - now;
  const currentPrice = detail.CurrentBid ?? detail.StartingBid ?? null;

  // ── Closed ──────────────────────────────────────────────────────────────
  if (!isLotLive(detail.Status)) {
    await settleClosedLot(watched, detail, authenticated);
    return;
  }

  // Past its end time but the API hasn't flipped it yet — poll fast until it
  // does, then give up and settle on what we last saw.
  if (timeLeftMs <= 0) {
    if (timeLeftMs < -POST_CLOSE_GRACE_MS) {
      await settleClosedLot(watched, detail, authenticated);
      return;
    }
    await update(id, {
      currentPrice,
      auctionEndTime: apiEndTime,
      nextCheckAt: new Date(now + POLL_INTERVAL_SNIPE_MS),
    });
    return;
  }

  if (currentPrice === null) {
    await update(id, {
      lastError: "No price available from API",
      auctionEndTime: apiEndTime,
      nextCheckAt: nextCheckFor(timeLeftMs),
    });
    logger.warn("🌕 No current price available", { id, title: watched.title });
    return;
  }

  const { winning, authoritative } = resolveIsWinning(detail, watched.lastBidAmount, authenticated);

  // ── Outside the snipe window: watch only, never bid ─────────────────────
  if (timeLeftMs > SNIPE_WINDOW_MS) {
    await update(id, {
      bidderStatus: "waiting",
      currentPrice,
      isHighestBidder: authoritative ? winning : null,
      lastError: null,
      auctionEndTime: apiEndTime,
      nextCheckAt: nextCheckFor(timeLeftMs),
    });
    logger.debug("🟣 Outside snipe window", {
      id,
      minutesLeft: Math.round(timeLeftMs / 60_000),
      currentPrice,
    });
    return;
  }

  // ── Inside the snipe window ─────────────────────────────────────────────

  if (winning) {
    await update(id, {
      bidderStatus: "winning",
      currentPrice,
      isHighestBidder: authoritative ? true : null,
      lastError: null,
      auctionEndTime: apiEndTime,
      nextCheckAt: new Date(now + POLL_INTERVAL_SNIPE_MS),
    });
    logger.info("🟢 Holding high bid", {
      id,
      title: watched.title,
      currentPrice,
      secondsLeft: Math.round(timeLeftMs / 1000),
      authoritative,
    });
    return;
  }

  // The ladder is per-lot: it is generated by walking up from this lot's
  // StartingBid, so the amount has to be computed against that, not snapped.
  const increments = await getBidIncrements();
  const bidAmount = computeBidAmount(
    detail.StartingBid,
    currentPrice,
    watched.maxBid,
    increments,
    watched.minBid
  );

  if (bidAmount == null) {
    await update(id, {
      bidderStatus: "maxReached",
      currentPrice,
      isHighestBidder: false,
      lastError: null,
      auctionEndTime: apiEndTime,
      // Keep watching so the final won/lost outcome still gets recorded.
      nextCheckAt: new Date(now + POLL_INTERVAL_SNIPE_MS),
    });
    logger.info("🟡 Next increment exceeds max bid — standing down", {
      id,
      title: watched.title,
      currentPrice,
      maxBid: watched.maxBid,
    });
    return;
  }

  if (!authenticated) {
    await update(id, {
      bidderStatus: "error",
      currentPrice,
      lastError: "No auth token — cannot bid. Paste a fresh JWT in Settings.",
      auctionEndTime: apiEndTime,
      nextCheckAt: new Date(now + POLL_INTERVAL_SNIPE_MS),
    });
    logger.error("🔴 In snipe window but no auth token — cannot bid", {
      id,
      title: watched.title,
      secondsLeft: Math.round(timeLeftMs / 1000),
    });
    return;
  }

  // ── Place the bid ───────────────────────────────────────────────────────
  await update(id, { bidderStatus: "bidding", currentPrice, auctionEndTime: apiEndTime });

  logger.info("🔵 Sniping", {
    id,
    title: watched.title,
    currentPrice,
    bidAmount,
    maxBid: watched.maxBid,
    secondsLeft: Math.round(timeLeftMs / 1000),
  });

  const result = await placeBidApi(watched.externalId, bidAmount, watched.productUrl);
  const placedAmount = result.bidAmount ?? bidAmount;

  await logBid({
    watchedProductId: id,
    lotId: watched.externalId,
    auctionLotId: detail.AuctionLotId,
    productUrl: watched.productUrl,
    productTitle: watched.title,
    bidAmount: placedAmount,
    success: result.success,
    currentPriceAtBid: currentPrice,
    maxBid: watched.maxBid,
    auctionEndTime: apiEndTime,
    error: result.error,
    apiResponse: result.response,
  });

  if (result.success) {
    await update(id, {
      bidderStatus: "winning",
      lastBidAmount: placedAmount,
      lastBidAt: new Date(),
      currentPrice: placedAmount,
      isHighestBidder: true,
      lastError: null,
      nextCheckAt: new Date(Date.now() + POLL_INTERVAL_SNIPE_MS),
      $inc: { bidCount: 1 },
    });
    logger.info("🟢 Bid placed", { id, title: watched.title, bidAmount: placedAmount });
  } else {
    await update(id, {
      bidderStatus: "outbid",
      lastError: result.error ?? "Bid failed",
      // Retry quickly — in the snipe window every second counts.
      nextCheckAt: new Date(Date.now() + 5_000),
    });
    logger.warn("🌕 Bid failed", { id, title: watched.title, error: result.error });
  }
}

// ─── Scheduler ─────────────────────────────────────────────────────────────

/** Lots the scheduler should consider: not terminal, not long finished. */
function activeLotFilter() {
  return {
    bidderStatus: { $nin: [...TERMINAL_BIDDER_STATUSES, "idle"] },
    auctionEndTime: { $gt: new Date(Date.now() - POST_CLOSE_GRACE_MS - 60_000) },
  };
}

/**
 * How long a claimed lot is hidden from other workers while it is processed.
 * Long enough to cover a slow API round-trip, short enough that a crashed
 * worker's lots are picked back up quickly.
 */
const CLAIM_LEASE_MS = 45_000;

/**
 * Atomically take ownership of a due lot by pushing its `nextCheckAt` forward.
 * Only one worker can win the update, so running more than one PM2 instance
 * (ecosystem.config.js uses cluster mode) can never double-bid the same lot.
 * Returns null if someone else claimed it first.
 */
async function claimLot(id: string): Promise<IWatchedProduct | null> {
  return WatchedProduct.findOneAndUpdate(
    { _id: id, nextCheckAt: { $lte: new Date() } },
    { $set: { nextCheckAt: new Date(Date.now() + CLAIM_LEASE_MS) } },
    { new: true }
  );
}

async function tick(): Promise<void> {
  lastTickAt = new Date();
  await connectDB();

  const due = await WatchedProduct.find({
    ...activeLotFilter(),
    nextCheckAt: { $lte: new Date() },
  })
    .sort({ auctionEndTime: 1 }) // lots closing soonest get served first
    .limit(MAX_CONCURRENT * 4)
    .select("_id");

  const candidates = due.map((w) => String(w._id)).filter((id) => !inFlight.has(id));
  if (candidates.length === 0) return;

  logger.debug("🔵 Scheduler tick", { due: candidates.length });

  // Process in bounded batches so a burst of due lots can't stampede the API.
  for (let i = 0; i < candidates.length; i += MAX_CONCURRENT) {
    const batch = candidates.slice(i, i + MAX_CONCURRENT);
    await Promise.allSettled(
      batch.map(async (id) => {
        inFlight.add(id);
        try {
          const watched = await claimLot(id);
          // Another worker got there first — it owns this poll.
          if (!watched) return;
          await processLot(watched);
        } catch (err) {
          logger.error("🔴 Error processing lot", { id, err });
          await update(id, {
            bidderStatus: "error",
            lastError: err instanceof Error ? err.message : String(err),
            nextCheckAt: new Date(Date.now() + 30_000),
          }).catch(() => {});
        } finally {
          inFlight.delete(id);
        }
      })
    );
  }
}

/**
 * Start the scheduler. Safe to call repeatedly — subsequent calls are no-ops.
 */
export function startScheduler(): void {
  if (schedulerTimer) return;

  schedulerTimer = setInterval(() => {
    tick().catch((err) => logger.error("🔴 Scheduler tick failed", { err }));
  }, SCHEDULER_TICK_MS);

  // Don't hold the process open on shutdown.
  schedulerTimer.unref?.();

  logger.info("🟢 Bid scheduler started", {
    tickMs: SCHEDULER_TICK_MS,
    snipeWindowMinutes: SNIPE_WINDOW_MS / 60_000,
  });

  tick().catch((err) => logger.error("🔴 Initial scheduler tick failed", { err }));
}

export function stopScheduler(): void {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
  logger.info("🟢 Bid scheduler stopped");
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Put a watched lot under automated management and make sure the scheduler
 * is running. The lot is picked up on the next tick (within 5s).
 */
export async function startMonitor(watchedProductId: string): Promise<void> {
  await connectDB();
  await update(watchedProductId, {
    bidderStatus: "waiting",
    lastError: null,
    nextCheckAt: new Date(),
  });
  startScheduler();
  logger.info("🟢 Monitor started", { watchedProductId });
}

/** Pause automated management of a lot. */
export async function stopMonitor(watchedProductId: string): Promise<void> {
  await connectDB();
  await update(watchedProductId, { bidderStatus: "stopped" });
  logger.info("🟢 Monitor stopped", { watchedProductId });
}

/** Statuses for every lot under automated management. */
export async function getMonitorStatuses(): Promise<MonitorStatus[]> {
  await connectDB();
  const products = await WatchedProduct.find({
    bidderStatus: { $nin: ["idle"] },
  }).lean();

  const now = Date.now();
  return products.map((p) => {
    const timeLeftMs = new Date(p.auctionEndTime).getTime() - now;
    return {
      watchedProductId: String(p._id),
      bidderStatus: p.bidderStatus,
      lastBidAmount: p.lastBidAmount ?? null,
      lastBidAt: p.lastBidAt ? new Date(p.lastBidAt).toISOString() : null,
      currentPrice: p.currentPrice ?? null,
      isHighestBidder: p.isHighestBidder ?? null,
      bidCount: p.bidCount ?? 0,
      lastError: p.lastError ?? null,
      auctionEndTime: new Date(p.auctionEndTime).toISOString(),
      msUntilSnipeWindow: Math.max(0, timeLeftMs - SNIPE_WINDOW_MS),
    };
  });
}

/** Scheduler health, for the settings/diagnostics UI. */
export async function getSchedulerState(): Promise<SchedulerState> {
  await connectDB();
  const active = await WatchedProduct.find(activeLotFilter()).select("auctionEndTime").lean();
  const now = Date.now();

  return {
    running: schedulerTimer != null,
    activeLots: active.length,
    lotsInSnipeWindow: active.filter(
      (p) => new Date(p.auctionEndTime).getTime() - now <= SNIPE_WINDOW_MS
    ).length,
    lastTickAt: lastTickAt ? lastTickAt.toISOString() : null,
    snipeWindowMinutes: SNIPE_WINDOW_MS / 60_000,
  };
}
