import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import AuctionProduct from "@/models/AuctionProduct";
import { getLotDetail } from "@/lib/abc-auctions/api-client";
import logger from "@/lib/logger";

/**
 * GET /api/abc-auctions/products/live?externalIds=id1,id2,...
 *
 * Fetches static product data (title, image, category) from the DB cache,
 * then enriches each with a live currentPrice and auctionEndTime fetched
 * directly from the ABC Auctions API — never serves stale prices.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const externalIdsParam = searchParams.get("externalIds");

  if (!externalIdsParam) {
    return NextResponse.json({ error: "externalIds param required" }, { status: 400 });
  }

  const externalIds = externalIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (externalIds.length === 0) {
    return NextResponse.json({ products: [], total: 0 });
  }

  try {
    await connectDB();

    const dbProducts = await AuctionProduct.find({ externalId: { $in: externalIds } }).lean();

    // Enrich with live data concurrently
    const enriched = await Promise.all(
      dbProducts.map(async (p) => {
        try {
          const detail = await getLotDetail(p.productUrl);
          if (detail) {
            return {
              ...p,
              currentPrice: detail.CurrentBid ?? detail.StartingBid ?? p.currentPrice,
              auctionEndTime: detail.EndDate,
            };
          }
        } catch (err) {
          logger.warn("🌕 Live price fetch failed, using DB fallback", {
            externalId: p.externalId,
            err,
          });
        }
        return p;
      })
    );

    return NextResponse.json({ products: enriched, total: enriched.length });
  } catch (err) {
    logger.error("🔴 GET /api/abc-auctions/products/live failed", { err });
    return NextResponse.json({ error: "Failed to fetch live products" }, { status: 500 });
  }
}
