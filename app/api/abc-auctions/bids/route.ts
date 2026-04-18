import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import Bid from "@/models/Bid";
import logger from "@/lib/logger";

/**
 * GET /api/abc-auctions/bids
 * List all bids, optionally filtered by watchedProductId or status
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const watchedProductId = searchParams.get("watchedProductId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const query: Record<string, unknown> = {};
    if (watchedProductId) query.watchedProductId = watchedProductId;
    if (status) query.status = status;

    const bids = await Bid.find(query).sort({ createdAt: -1 }).limit(limit).lean();

    return NextResponse.json({ bids, total: bids.length });
  } catch (err) {
    logger.error("🔴 GET /api/abc-auctions/bids failed", { err });
    return NextResponse.json({ error: "Failed to fetch bids" }, { status: 500 });
  }
}
