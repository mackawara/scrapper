import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import WatchedProduct from "@/models/WatchedProduct";
import {
  startMonitor,
  stopMonitor,
  getMonitorStatuses,
  getSchedulerState,
} from "@/lib/abc-auctions/bidder";
import { getTokenInfoAsync } from "@/lib/abc-auctions/api-client";
import logger from "@/lib/logger";

export async function GET() {
  const [monitors, scheduler, tokenInfo] = await Promise.all([
    getMonitorStatuses(),
    getSchedulerState(),
    getTokenInfoAsync(),
  ]);
  return NextResponse.json({ monitors, scheduler, tokenInfo });
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
      await stopMonitor(watchedProductId);
      return NextResponse.json({ status: "stopped" });
    }

    if (watched.maxBid <= 0) {
      return NextResponse.json(
        { error: "maxBid must be greater than 0 to start monitor" },
        { status: 400 }
      );
    }

    await startMonitor(watchedProductId);

    // Starting a monitor with no token means it will watch but never bid —
    // say so now rather than failing silently at the wire.
    const tokenInfo = await getTokenInfoAsync();

    return NextResponse.json({
      status: "started",
      bidderStatus: "waiting",
      tokenInfo,
      ...(!tokenInfo.hasToken && {
        warning: "No auth token set — this lot will be watched but no bid can be placed.",
      }),
    });
  } catch (err) {
    logger.error("🔴 POST /api/abc-auctions/bid/monitor failed", { err });
    return NextResponse.json({ error: "Failed to update monitor" }, { status: 500 });
  }
}
