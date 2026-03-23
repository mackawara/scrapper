import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";
import { placeBidApi, getTokenInfo, getAuthToken } from "@/lib/abc-auctions/api-client";

export async function POST(req: NextRequest) {
  try {
    const { externalId, currentPrice, bidAmount } = await req.json();

    if (!externalId) {
      return NextResponse.json({ error: "externalId is required" }, { status: 400 });
    }

    if (!getAuthToken()) {
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
      return NextResponse.json({ error: "A valid bid amount is required" }, { status: 400 });
    }

    const result = await placeBidApi(String(externalId), Math.floor(normalizedAmount));

    if (!result.success) {
      return NextResponse.json({ error: result.error, tokenInfo: getTokenInfo() }, { status: 502 });
    }

    logger.info("🟢 Manual bid placed", { externalId, bidAmount: result.bidAmount });
    return NextResponse.json({ status: "bid_placed", bidAmount: result.bidAmount });
  } catch (err) {
    logger.error("🔴 POST /api/abc-auctions/bid/place failed", { err });
    return NextResponse.json({ error: "Failed to place bid" }, { status: 500 });
  }
}
