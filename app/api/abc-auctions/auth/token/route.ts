import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";
import { setAuthToken, getTokenInfo, clearAuthToken } from "@/lib/abc-auctions/api-client";

/**
 * GET /api/abc-auctions/auth/token
 *
 * Returns the current auth token status (has token, expiry, etc.).
 */
export async function GET() {
  const info = getTokenInfo();
  return NextResponse.json(info);
}

/**
 * POST /api/abc-auctions/auth/token
 *
 * Store a JWT token for authenticated API calls (bid placement).
 * Body: { "token": "eyJ..." }
 *
 * The token is obtained from a manual login on the ABC Auctions site
 * (DevTools → Network → copy the Authorization header value).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "token is required (string)" }, { status: 400 });
    }

    // Strip "Bearer " prefix if included
    const cleanToken = token.replace(/^Bearer\s+/i, "").trim();

    const result = setAuthToken(cleanToken);

    if (!result) {
      return NextResponse.json({ error: "Invalid or expired JWT token" }, { status: 400 });
    }

    logger.info("🟢 Auth token stored via API", {
      sub: result.sub,
      expiresInHours: result.expiresInHours,
    });

    return NextResponse.json({
      status: "token_stored",
      ...result,
    });
  } catch (err) {
    logger.error("🔴 POST /api/abc-auctions/auth/token failed", { err });
    return NextResponse.json({ error: "Failed to store token" }, { status: 500 });
  }
}

/**
 * DELETE /api/abc-auctions/auth/token
 *
 * Clear the stored auth token.
 */
export async function DELETE() {
  clearAuthToken();
  return NextResponse.json({ status: "token_cleared" });
}
