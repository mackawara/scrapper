import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import Bid from "@/models/Bid";
import logger from "@/lib/logger";

/**
 * GET /api/abc-auctions/bids/stats
 * Get bid statistics for a watched product
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const watchedProductId = searchParams.get("watchedProductId");

    if (!watchedProductId) {
      return NextResponse.json(
        { error: "watchedProductId is required" },
        { status: 400 }
      );
    }

    const [winning, losing, overMax, failed, total] = await Promise.all([
      Bid.countDocuments({ watchedProductId, status: "winning" }),
      Bid.countDocuments({ watchedProductId, status: "losing" }),
      Bid.countDocuments({ watchedProductId, status: "overMax" }),
      Bid.countDocuments({ watchedProductId, status: "failed" }),
      Bid.countDocuments({ watchedProductId }),
    ]);

    const latestBid = await Bid.findOne({ watchedProductId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      stats: {
        total,
        winning,
        losing,
        overMax,
        failed,
        currentStatus: latestBid?.status,
        latestBidAmount: latestBid?.bidAmount,
        latestBidAt: latestBid?.createdAt,
        maxBid: latestBid?.maxBid,
        isOutbid: latestBid?.isOutbid,
        currentPriceNow: latestBid?.currentPriceNow,
      },
    });
  } catch (err) {
    logger.error("🔴 GET /api/abc-auctions/bids/stats failed", { err });
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
