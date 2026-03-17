import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import logger from "@/lib/logger";
import WishlistProduct from "@/models/WishlistProduct";
import AuctionProduct from "@/models/AuctionProduct";
import { createWishlistRegex } from "@/lib/abc-auctions/wishlist-matcher";
import { fetchAllLots } from "@/lib/abc-auctions/api-scraper";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const force = Boolean(body.force);
    const staleBefore = new Date(Date.now() - DAY_MS);

    const filter: Record<string, unknown> = { isActive: true };
    if (!force) {
      filter.$or = [
        { lastCheckedAt: null },
        { lastCheckedAt: { $exists: false } },
        { lastCheckedAt: { $lt: staleBefore } },
      ];
    }

    const toCheck = await WishlistProduct.find(filter).lean();
    if (toCheck.length === 0) {
      return NextResponse.json({
        checked: 0,
        matchedRules: 0,
        refreshedProducts: 0,
        upsertedProducts: 0,
        skipped: true,
      });
    }

    const scraped = await fetchAllLots();
    const { upserted } = await upsertProducts(scraped);

    const products = await AuctionProduct.find().lean();
    const now = new Date();

    let matchedRules = 0;

    for (const rule of toCheck) {
      let regex: RegExp;
      try {
        regex = createWishlistRegex(rule.query, rule.regexPattern || undefined);
      } catch {
        await WishlistProduct.findByIdAndUpdate(rule._id, {
          hasMatch: false,
          matchCount: 0,
          latestMatches: [],
          lastCheckedAt: now,
        });
        continue;
      }

      const matches = products
        .filter((product) => {
          const haystack = `${product.title} ${product.category} ${product.lotNumber} ${product.productUrl}`;
          return regex.test(haystack);
        })
        .sort(
          (a, b) => new Date(a.auctionEndTime).getTime() - new Date(b.auctionEndTime).getTime()
        );

      const hasMatch = matches.length > 0;
      if (hasMatch) matchedRules++;

      await WishlistProduct.findByIdAndUpdate(rule._id, {
        hasMatch,
        matchCount: matches.length,
        latestMatches: matches.map((product) => ({
          externalId: product.externalId,
          title: product.title,
          productUrl: product.productUrl,
          imageUrl: product.imageUrl,
          currentPrice: product.currentPrice,
          auctionEndTime: product.auctionEndTime,
        })),
        lastCheckedAt: now,
        ...(hasMatch ? { lastMatchAt: now } : { lastMatchAt: null }),
      });
    }

    return NextResponse.json({
      checked: toCheck.length,
      matchedRules,
      refreshedProducts: scraped.length,
      upsertedProducts: upserted,
    });
  } catch (err) {
    logger.error("🔴 POST /api/abc-auctions/wishlist/check failed", { err });
    return NextResponse.json({ error: "Failed to run wish list check" }, { status: 500 });
  }
}

async function upsertProducts(products: Awaited<ReturnType<typeof fetchAllLots>>) {
  let upserted = 0;
  for (const product of products) {
    await AuctionProduct.findOneAndUpdate(
      { externalId: product.externalId },
      { ...product, scrapedAt: new Date() },
      { upsert: true, new: true }
    );
    upserted++;
  }

  return { upserted };
}
