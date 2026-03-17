/**
 * ABC Auctions Bidder
 *
 * Monitors watched products and places bids using direct API calls.
 * No Puppeteer needed — uses the api-client module for auth and bidding.
 */

import connectDB from "@/lib/mongoose";
import WatchedProduct from "@/models/WatchedProduct";
import logger from "@/lib/logger";
import { BidderStatus, MonitorStatus } from "./types";
import {
  TWENTY_FOUR_HOURS_MS,
  TEN_MINUTES_MS,
  POLL_INTERVAL_WAITING_MS,
  POLL_INTERVAL_EARLY_BID_MS,
  POLL_INTERVAL_FINAL_BID_MS,
} from "./constants";
import {
  getCurrentPrice,
  placeBidApi,
  getAuthToken,
  getTokenInfo,
  computeBidAmount,
  getAuctionLotId,
} from "./api-client";
import {
  logBid,
  isWinning,
  finalizeBid,
} from "./bid-logger";

// ─── In-memory state ─────────────────────────────────────────────────────────

const stopSignals = new Map<string, boolean>();
const monitorStatuses = new Map<string, MonitorStatus>();

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function updateStatus(
  id: string,
  status: BidderStatus,
  extra?: Partial<MonitorStatus>
) {
  await connectDB();
  await WatchedProduct.findByIdAndUpdate(id, {
    bidderStatus: status,
    ...(extra?.lastBidAmount != null && { lastBidAmount: extra.lastBidAmount }),
    ...(extra?.lastBidAt != null && { lastBidAt: extra.lastBidAt }),
  });
  monitorStatuses.set(id, {
    ...(monitorStatuses.get(id) ?? {}),
    watchedProductId: id,
    bidderStatus: status,
    lastBidAmount: extra?.lastBidAmount ?? null,
    lastBidAt: extra?.lastBidAt ?? null,
    ...extra,
  });
}

// ─── Credential / token check ────────────────────────────────────────────────

/**
 * Check if we have a valid auth token for bidding.
 */
export function hasBidderCredentials(): boolean {
  return getAuthToken() !== null;
}

/**
 * Check if the auth token has enough time left for bidding.
 * Returns false if the token will expire within 1 hour.
 */
export function hasValidToken(): boolean {
  const info = getTokenInfo();
  return info.hasToken && !info.isExpired && (info.expiresInHours ?? 0) > 1;
}

// ─── Manual bid (one-shot) ───────────────────────────────────────────────────

/**
 * Place a single manual bid via the API.
 * No browser needed — calls the bid API directly with the stored JWT.
 */
export async function placeManualBid(
  productUrl: string,
  amount: number
): Promise<boolean> {
  const result = await placeBidApi(productUrl, amount);
  if (!result.success) {
    logger.warn("🌕 Manual bid failed", {
      productUrl,
      amount,
      error: result.error,
    });
  }
  return result.success;
}

// ─── Monitor loop ────────────────────────────────────────────────────────────

async function monitorLoop(id: string): Promise<void> {
  logger.info("🟢 Monitor loop started", { id });

  while (true) {
    if (stopSignals.get(id)) {
      logger.info("🟢 Stop signal received", { id });
      await updateStatus(id, "stopped");
      stopSignals.delete(id);
      monitorStatuses.delete(id);
      return;
    }

    await connectDB();
    const watched = await WatchedProduct.findById(id);
    if (!watched) {
      logger.warn("🌕 Watched product not found, stopping monitor", { id });
      return;
    }

    const now = Date.now();
    const endTime = new Date(watched.auctionEndTime).getTime();
    const timeLeft = endTime - now;

    // Auction already over
    if (timeLeft <= 0) {
      const currentPrice = await getCurrentPrice(watched.productUrl);
      const status: BidderStatus =
        currentPrice != null &&
        watched.lastBidAmount != null &&
        currentPrice <= watched.lastBidAmount
          ? "won"
          : "outbid";
      await updateStatus(id, status);

      // Log final result to Bids collection
      await finalizeBid(id, status === "won" ? "won" : "lost");

      logger.info(`🟢 Auction ended — status: ${status}`, { id, currentPrice });
      monitorStatuses.delete(id);
      return;
    }

    // More than 24 hours left — keep waiting
    if (timeLeft > TWENTY_FOUR_HOURS_MS) {
      await updateStatus(id, "waiting");
      logger.debug("🟣 Waiting for auction window", {
        id,
        minutesLeft: Math.round(timeLeft / 60000),
      });
      await sleep(POLL_INTERVAL_WAITING_MS);
      continue;
    }

    // Within 24 hours — get current price via API
    const currentPrice = await getCurrentPrice(watched.productUrl);

    if (currentPrice === null) {
      logger.warn("🌕 Could not read current price, retrying", { id });
      const pollInterval =
        timeLeft <= TEN_MINUTES_MS
          ? POLL_INTERVAL_FINAL_BID_MS
          : POLL_INTERVAL_EARLY_BID_MS;
      await sleep(pollInterval);
      continue;
    }

    // In the last 10 minutes: check if we're still winning
    // If not, aggressively bid to regain winning status
    if (timeLeft <= TEN_MINUTES_MS && watched.lastBidAmount != null) {
      const stillWinning = await isWinning(id, watched.productUrl);
      if (!stillWinning) {
        logger.info("🟡 Outbid in final 10min — preparing counter-bid", {
          id,
          ourBid: watched.lastBidAmount,
          currentPrice,
        });
      }
    }

    if (currentPrice >= watched.maxBid) {
      logger.info("🟢 Price reached maxBid — stopping", {
        id,
        currentPrice,
        maxBid: watched.maxBid,
      });
      await updateStatus(id, "stopped");
      monitorStatuses.delete(id);
      return;
    }

    // Decision: should we bid?
    const isFinalWindow = timeLeft <= TEN_MINUTES_MS;
    const hasPlacedEarlyBid = watched.lastBidAmount != null;
    const isOutbid =
      watched.lastBidAmount != null && currentPrice > watched.lastBidAmount;

    const shouldPlaceEarlyBid =
      !isFinalWindow && !hasPlacedEarlyBid && currentPrice >= watched.minBid;
    const shouldPlaceRecursiveBid =
      isFinalWindow &&
      currentPrice >= watched.minBid &&
      (!hasPlacedEarlyBid || isOutbid);

    if (shouldPlaceEarlyBid || shouldPlaceRecursiveBid) {
      // Compute the next valid bid amount using increment tiers
      const bidAmount = computeBidAmount(currentPrice, watched.maxBid);

      if (bidAmount === null) {
        logger.info("🟢 Next valid bid exceeds maxBid — stopping", {
          id,
          currentPrice,
          maxBid: watched.maxBid,
        });
        await updateStatus(id, "stopped");
        monitorStatuses.delete(id);
        return;
      }

      await updateStatus(id, "active");

      // Check we have a valid token before trying to bid
      if (!getAuthToken()) {
        logger.warn(
          "🌕 No valid auth token — cannot bid. Provide a token via /api/abc-auctions/auth/token",
          { id }
        );
        // Don't stop the monitor — keep polling, maybe the user will add a token
        await sleep(POLL_INTERVAL_EARLY_BID_MS);
        continue;
      }

      const result = await placeBidApi(watched.productUrl, bidAmount);
      const auctionLotId = await getAuctionLotId(watched.productUrl);

      if (result.success) {
        const actualAmount = result.bidAmount ?? bidAmount;
        const bidTime = new Date().toISOString();
        await updateStatus(id, "active", {
          lastBidAmount: actualAmount,
          lastBidAt: bidTime,
        });

        // Log successful bid
        if (auctionLotId) {
          await logBid({
            watchedProductId: id,
            lotId: (watched as any).externalId || "",
            auctionLotId,
            productUrl: watched.productUrl,
            productTitle: watched.title,
            bidAmount: actualAmount,
            success: true,
            currentPriceAtBid: currentPrice,
            maxBid: watched.maxBid,
            auctionEndTime: new Date(watched.auctionEndTime),
            apiResponse: result.response,
          });
        }

        logger.info("🟢 Bid placed via API", {
          id,
          bidAmount: actualAmount,
          response: result.response,
        });
      } else {
        // Log failed bid
        if (auctionLotId) {
          await logBid({
            watchedProductId: id,
            lotId: (watched as any).externalId || "",
            auctionLotId,
            productUrl: watched.productUrl,
            productTitle: watched.title,
            bidAmount,
            success: false,
            currentPriceAtBid: currentPrice,
            maxBid: watched.maxBid,
            auctionEndTime: new Date(watched.auctionEndTime),
            error: result.error,
          });
        }

        logger.warn("🌕 Bid failed via API — re-fetching price for retry", {
          id,
          bidAmount,
          error: result.error,
        });

        // Re-fetch the actual current price so the next iteration
        // computes a correct bid amount (price may have changed).
        const freshPrice = await getCurrentPrice(watched.productUrl);
        if (freshPrice !== null && freshPrice !== currentPrice) {
          logger.info("🔵 Price changed since last check", {
            id,
            stalePrice: currentPrice,
            freshPrice,
          });
        }

        // Short sleep then immediately retry with fresh price
        await sleep(isFinalWindow ? 3_000 : 10_000);
        continue;
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

    const pollInterval = isFinalWindow
      ? POLL_INTERVAL_FINAL_BID_MS
      : POLL_INTERVAL_EARLY_BID_MS;
    await sleep(pollInterval);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public exports ──────────────────────────────────────────────────────────

export function startMonitor(watchedProductId: string): void {
  if (monitorStatuses.has(watchedProductId)) {
    logger.warn("🌕 Monitor already running", { watchedProductId });
    return;
  }
  stopSignals.set(watchedProductId, false);
  monitorStatuses.set(watchedProductId, {
    watchedProductId,
    bidderStatus: "waiting",
    lastBidAmount: null,
    lastBidAt: null,
  });
  monitorLoop(watchedProductId).catch((err) => {
    logger.error("🔴 Monitor loop crashed", { watchedProductId, err });
    monitorStatuses.delete(watchedProductId);
  });
}

export function stopMonitor(watchedProductId: string): void {
  stopSignals.set(watchedProductId, true);
}

export function getMonitorStatuses(): MonitorStatus[] {
  return Array.from(monitorStatuses.values());
}
