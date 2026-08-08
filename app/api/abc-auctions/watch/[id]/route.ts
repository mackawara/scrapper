import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import WatchedProduct from "@/models/WatchedProduct";
import { startScheduler, stopMonitor } from "@/lib/abc-auctions/bidder";
import logger from "@/lib/logger";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;
    const { minBid, maxBid } = await req.json();

    if (maxBid != null && maxBid <= 0) {
      return NextResponse.json({ error: "maxBid must be greater than 0" }, { status: 400 });
    }
    if (minBid != null && maxBid != null && maxBid < minBid) {
      return NextResponse.json({ error: "maxBid must be >= minBid" }, { status: 400 });
    }

    const existing = await WatchedProduct.findById(id);
    if (!existing) return NextResponse.json({ error: "Watch entry not found" }, { status: 404 });

    const auctionOver = new Date(existing.auctionEndTime).getTime() <= Date.now();
    const effectiveMax = maxBid ?? existing.maxBid;

    /**
     * A workable ceiling is the only thing a lot needs to be biddable, so
     * saving one also arms monitoring. That covers a lot we'd already given up
     * on (`maxReached`, ceiling raised), one that was never monitored, and one
     * left in `error`. Either way it takes effect on the next tick rather than
     * the next poll. "stopped" is deliberately excluded — that pause was the
     * user's decision, and Start on the watch list undoes it.
     */
    const reArm =
      !auctionOver &&
      effectiveMax > 0 &&
      (existing.bidderStatus === "idle" ||
        existing.bidderStatus === "error" ||
        (existing.bidderStatus === "maxReached" && maxBid != null && maxBid > existing.maxBid));

    const updated = await WatchedProduct.findByIdAndUpdate(
      id,
      {
        ...(minBid != null && { minBid }),
        ...(maxBid != null && { maxBid }),
        ...(reArm && { bidderStatus: "waiting", lastError: null }),
        nextCheckAt: new Date(),
      },
      { new: true }
    );

    if (reArm) {
      startScheduler();
      logger.info("🟢 Re-armed watched lot after bid limits changed", {
        id,
        from: existing.bidderStatus,
        maxBid: effectiveMax,
      });
    }

    return NextResponse.json({ watched: updated, monitoring: reArm });
  } catch (err) {
    logger.error("🔴 PUT /api/abc-auctions/watch/[id] failed", { err });
    return NextResponse.json({ error: "Failed to update watch" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;

    const watched = await WatchedProduct.findById(id);
    if (!watched) return NextResponse.json({ error: "Watch entry not found" }, { status: 404 });

    // Take the lot out of the scheduler before deleting it
    await stopMonitor(id);
    await WatchedProduct.findByIdAndDelete(id);

    logger.info("🟢 Removed from watch list", { id });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    logger.error("🔴 DELETE /api/abc-auctions/watch/[id] failed", { err });
    return NextResponse.json({ error: "Failed to delete watch" }, { status: 500 });
  }
}
