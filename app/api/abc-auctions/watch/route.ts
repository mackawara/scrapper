import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import WatchedProduct from "@/models/WatchedProduct";
import { canonicalLotUrl, getLotDetail } from "@/lib/abc-auctions/api-client";
import { LOT_STATUS } from "@/lib/abc-auctions/constants";
import { BidderStatus } from "@/lib/abc-auctions/types";
import logger from "@/lib/logger";

/** UI polls at 15s; a 10s cache stops extra tabs multiplying API calls. */
const LIVE_CACHE_MS = 10_000;

/**
 * Statuses that mean the auction itself is over. Deliberately excludes
 * "stopped", which only means the user paused our bidding — that lot is still
 * live and must stay visible.
 */
const SETTLED_STATUSES: BidderStatus[] = ["won", "lost"];

/**
 * GET /api/abc-auctions/watch
 *
 * Returns the watch list with a live price and end time for each lot, and
 * writes those values back so the DB never drifts.
 *
 * Prices used to come from a separate /products/live call that joined on the
 * scraped `AuctionProduct` cache — watched lots missing from that cache simply
 * never got a price. Reading detail straight off each watched lot's own URL
 * removes that dependency.
 */
export async function GET() {
  try {
    await connectDB();
    const watched = await WatchedProduct.find().sort({ createdAt: -1 }).lean();

    const enriched = await Promise.all(
      watched.map(async (w) => {
        // Settled lots can't change — don't spend API budget re-checking them,
        // but still hand the UI a URL that actually opens the lot.
        if (SETTLED_STATUSES.includes(w.bidderStatus)) {
          return { ...w, productUrl: canonicalLotUrl(w.productUrl), isClosed: true };
        }

        try {
          const detail = await getLotDetail(w.productUrl, { maxAgeMs: LIVE_CACHE_MS });
          if (!detail) {
            return {
              ...w,
              productUrl: canonicalLotUrl(w.productUrl),
              isClosed: new Date(w.auctionEndTime).getTime() <= Date.now(),
            };
          }

          const currentPrice = detail.CurrentBid ?? detail.StartingBid ?? w.currentPrice ?? null;
          const auctionEndTime = new Date(detail.EndDate);
          const isClosed =
            detail.Status !== LOT_STATUS.LIVE || auctionEndTime.getTime() <= Date.now();
          // detail.Url is the /lot/{type}/{id} form, which the app's bootstrap
          // redirects away from — always rebuild the dialog-outlet link.
          const productUrl = canonicalLotUrl(detail.Url ?? w.productUrl);

          const changed: Record<string, unknown> = {};
          if (currentPrice !== w.currentPrice) changed.currentPrice = currentPrice;
          if (auctionEndTime.getTime() !== new Date(w.auctionEndTime).getTime()) {
            changed.auctionEndTime = auctionEndTime;
          }
          // Repairs legacy /lots/{id} rows in place, once.
          if (productUrl !== w.productUrl) changed.productUrl = productUrl;

          if (Object.keys(changed).length > 0) {
            await WatchedProduct.updateOne({ _id: w._id }, { $set: changed });
          }

          return { ...w, currentPrice, auctionEndTime, productUrl, isClosed };
        } catch (err) {
          logger.warn("🌕 Live enrichment failed for watched lot", {
            externalId: w.externalId,
            err,
          });
          return {
            ...w,
            productUrl: canonicalLotUrl(w.productUrl),
            isClosed: new Date(w.auctionEndTime).getTime() <= Date.now(),
          };
        }
      })
    );

    return NextResponse.json({ watched: enriched });
  } catch (err) {
    logger.error("🔴 GET /api/abc-auctions/watch failed", { err });
    return NextResponse.json({ error: "Failed to fetch watch list" }, { status: 500 });
  }
}

/**
 * DELETE /api/abc-auctions/watch?closed=1
 *
 * Bulk-removes every watched lot whose auction has finished.
 */
export async function DELETE(req: NextRequest) {
  try {
    await connectDB();
    if (req.nextUrl.searchParams.get("closed") !== "1") {
      return NextResponse.json({ error: "Pass ?closed=1 to clear finished lots" }, { status: 400 });
    }

    const result = await WatchedProduct.deleteMany({
      $or: [{ bidderStatus: { $in: SETTLED_STATUSES } }, { auctionEndTime: { $lte: new Date() } }],
    });

    logger.info("🟢 Cleared closed lots from watch list", { deleted: result.deletedCount });
    return NextResponse.json({ deleted: result.deletedCount });
  } catch (err) {
    logger.error("🔴 DELETE /api/abc-auctions/watch failed", { err });
    return NextResponse.json({ error: "Failed to clear closed lots" }, { status: 500 });
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
      // Store the routable form so the card link always opens the real lot.
      productUrl: canonicalLotUrl(String(productUrl)),
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
