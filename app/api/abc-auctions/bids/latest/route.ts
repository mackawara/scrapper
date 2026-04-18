import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import Bid from "@/models/Bid";
import WatchedProduct from "@/models/WatchedProduct";
import logger from "@/lib/logger";

interface BidStatusInfo {
  watchedProductId: string;
  externalId: string;
  latestBidStatus?: string; // winning, losing, overMax, failed, outbid
  latestBidAmount?: number;
  currentPrice?: number;
  maxBid?: number;
  isOutbid?: boolean;
  finalStatus?: string; // won, lost, tied
  lastBidAt?: string;
}

/**
 * GET /api/abc-auctions/bids/latest
 * Returns the latest bid status for each watched product
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    // Get all watched products
    const watched = await WatchedProduct.find({
      /* all */
    }).lean();

    // For each watched product, get the latest bid
    const bidStatusMap = new Map<string, BidStatusInfo>();

    for (const product of watched) {
      const latestBid = await Bid.findOne({ watchedProductId: product._id })
        .sort({ createdAt: -1 })
        .lean();

      bidStatusMap.set(product._id.toString(), {
        watchedProductId: product._id.toString(),
        externalId: product.externalId,
        latestBidStatus: latestBid?.status,
        latestBidAmount: latestBid?.bidAmount,
        currentPrice: latestBid?.currentPriceNow,
        maxBid: latestBid?.maxBid,
        isOutbid: latestBid?.isOutbid,
        finalStatus: latestBid?.finalStatus,
        lastBidAt: latestBid?.createdAt?.toISOString(),
      });
    }

    return NextResponse.json({
      bidStatuses: Array.from(bidStatusMap.values()),
      total: bidStatusMap.size,
    });
  } catch (err) {
    logger.error("🔴 GET /api/abc-auctions/bids/latest failed", { err });
    return NextResponse.json({ error: "Failed to fetch latest bid statuses" }, { status: 500 });
  }
}
