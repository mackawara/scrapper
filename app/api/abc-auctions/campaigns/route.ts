import { NextResponse } from "next/server";
import { fetchCampaigns } from "@/lib/abc-auctions/api-scraper";
import logger from "@/lib/logger";

/**
 * GET /api/abc-auctions/campaigns
 * Returns live campaign list from the ABC Auctions API.
 */
export async function GET() {
  try {
    const campaigns = await fetchCampaigns();
    return NextResponse.json({ campaigns });
  } catch (err) {
    logger.error("🔴 GET /api/abc-auctions/campaigns failed", { err });
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}
