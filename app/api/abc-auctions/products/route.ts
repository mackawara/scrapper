import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import AuctionProduct from "@/models/AuctionProduct";
import { fetchAllLots, queryLots } from "@/lib/abc-auctions/api-scraper";
import logger from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "24"));

    // Date filters
    const endAfter = searchParams.get("endAfter");
    const endBefore = searchParams.get("endBefore");

    // Price filters
    const minPrice = parseFloat(searchParams.get("minPrice") ?? "");
    const maxPrice = parseFloat(searchParams.get("maxPrice") ?? "");

    // ── Live search: query ABC API directly ──────────────────────────
    if (search) {
      try {
        const { products, total } = await queryLots(search, limit);

        // Apply client-side filters for API results
        let filtered = products;
        if (category) filtered = filtered.filter((p) => p.category === category);
        if (endAfter)
          filtered = filtered.filter((p) => new Date(p.auctionEndTime) >= new Date(endAfter));
        if (endBefore)
          filtered = filtered.filter((p) => new Date(p.auctionEndTime) <= new Date(endBefore));
        if (!isNaN(minPrice)) filtered = filtered.filter((p) => p.currentPrice >= minPrice);
        if (!isNaN(maxPrice)) filtered = filtered.filter((p) => p.currentPrice <= maxPrice);

        return NextResponse.json({
          products: filtered,
          total: filtered.length !== products.length ? filtered.length : total,
          page: 1,
          limit,
        });
      } catch (err) {
        logger.error("🔴 Live search failed, falling back to DB", { err });
        // Fall through to DB query below
      }
    }

    // ── Default: serve from MongoDB cache ────────────────────────────
    await connectDB();
    const skip = (page - 1) * limit;

    const count = await AuctionProduct.countDocuments();
    if (count === 0) {
      logger.info("🟢 Cache empty — triggering scrape before responding");
      const scraped = await fetchAllLots();
      await upsertProducts(scraped);
    }

    const filter: Record<string, unknown> = {};
    if (category) filter.category = category;

    // Date range filter
    if (endAfter || endBefore) {
      filter.auctionEndTime = {};
      if (endAfter) (filter.auctionEndTime as Record<string, unknown>).$gte = new Date(endAfter);
      if (endBefore) (filter.auctionEndTime as Record<string, unknown>).$lte = new Date(endBefore);
    }

    // Price range filter
    if (!isNaN(minPrice) || !isNaN(maxPrice)) {
      filter.currentPrice = {};
      if (!isNaN(minPrice)) (filter.currentPrice as Record<string, unknown>).$gte = minPrice;
      if (!isNaN(maxPrice)) (filter.currentPrice as Record<string, unknown>).$lte = maxPrice;
    }

    const [products, total] = await Promise.all([
      AuctionProduct.find(filter).sort({ auctionEndTime: 1 }).skip(skip).limit(limit).lean(),
      AuctionProduct.countDocuments(filter),
    ]);

    return NextResponse.json({ products, total, page, limit });
  } catch (err) {
    logger.error("🔴 GET /api/abc-auctions/products failed", { err });
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

export async function POST() {
  try {
    await connectDB();
    const scraped = await fetchAllLots();
    const { upserted } = await upsertProducts(scraped);
    return NextResponse.json({ scraped: scraped.length, upserted });
  } catch (err) {
    logger.error("🔴 POST /api/abc-auctions/products failed", { err });
    return NextResponse.json({ error: "Scrape failed" }, { status: 500 });
  }
}

async function upsertProducts(products: Awaited<ReturnType<typeof fetchAllLots>>) {
  let upserted = 0;
  for (const p of products) {
    await AuctionProduct.findOneAndUpdate(
      { externalId: p.externalId },
      { ...p, scrapedAt: new Date() },
      { upsert: true, new: true }
    );
    upserted++;
  }
  return { upserted };
}
