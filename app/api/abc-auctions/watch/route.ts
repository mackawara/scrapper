import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongoose";
import WatchedProduct from "@/models/WatchedProduct";
import {
  canonicalLotUrl,
  getLotDetail,
  getTokenInfoAsync,
  resolveLotIdentityFrom,
} from "@/lib/abc-auctions/api-client";
import { startScheduler } from "@/lib/abc-auctions/bidder";
import { LOT_STATUS, POST_CLOSE_GRACE_MS } from "@/lib/abc-auctions/constants";
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
 * GET /api/abc-auctions/watch[?includeClosed=1]
 *
 * Returns the watch list with a live price and end time for each lot, and
 * writes those values back so the DB never drifts.
 *
 * Finished auctions are left out unless `includeClosed=1` is passed: the list's
 * job is "what am I bidding on right now", and a closed lot can only mislead.
 * `closedCount` is still reported so the UI can offer to show or clear them.
 *
 * Prices used to come from a separate /products/live call that joined on the
 * scraped `AuctionProduct` cache — watched lots missing from that cache simply
 * never got a price. Reading detail straight off each watched lot's own URL
 * removes that dependency.
 */
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const includeClosed = req.nextUrl.searchParams.get("includeClosed") === "1";
    const watched = await WatchedProduct.find().sort({ createdAt: -1 }).lean();

    const enriched = await Promise.all(
      watched.map(async (w) => {
        // Settled lots can't change — don't spend API budget re-checking them,
        // but still hand the UI a URL that actually opens the lot.
        if (SETTLED_STATUSES.includes(w.bidderStatus)) {
          return { ...w, productUrl: canonicalLotUrl(w.productUrl), isClosed: true };
        }

        // Past its end time by more than the window in which the platform
        // might still flip it: no API call can make this lot live again.
        const msSinceEnd = Date.now() - new Date(w.auctionEndTime).getTime();
        if (msSinceEnd > POST_CLOSE_GRACE_MS) {
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

    const closedCount = enriched.filter((w) => w.isClosed).length;

    return NextResponse.json({
      watched: includeClosed ? enriched : enriched.filter((w) => !w.isClosed),
      closedCount,
      total: enriched.length,
    });
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

    const canonicalUrl = canonicalLotUrl(String(productUrl));

    /**
     * Duplicate check by lot, not by id.
     *
     * A lone `externalId` test misses the case this list actually hit: the API
     * gives each lot three numbers (`Id`, `AuctionLotId`, `LotNumber`), and a
     * row keyed on one of them looks nothing like a row keyed on another. Both
     * are the same lot, so the sniper ends up bidding against itself. Resolving
     * the lot first gives every id it answers to, and the URL catches rows that
     * predate the resolver.
     */
    const identity = await resolveLotIdentityFrom(canonicalUrl, normalizedExternalId);
    const knownIds = [
      normalizedExternalId,
      ...(identity ? [identity.auctionLotId, identity.id] : []),
    ];

    const existing = await WatchedProduct.findOne({
      $or: [
        { externalId: { $in: knownIds } },
        { productUrl: canonicalUrl },
        ...(identity
          ? [{ productUrl: canonicalLotUrl(`/lot/${identity.type}/${identity.id}`) }]
          : []),
      ],
    });

    if (existing) {
      return NextResponse.json(
        {
          error: "Product already being watched",
          watchedId: String(existing._id),
          // Say which entry, so "already watched" doesn't look like a bug when
          // the id in hand is not the id it was stored under.
          matchedExternalId: existing.externalId,
        },
        { status: 409 }
      );
    }

    const endTime = new Date(auctionEndTime);
    // A finished lot has nothing to monitor; it is stored so the UI can show
    // the outcome, but it must not be handed to the scheduler.
    const monitoring = endTime.getTime() > Date.now();

    const watched = await WatchedProduct.create({
      // Store the ids the API will accept, not whichever ones the browse cache
      // happened to carry: the AuctionLotId is what a bid is placed against,
      // and the lot `Id` is what the detail endpoint resolves.
      externalId: identity?.auctionLotId ?? normalizedExternalId,
      // Store the routable form so the card link always opens the real lot.
      productUrl: identity ? canonicalLotUrl(`/lot/${identity.type}/${identity.id}`) : canonicalUrl,
      title,
      imageUrl: imageUrl ?? "",
      auctionEndTime: endTime,
      minBid,
      maxBid,
      // maxBid is required above, so there is nothing left for the user to
      // configure — start monitoring now instead of waiting for someone to
      // press Start on the watch list.
      bidderStatus: monitoring ? "waiting" : "idle",
      nextCheckAt: new Date(),
    });

    let tokenInfo: Awaited<ReturnType<typeof getTokenInfoAsync>> | null = null;
    if (monitoring) {
      // Covers the case where the process booted with nothing to watch and so
      // has no scheduler running yet; the lot is picked up on the next tick.
      startScheduler();
      // Watching but unable to bid is the silent failure worth shouting about.
      tokenInfo = await getTokenInfoAsync();
    }

    logger.info("🟢 Added to watch list", { externalId: normalizedExternalId, title, monitoring });
    return NextResponse.json(
      {
        watched,
        monitoring,
        tokenInfo,
        ...(monitoring &&
          tokenInfo &&
          !tokenInfo.hasToken && {
            warning: "Auto-bid armed, but no ABC Auctions token is set — no bid can be placed.",
          }),
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error("🔴 POST /api/abc-auctions/watch failed", { err });
    return NextResponse.json({ error: "Failed to add watch" }, { status: 500 });
  }
}
