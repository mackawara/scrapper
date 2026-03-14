import { NextResponse } from "next/server";
import { scrapeCampaigns } from "@/lib/abc-auctions/scraper";
import logger from "@/lib/logger";

/**
 * GET /api/abc-auctions/campaigns
 * Returns live campaign list scraped from /campaigns.
 * Each campaign includes its id, name and the URL to its lots page.
 */
export async function GET() {
  try {
    const campaigns = await scrapeCampaigns();
    return NextResponse.json({ campaigns });
  } catch (err) {
    logger.error("🔴 GET /api/abc-auctions/campaigns failed", { err });
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}
