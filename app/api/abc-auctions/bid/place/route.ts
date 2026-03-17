import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";
import { placeManualBid, hasBidderCredentials } from "@/lib/abc-auctions/bidder";
import { getTokenInfo } from "@/lib/abc-auctions/api-client";

export async function POST(req: NextRequest) {
  try {
    const { productUrl, currentPrice, bidAmount } = await req.json();

    if (!productUrl) {
      return NextResponse.json(
        { error: "productUrl is required" },
        { status: 400 }
      );
    }

    // Check for valid auth token
    if (!hasBidderCredentials()) {
      const tokenInfo = getTokenInfo();
      return NextResponse.json(
        {
          error: tokenInfo.hasToken && tokenInfo.isExpired
            ? "Auth token has expired. Please provide a new token via POST /api/abc-auctions/auth/token."
            : "No auth token set. Please provide a JWT token via POST /api/abc-auctions/auth/token.",
          tokenInfo,
        },
        { status: 401 }
      );
    }

    const fallbackAmount = Number(currentPrice) + 1;
    const normalizedAmount = Number.isFinite(Number(bidAmount))
      ? Number(bidAmount)
      : fallbackAmount;

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return NextResponse.json(
        { error: "A valid bid amount is required" },
        { status: 400 }
      );
    }

    const success = await placeManualBid(
      String(productUrl),
      Math.floor(normalizedAmount)
    );

    if (!success) {
      return NextResponse.json(
        {
          error: "Bid submission failed. Check token validity and try again.",
          tokenInfo: getTokenInfo(),
        },
        { status: 502 }
      );
    }

    logger.info("🟢 Manual bid placed", {
      productUrl,
      bidAmount: Math.floor(normalizedAmount),
    });
    return NextResponse.json({
      status: "bid_placed",
      bidAmount: Math.floor(normalizedAmount),
    });
  } catch (err) {
    logger.error("🔴 POST /api/abc-auctions/bid/place failed", { err });
    return NextResponse.json(
      { error: "Failed to place bid" },
      { status: 500 }
    );
  }
}
