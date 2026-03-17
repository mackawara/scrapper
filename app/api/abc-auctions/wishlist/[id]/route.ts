import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import logger from "@/lib/logger";
import WishlistProduct from "@/models/WishlistProduct";
import { createWishlistRegex } from "@/lib/abc-auctions/wishlist-matcher";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await req.json();

    const query = body.query != null ? String(body.query).trim() : undefined;
    const regexPattern = body.regexPattern != null ? String(body.regexPattern).trim() : undefined;
    const isActive = body.isActive != null ? Boolean(body.isActive) : undefined;

    if (query != null && !query) {
      return NextResponse.json({ error: "query cannot be empty" }, { status: 400 });
    }

    const current = await WishlistProduct.findById(id);
    if (!current) {
      return NextResponse.json({ error: "Wish list rule not found" }, { status: 404 });
    }

    const nextQuery = query ?? current.query;
    const nextRegexPattern = regexPattern ?? current.regexPattern;

    try {
      createWishlistRegex(nextQuery, nextRegexPattern || undefined);
    } catch {
      return NextResponse.json({ error: "Invalid regex pattern" }, { status: 400 });
    }

    const resetMatches = query != null || regexPattern != null;

    const updated = await WishlistProduct.findByIdAndUpdate(
      id,
      {
        ...(query != null && { query }),
        ...(regexPattern != null && { regexPattern }),
        ...(isActive != null && { isActive }),
        ...(resetMatches && {
          hasMatch: false,
          matchCount: 0,
          latestMatches: [],
          lastMatchAt: null,
          lastCheckedAt: null,
        }),
      },
      { new: true }
    );

    return NextResponse.json({ wishlistItem: updated });
  } catch (err) {
    logger.error("🔴 PUT /api/abc-auctions/wishlist/[id] failed", { err });
    return NextResponse.json({ error: "Failed to update wish list rule" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;
    const deleted = await WishlistProduct.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ error: "Wish list rule not found" }, { status: 404 });
    }
    logger.info("🟢 Removed wish list rule", { id });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    logger.error("🔴 DELETE /api/abc-auctions/wishlist/[id] failed", { err });
    return NextResponse.json({ error: "Failed to delete wish list rule" }, { status: 500 });
  }
}
