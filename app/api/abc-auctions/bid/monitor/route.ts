import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import WatchedProduct from "@/models/WatchedProduct";
import { startMonitor, stopMonitor, getMonitorStatuses } from "@/lib/abc-auctions/bidder";
import logger from "@/lib/logger";

export async function GET() {
  const statuses = getMonitorStatuses();
  return NextResponse.json({ monitors: statuses });
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { watchedProductId, action } = await req.json();

    if (!watchedProductId) {
      return NextResponse.json({ error: "watchedProductId is required" }, { status: 400 });
    }

    const watched = await WatchedProduct.findById(watchedProductId);
    if (!watched) {
      return NextResponse.json({ error: "Watched product not found" }, { status: 404 });
    }

    if (action === "stop") {
      stopMonitor(watchedProductId);
      logger.info("🟢 Stop signal sent", { watchedProductId });
      return NextResponse.json({ status: "stop_requested" });
    }

    // Default: start
    if (watched.maxBid <= 0) {
      return NextResponse.json({ error: "maxBid must be greater than 0 to start monitor" }, { status: 400 });
    }

    startMonitor(watchedProductId);

    const timeLeft = new Date(watched.auctionEndTime).getTime() - Date.now();
    const bidderStatus = timeLeft > 11 * 60 * 1000 ? "waiting" : "active";

    logger.info("🟢 Monitor started", { watchedProductId, bidderStatus });
    return NextResponse.json({ status: "started", bidderStatus });
  } catch (err) {
    logger.error("🔴 POST /api/abc-auctions/bid/monitor failed", { err });
    return NextResponse.json({ error: "Failed to start monitor" }, { status: 500 });
  }
}
