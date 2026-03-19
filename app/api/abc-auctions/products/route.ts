import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import AuctionProduct from "@/models/AuctionProduct";
import { fetchAllLots, queryLots } from "@/lib/abc-auctions/api-scraper";
import logger from "@/lib/logger";

const ALLOWED_SORT_FIELDS = ["auctionEndTime", "currentPrice", "title", "lotNumber"] as const;
type SortField = (typeof ALLOWED_SORT_FIELDS)[number];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const search = searchParams.get("search");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "24"));

    // Category filter — accepts a single ?category= or multiple comma-separated ?categories=
    const categoriesParam = searchParams.get("categories");
    const singleCategory = searchParams.get("category");
    const categoryList = categoriesParam
      ? categoriesParam
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : singleCategory
        ? [singleCategory]
        : [];

    // Sort options
    const sortByRaw = searchParams.get("sortBy") ?? "auctionEndTime";
    const sortBy: SortField = ALLOWED_SORT_FIELDS.includes(sortByRaw as SortField)
      ? (sortByRaw as SortField)
      : "auctionEndTime";
    const sortDir = searchParams.get("sortOrder") === "desc" ? -1 : 1;

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
        if (categoryList.length > 0)
          filtered = filtered.filter((p) => categoryList.includes(p.category));
        if (endAfter)
          filtered = filtered.filter((p) => new Date(p.auctionEndTime) >= new Date(endAfter));
        if (endBefore)
          filtered = filtered.filter((p) => new Date(p.auctionEndTime) <= new Date(endBefore));
        if (!isNaN(minPrice)) filtered = filtered.filter((p) => p.currentPrice >= minPrice);
        if (!isNaN(maxPrice)) filtered = filtered.filter((p) => p.currentPrice <= maxPrice);

        // Sort results
        filtered.sort((a, b) => {
          const av = a[sortBy] ?? "";
          const bv = b[sortBy] ?? "";
          if (av < bv) return -sortDir;
          if (av > bv) return sortDir;
          return 0;
        });

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

    // ExternalIds filter — used by wishlist to fetch full product data for matched lots
    const externalIdsParam = searchParams.get("externalIds");
    const externalIdList = externalIdsParam
      ? externalIdsParam
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : [];

    const filter: Record<string, unknown> = {};
    if (externalIdList.length > 0) {
      filter.externalId = { $in: externalIdList };
    }
    if (categoryList.length === 1) {
      filter.category = categoryList[0];
    } else if (categoryList.length > 1) {
      filter.category = { $in: categoryList };
    }

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
      AuctionProduct.find(filter)
        .sort({ [sortBy]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
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
