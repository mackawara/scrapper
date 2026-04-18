import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";
import { placeBidApi, getTokenInfo, getAuthToken } from "@/lib/abc-auctions/api-client";

function parseNumericOrUndefined(value: string | null): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function handleBidRequest(input: { externalId?: string; bidAmount?: number }) {
  try {
    const { externalId, bidAmount } = input;
    const normalizedExternalId = String(externalId ?? "").trim();

    if (!normalizedExternalId) {
      return NextResponse.json({ error: "id (externalId) is required" }, { status: 400 });
    }
    if (!/^\d+$/.test(normalizedExternalId)) {
      return NextResponse.json({ error: "id must be numeric" }, { status: 400 });
    }

    if (!getAuthToken()) {
      const tokenInfo = getTokenInfo();
      return NextResponse.json(
        {
          error:
            tokenInfo.hasToken && tokenInfo.isExpired
              ? "Auth token has expired. Please provide a new token via POST /api/abc-auctions/auth/token."
              : "No auth token set. Please provide a JWT token via POST /api/abc-auctions/auth/token.",
          tokenInfo,
        },
        { status: 401 }
      );
    }

    const normalizedAmount = Number.isFinite(Number(bidAmount)) ? Number(bidAmount) : NaN;

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return NextResponse.json(
        { error: "amount (bidAmount) must be a valid positive number" },
        { status: 400 }
      );
    }

    const result = await placeBidApi(normalizedExternalId, Math.floor(normalizedAmount));

    if (!result.success) {
      return NextResponse.json({ error: result.error, tokenInfo: getTokenInfo() }, { status: 502 });
    }

    logger.info("🟢 Manual bid placed", {
      externalId: normalizedExternalId,
      bidAmount: result.bidAmount,
    });
    return NextResponse.json({
      status: "bid_placed",
      bidAmount: result.bidAmount,
      requestUrl: result.requestUrl,
    });
  } catch (err) {
    logger.error("🔴 POST /api/abc-auctions/bid/place failed", { err });
    return NextResponse.json({ error: "Failed to place bid" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const bodyExternalId = body.externalId ?? body.id;
  const bodyBidAmount = body.bidAmount ?? body.amount;
  return handleBidRequest({
    externalId: bodyExternalId != null ? String(bodyExternalId) : undefined,
    bidAmount: Number.isFinite(Number(bodyBidAmount)) ? Number(bodyBidAmount) : undefined,
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const queryExternalId = searchParams.get("externalId") ?? searchParams.get("id");
  const queryBidAmount = searchParams.get("bidAmount") ?? searchParams.get("amount");
  return handleBidRequest({
    externalId: queryExternalId ?? undefined,
    bidAmount: parseNumericOrUndefined(queryBidAmount),
  });
}
