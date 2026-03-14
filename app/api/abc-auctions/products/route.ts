import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import AuctionProduct from "@/models/AuctionProduct";
import { scrapeAll } from "@/lib/abc-auctions/scraper";
import logger from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = req.nextUrl;
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "24"));
    const skip = (page - 1) * limit;

    const count = await AuctionProduct.countDocuments();
    if (count === 0) {
      logger.info("🟢 Cache empty — triggering scrape before responding");
      const scraped = await scrapeAll();
      await upsertProducts(scraped);
    }

    // Validate regex pattern before passing to MongoDB
    if (search) {
      try {
        new RegExp(search);
      } catch {
        return NextResponse.json({ error: "Invalid regex pattern" }, { status: 400 });
      }
    }

    const filter: Record<string, unknown> = {};
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { lotNumber: { $regex: search, $options: "i" } },
      ];
    }

    const [products, total] = await Promise.all([
      AuctionProduct.find(filter).skip(skip).limit(limit).lean(),
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
    const scraped = await scrapeAll();
    const { upserted } = await upsertProducts(scraped);
    return NextResponse.json({ scraped: scraped.length, upserted });
  } catch (err) {
    logger.error("🔴 POST /api/abc-auctions/products failed", { err });
    return NextResponse.json({ error: "Scrape failed" }, { status: 500 });
  }
}

async function upsertProducts(products: Awaited<ReturnType<typeof scrapeAll>>) {
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
