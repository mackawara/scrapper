import { NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import AuctionProduct from "@/models/AuctionProduct";
import logger from "@/lib/logger";

export async function GET() {
  try {
    await connectDB();
    const results = await AuctionProduct.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const categories = results.map((r) => ({ name: r._id as string, count: r.count as number }));
    return NextResponse.json({ categories });
  } catch (err) {
    logger.error("🔴 GET /api/abc-auctions/categories failed", { err });
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}
