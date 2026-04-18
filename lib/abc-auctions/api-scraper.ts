/**
 * REST API-based scraper for ABC Auctions.
 *
 * Calls the public API at app-api.abcauctions.co.zw directly — no browser needed.
 */

import logger from "@/lib/logger";
import { AuctionProductData, ScrapedCategory } from "./types";

const API_BASE = process.env.ABC_AUCTIONS_API_URL ?? "https://app-api.abcauctions.co.zw";
const SITE_BASE = process.env.ABC_AUCTIONS_BASE_URL ?? "https://app.abcauctions.co.zw";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

// ─── API response types ──────────────────────────────────────────────────────

interface ApiLot {
  Id: number;
  Type: number;
  Title: string;
  Photo: string | null;
  LotNumber: number;
  Location: string;
  EstimatedValue: number | null;
  Currency: string;
  StartingBid: number;
  CurrentBid: number | null;
  CurrentBidderId: number | null;
  StartDate: string;
  EndDate: string;
  Price: number | null;
  Status: 1 | 2; // 1 = open, 2 = closed
  STC: boolean;
  SaleStatus: number;
  Watching: boolean;
  MaxBid: number | null;
  AuctionLotId: number;
}

interface FacetBucket {
  Value: string;
  Count: number;
  Checked: boolean;
}

interface Facet {
  Name: string;
  Buckets: FacetBucket[];
  Title: string;
}

interface ApiSearchResponse {
  List: ApiLot[];
  Meta: {
    Count: number;
    Facets: Facet[];
    Cursor: string | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isOpenLot(lot: ApiLot): boolean {
  return lot.Status === 1;
}

function mapLot(lot: ApiLot, campaignName: string): AuctionProductData {
  return {
    // The bid placement endpoint expects AuctionLotId (not the lot page Id)
    externalId: String(lot.AuctionLotId),
    title: lot.Title,
    imageUrl: lot.Photo ?? "",
    currentPrice: lot.CurrentBid ?? lot.StartingBid ?? 0,
    maxPrice: lot.EstimatedValue ?? 0,
    auctionEndTime: lot.EndDate,
    lotNumber: String(lot.LotNumber),
    category: campaignName,
    productUrl: `${SITE_BASE}/lot/${lot.Type}/${lot.Id}`,
    scrapedAt: new Date().toISOString(),
  };
}

async function callSearchApi(opts?: {
  facets?: Record<string, string[]>;
  cursor?: string;
  query?: string;
  size?: number;
}): Promise<ApiSearchResponse> {
  const { facets, cursor, query, size } = opts ?? {};
  const params = new URLSearchParams({
    Size: String(size ?? PAGE_SIZE),
    Sort: "2",
  });
  if (facets) {
    params.set("FacetJson", JSON.stringify(facets));
  }
  if (cursor) {
    params.set("Cursor", cursor);
  }
  if (query) {
    params.set("Query", query);
  }

  const url = `${API_BASE}/lots/search?${params}`;
  logger.debug("🔵 API request", { url });

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }

  return (await res.json()) as ApiSearchResponse;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ApiCampaign {
  name: string;
  count: number;
}

/**
 * Search lots by text query — calls the ABC API directly.
 * Used by the search bar in the UI for real-time results.
 */
export async function queryLots(
  query: string,
  limit: number = 48
): Promise<{ products: AuctionProductData[]; total: number }> {
  logger.info("🔵 Querying lots", { query, limit });

  const data = await callSearchApi({ query, size: limit });

  const campaignFacet = data.Meta.Facets.find((f) => f.Name === "campaign");
  const defaultCampaign = campaignFacet?.Buckets[0]?.Value ?? "Uncategorized";

  const products = data.List.filter(isOpenLot).map((lot) => mapLot(lot, defaultCampaign));

  return { products, total: data.Meta.Count };
}

/**
 * Discover campaigns by reading the "campaign" facet from the search API.
 */
export async function fetchCampaigns(): Promise<ApiCampaign[]> {
  logger.info("🔵 Fetching campaigns from API");

  const data = await callSearchApi({});
  const campaignFacet = data.Meta.Facets.find((f) => f.Name === "campaign");

  if (!campaignFacet) {
    logger.warn("🟡 No campaign facet found in API response");
    return [];
  }

  const campaigns = campaignFacet.Buckets.map((b) => ({
    name: b.Value,
    count: b.Count,
  }));

  logger.info(`🔵 Found ${campaigns.length} campaigns via API`);
  return campaigns;
}

/**
 * Backward-compat wrapper for the categories sidebar.
 */
export async function fetchCategories(): Promise<ScrapedCategory[]> {
  const campaigns = await fetchCampaigns();
  return campaigns.map((c) => ({
    name: c.name,
    url: `${SITE_BASE}/search?sort=2&facets=${encodeURIComponent(JSON.stringify({ campaign: [c.name] }))}`,
  }));
}

/**
 * Fetch all lots for a single campaign, paginating with cursors.
 */
export async function fetchLotsForCampaign(campaignName: string): Promise<AuctionProductData[]> {
  logger.info("🔵 Fetching lots for campaign", { campaignName });

  const results: AuctionProductData[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await callSearchApi({
      facets: { campaign: [campaignName] },
      cursor,
    });
    const mapped = data.List.filter(isOpenLot).map((lot) => mapLot(lot, campaignName));
    results.push(...mapped);

    logger.debug("🔵 Page fetched", {
      campaignName,
      page: page + 1,
      fetched: mapped.length,
      total: results.length,
    });

    if (!data.Meta.Cursor || data.List.length < PAGE_SIZE) break;
    cursor = data.Meta.Cursor;
  }

  logger.info(`🔵 Fetched ${results.length} lots for "${campaignName}"`);
  return results;
}

/**
 * Full scrape: discover campaigns → fetch all lots per campaign.
 */
export async function fetchAllLots(): Promise<AuctionProductData[]> {
  logger.info("🔵 Starting full API scrape");

  const campaigns = await fetchCampaigns();

  if (campaigns.length === 0) {
    logger.warn("🟡 No campaigns found — fetching all lots without filter");
    const data = await callSearchApi({});
    return data.List.filter(isOpenLot).map((lot) => mapLot(lot, "Uncategorized"));
  }

  const results: AuctionProductData[] = [];

  for (const campaign of campaigns) {
    const lots = await fetchLotsForCampaign(campaign.name);
    results.push(...lots);
    logger.info(`   ↳ "${campaign.name}" → ${lots.length} lots`);
  }

  // Deduplicate by externalId
  const seen = new Set<string>();
  const unique = results.filter((p) => {
    if (seen.has(p.externalId)) return false;
    seen.add(p.externalId);
    return true;
  });

  logger.info(
    `🔵 API scrape done — ${unique.length} unique lots across ${campaigns.length} campaigns`
  );
  return unique;
}
