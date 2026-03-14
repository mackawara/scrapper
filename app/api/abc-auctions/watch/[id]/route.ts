import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import WatchedProduct from "@/models/WatchedProduct";
import { stopMonitor } from "@/lib/abc-auctions/bidder";
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

    const updated = await WatchedProduct.findByIdAndUpdate(
      id,
      { ...(minBid != null && { minBid }), ...(maxBid != null && { maxBid }) },
      { new: true }
    );

    if (!updated) return NextResponse.json({ error: "Watch entry not found" }, { status: 404 });

    return NextResponse.json({ watched: updated });
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

    // Stop any running bidder loop before deleting
    stopMonitor(id);
    await WatchedProduct.findByIdAndDelete(id);

    logger.info("🟢 Removed from watch list", { id });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    logger.error("🔴 DELETE /api/abc-auctions/watch/[id] failed", { err });
    return NextResponse.json({ error: "Failed to delete watch" }, { status: 500 });
  }
}
