import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import WatchedProduct from "@/models/WatchedProduct";
import logger from "@/lib/logger";

export async function GET() {
  try {
    await connectDB();
    const watched = await WatchedProduct.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ watched });
  } catch (err) {
    logger.error("🔴 GET /api/abc-auctions/watch failed", { err });
    return NextResponse.json({ error: "Failed to fetch watch list" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { externalId, productUrl, title, imageUrl, auctionEndTime, minBid = 0, maxBid } = body;
    const normalizedExternalId = String(externalId ?? "").trim();

    if (!normalizedExternalId || !productUrl || !title || !auctionEndTime || maxBid == null) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!/^\d+$/.test(normalizedExternalId)) {
      return NextResponse.json({ error: "externalId must be a numeric bid id" }, { status: 400 });
    }
    if (maxBid <= 0) {
      return NextResponse.json({ error: "maxBid must be greater than 0" }, { status: 400 });
    }
    if (maxBid < minBid) {
      return NextResponse.json({ error: "maxBid must be >= minBid" }, { status: 400 });
    }

    const existing = await WatchedProduct.findOne({ externalId: normalizedExternalId });
    if (existing) {
      return NextResponse.json({ error: "Product already being watched" }, { status: 409 });
    }

    const watched = await WatchedProduct.create({
      externalId: normalizedExternalId,
      productUrl,
      title,
      imageUrl: imageUrl ?? "",
      auctionEndTime: new Date(auctionEndTime),
      minBid,
      maxBid,
      bidderStatus: "idle",
    });

    logger.info("🟢 Added to watch list", { externalId: normalizedExternalId, title });
    return NextResponse.json({ watched }, { status: 201 });
  } catch (err) {
    logger.error("🔴 POST /api/abc-auctions/watch failed", { err });
    return NextResponse.json({ error: "Failed to add watch" }, { status: 500 });
  }
}
