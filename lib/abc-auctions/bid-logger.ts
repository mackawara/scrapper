/**
 * Bid Logging Service
 *
 * Logs all bid attempts to MongoDB for tracking and analysis.
 * Monitors winning/losing/overMax status.
 */

import connectDB from "@/lib/mongoose";
import Bid from "@/models/Bid";
import logger from "@/lib/logger";
import { getCurrentPrice } from "./api-client";

export interface LogBidParams {
  watchedProductId: string;
  lotId: string;
  auctionLotId: number;
  productUrl: string;
  productTitle?: string;
  bidAmount: number;
  success: boolean;
  currentPriceAtBid: number;
  maxBid: number;
  auctionEndTime: Date;
  error?: string;
  apiResponse?: unknown;
}

/**
 * Log a bid attempt to the Bids collection.
 */
export async function logBid(params: LogBidParams): Promise<void> {
  await connectDB();

  try {
    // Determine status based on bid result
    let status: "winning" | "losing" | "overMax" | "failed";

    if (!params.success) {
      status = "failed";
    } else if (params.bidAmount >= params.maxBid) {
      status = "overMax";
    } else {
      status = "winning"; // Assume winning unless we detect otherwise
    }

    const bid = await Bid.create({
      watchedProductId: params.watchedProductId,
      lotId: params.lotId,
      auctionLotId: params.auctionLotId,
      productUrl: params.productUrl,
      productTitle: params.productTitle,
      bidAmount: params.bidAmount,
      success: params.success,
      status,
      currentPriceAtBid: params.currentPriceAtBid,
      maxBid: params.maxBid,
      auctionEndTime: params.auctionEndTime,
      error: params.error,
      apiResponse: params.apiResponse,
    });

    logger.info("🔵 Bid logged", {
      bidId: bid._id,
      watchedProductId: params.watchedProductId,
      status,
      bidAmount: params.bidAmount,
    });
  } catch (err) {
    logger.error("🔴 Failed to log bid", { err, params });
  }
}

/**
 * Check if we're still winning on all our bids for a watched product.
 * A bid is "winning" if currentPrice <= lastBidAmount.
 * Returns true if winning, false if outbid.
 */
export async function isWinning(
  watchedProductId: string,
  productUrl: string
): Promise<boolean> {
  await connectDB();

  try {
    // Get the latest successful bid for this product
    const latestBid = await Bid.findOne({
      watchedProductId,
      success: true,
      status: { $in: ["winning", "losing", "overMax"] },
    }).sort({ createdAt: -1 });

    if (!latestBid) {
      logger.debug("🔵 No previous bids found", { watchedProductId });
      return true; // No bids = not losing
    }

    // Fetch current price
    const currentPrice = await getCurrentPrice(productUrl);
    if (currentPrice === null) {
      logger.warn("🌕 Could not fetch current price for winning check", {
        watchedProductId,
      });
      return latestBid.status === "winning";
    }

    // Update the bid record with current price
    await Bid.findByIdAndUpdate(latestBid._id, {
      currentPriceNow: currentPrice,
    });

    // Check if we're still winning
    const stillWinning = currentPrice <= (latestBid.bidAmount ?? 0);

    if (!stillWinning) {
      // Mark as outbid
      await Bid.findByIdAndUpdate(latestBid._id, {
        status: "losing",
        isOutbid: true,
        outbidAt: new Date(),
        outbidBy: currentPrice - (latestBid.bidAmount ?? 0),
      });

      logger.info("🟡 Outbid detected", {
        watchedProductId,
        ourBid: latestBid.bidAmount,
        currentPrice,
        outbidBy: currentPrice - (latestBid.bidAmount ?? 0),
      });
    }

    return stillWinning;
  } catch (err) {
    logger.error("🔴 Failed to check winning status", { err, watchedProductId });
    return false;
  }
}

/**
 * Get all bids for a watched product (for the UI).
 */
export async function getBidsForProduct(watchedProductId: string) {
  await connectDB();
  return await Bid.find({ watchedProductId }).sort({ createdAt: -1 }).limit(100);
}

/**
 * Get bid statistics for a watched product.
 */
export async function getBidStats(watchedProductId: string) {
  await connectDB();

  const [winning, losing, overMax, failed] = await Promise.all([
    Bid.countDocuments({ watchedProductId, status: "winning" }),
    Bid.countDocuments({ watchedProductId, status: "losing" }),
    Bid.countDocuments({ watchedProductId, status: "overMax" }),
    Bid.countDocuments({ watchedProductId, status: "failed" }),
  ]);

  const total = winning + losing + overMax + failed;
  const latestBid = await Bid.findOne({ watchedProductId }).sort({
    createdAt: -1,
  });

  return {
    total,
    winning,
    losing,
    overMax,
    failed,
    currentStatus: latestBid?.status,
    latestBidAmount: latestBid?.bidAmount,
    latestBidAt: latestBid?.createdAt,
  };
}

/**
 * Mark a bid as final (auction ended).
 */
export async function finalizeBid(
  watchedProductId: string,
  finalStatus: "won" | "lost" | "tied"
): Promise<void> {
  await connectDB();

  const latestBid = await Bid.findOne({ watchedProductId }).sort({
    createdAt: -1,
  });

  if (latestBid) {
    await Bid.findByIdAndUpdate(latestBid._id, {
      finalStatus,
      auctionEndedAt: new Date(),
    });

    logger.info("🟢 Bid finalized", {
      watchedProductId,
      finalStatus,
    });
  }
}
