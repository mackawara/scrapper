import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import logger from "@/lib/logger";
import WishlistProduct from "@/models/WishlistProduct";
import { createWishlistRegex } from "@/lib/abc-auctions/wishlist-matcher";

export async function GET() {
  try {
    await connectDB();
    const wishlist = await WishlistProduct.find()
      .sort({ hasMatch: -1, lastMatchAt: -1, createdAt: -1 })
      .lean();
    return NextResponse.json({ wishlist });
  } catch (err) {
    logger.error("🔴 GET /api/abc-auctions/wishlist failed", { err });
    return NextResponse.json({ error: "Failed to fetch wish list" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const query = String(body.query ?? "").trim();
    const regexPattern = String(body.regexPattern ?? "").trim();

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const effectivePattern = regexPattern || undefined;
    try {
      createWishlistRegex(query, effectivePattern);
    } catch {
      return NextResponse.json({ error: "Invalid regex pattern" }, { status: 400 });
    }

    const storedPattern = effectivePattern ?? "";

    const existing = await WishlistProduct.findOne({ query, regexPattern: storedPattern });
    if (existing) {
      return NextResponse.json({ error: "Wish list rule already exists" }, { status: 409 });
    }

    const wishlistItem = await WishlistProduct.create({
      query,
      regexPattern: storedPattern,
      isActive: true,
      hasMatch: false,
      matchCount: 0,
      latestMatches: [],
      lastCheckedAt: null,
      lastMatchAt: null,
    });

    logger.info("🟢 Added wish list rule", { query });
    return NextResponse.json({ wishlistItem }, { status: 201 });
  } catch (err) {
    logger.error("🔴 POST /api/abc-auctions/wishlist failed", { err });
    return NextResponse.json({ error: "Failed to add wish list rule" }, { status: 500 });
  }
}
