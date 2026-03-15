import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";
import { hasBidderCredentials, placeManualBid } from "@/lib/abc-auctions/bidder";

export async function POST(req: NextRequest) {
  try {
    const { productUrl, currentPrice, bidAmount } = await req.json();

    if (!productUrl) {
      return NextResponse.json({ error: "productUrl is required" }, { status: 400 });
    }

    if (!hasBidderCredentials()) {
      return NextResponse.json(
        {
          error:
            "Bid credentials missing. Set ABC_AUCTIONS_EMAIL (or ABC_AUCTIONS_USERNAME) and ABC_AUCTIONS_PASSWORD.",
        },
        { status: 400 }
      );
    }

    const fallbackAmount = Number(currentPrice) + 1;
    const normalizedAmount = Number.isFinite(Number(bidAmount))
      ? Number(bidAmount)
      : fallbackAmount;

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return NextResponse.json({ error: "A valid bid amount is required" }, { status: 400 });
    }

    const success = await placeManualBid(String(productUrl), Math.floor(normalizedAmount));

    if (!success) {
      return NextResponse.json(
        { error: "Bid submission failed. Check credentials/login selectors and try again." },
        { status: 502 }
      );
    }

    logger.info("🟢 Manual bid placed", { productUrl, bidAmount: Math.floor(normalizedAmount) });
    return NextResponse.json({ status: "bid_placed", bidAmount: Math.floor(normalizedAmount) });
  } catch (err) {
    logger.error("🔴 POST /api/abc-auctions/bid/place failed", { err });
    return NextResponse.json({ error: "Failed to place bid" }, { status: 500 });
  }
}
