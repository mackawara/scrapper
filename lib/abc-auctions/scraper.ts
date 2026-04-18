import { Browser, Page } from "puppeteer";
import logger from "@/lib/logger";
import { AuctionProductData, ScrapedCategory } from "./types";
import { launchBrowser, launchPage, SITE_READY } from "./browser";

const BASE_URL = process.env.ABC_AUCTIONS_BASE_URL ?? "https://app.abcauctions.co.zw";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForSiteReady(page: Page): Promise<void> {
  await page.waitForFunction(SITE_READY, { timeout: 30000 });
  await page.waitForNetworkIdle({ idleTime: 1500, timeout: 30000 }).catch(() => {
    logger.warn("🌕 Network did not fully idle — continuing anyway");
  });
}

async function scrollToLoadAll(page: Page): Promise<void> {
  let previousHeight = 0;
  for (let i = 0; i < 20; i++) {
    const currentHeight: number = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight) break;
    previousHeight = currentHeight;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 5000 }).catch(() => {});
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

// ─── Campaign discovery ───────────────────────────────────────────────────────

export interface Campaign {
  name: string;
  /** The full /search?... URL that lists lots for this campaign */
  lotsUrl: string;
}

/**
 * Navigate to /campaigns, find every "View Lots" link and extract the
 * campaign name + lots search URL.
 *
 * The site uses URLs of the form:
 *   /search?sort=2&facets={"campaign":["CAMPAIGN NAME"]}
 */
export async function scrapeCampaigns(): Promise<Campaign[]> {
  logger.info("🟢 Scraping campaigns from /campaigns");
  const browser = await launchBrowser();
  const page = await launchPage(browser);

  try {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "stylesheet", "font", "media"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(`${BASE_URL}/campaigns`, { waitUntil: "domcontentloaded" });
    await waitForSiteReady(page);
    await scrollToLoadAll(page);
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 8000 }).catch(() => {});

    const campaigns = await page.evaluate((base: string) => {
      const results: { name: string; lotsUrl: string }[] = [];

      // Every anchor on the page
      const allLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));

      for (const a of allLinks) {
        const href = a.href; // absolute URL
        if (!href) continue;

        // Pattern 1: link already points to the search facet URL
        if (href.includes("/search") && href.includes("campaign")) {
          let campaignName = "";
          try {
            const url = new URL(href);
            const facetsRaw = url.searchParams.get("facets");
            if (facetsRaw) {
              const facets = JSON.parse(facetsRaw) as Record<string, string[]>;
              campaignName = facets["campaign"]?.[0] ?? "";
            }
          } catch {
            // fallback: pull text from closest heading
          }
          if (!campaignName) {
            // Walk up and grab heading text
            let el: HTMLElement | null = a.parentElement;
            for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
              const h = el.querySelector<HTMLElement>(
                "h1,h2,h3,h4,h5,h6,[class*='title'],[class*='name']"
              );
              if (h?.innerText?.trim()) {
                campaignName = h.innerText.trim();
                break;
              }
            }
          }
          if (!campaignName) campaignName = a.innerText.trim() || "Campaign";
          results.push({ name: campaignName, lotsUrl: href });
          continue;
        }

        // Pattern 2: the link text says "View Lots" / "Lots" / "Browse" etc.
        const text = a.innerText.trim().toLowerCase();
        if (
          text.includes("view lot") ||
          text === "lots" ||
          text.includes("browse lot") ||
          text.includes("bid now")
        ) {
          // Walk up to find the campaign name
          let campaignName = "";
          let el: HTMLElement | null = a.parentElement;
          for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
            const h = el.querySelector<HTMLElement>(
              "h1,h2,h3,h4,h5,h6,[class*='title'],[class*='name'],[class*='heading']"
            );
            if (h?.innerText?.trim() && h.innerText.trim().toLowerCase() !== text) {
              campaignName = h.innerText.trim();
              break;
            }
          }
          if (!campaignName) campaignName = "Campaign";

          // Build the search URL from the campaign name
          const facets = JSON.stringify({ campaign: [campaignName] });
          const lotsUrl = `${base}/search?sort=2&facets=${encodeURIComponent(facets)}`;
          results.push({ name: campaignName, lotsUrl });
        }
      }

      // Deduplicate by campaign name
      const seen = new Set<string>();
      return results.filter((c) => {
        if (seen.has(c.name)) return false;
        seen.add(c.name);
        return true;
      });
    }, BASE_URL);

    logger.info(`🟢 Found ${campaigns.length} campaigns`);
    return campaigns;
  } catch (err) {
    logger.error("🔴 Failed to scrape campaigns", { err });
    return [];
  } finally {
    await browser.close();
  }
}

// Kept for backward compat (categories sidebar uses this shape)
export async function scrapeCategories(): Promise<ScrapedCategory[]> {
  const campaigns = await scrapeCampaigns();
  return campaigns.map((c) => ({ name: c.name, url: c.lotsUrl }));
}

// ─── Lots scraping ────────────────────────────────────────────────────────────

/**
 * Navigate to a campaign search URL, capture the search API response,
 * and return mapped lots.
 *
 * The Angular app hits a search backend (Algolia or similar) when the
 * /search page loads — we intercept that response and map the records.
 */
export async function scrapeLotsForCampaign(
  browser: Browser,
  campaign: Campaign
): Promise<AuctionProductData[]> {
  logger.info("🟢 Scraping lots", { campaign: campaign.name, url: campaign.lotsUrl });
  const page = await launchPage(browser);
  const captured: AuctionProductData[] = [];

  try {
    await page.setRequestInterception(true);

    page.on("request", (req) => {
      if (["image", "stylesheet", "font", "media"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    page.on("response", async (res) => {
      const url = res.url();
      if (!looksLikeSearchOrLotEndpoint(url)) return;
      try {
        const json = await res.json();
        const items = extractItems(json);
        const mapped = items
          .map((r) => mapToProduct(r, campaign.name))
          .filter((p): p is AuctionProductData => p !== null);
        if (mapped.length > 0) {
          captured.push(...mapped);
          logger.debug("🟣 Captured", { url, count: mapped.length });
        }
      } catch {
        // not JSON or wrong shape — ignore
      }
    });

    await page.goto(campaign.lotsUrl, { waitUntil: "domcontentloaded" });
    await waitForSiteReady(page);
    await scrollToLoadAll(page);
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 15000 }).catch(() => {});

    if (captured.length > 0) {
      logger.info(`🟢 API: ${captured.length} lots for "${campaign.name}"`);
      return captured;
    }

    // Fallback: DOM scrape the search results page
    logger.debug("🟣 DOM fallback", { campaign: campaign.name });
    const domProducts = await domScrapeLots(page, campaign.name);
    logger.info(`🟢 DOM: ${domProducts.length} lots for "${campaign.name}"`);
    return domProducts;
  } catch (err) {
    logger.error("🔴 Failed to scrape lots", { err, campaign: campaign.name });
    return [];
  } finally {
    await page.close();
  }
}

function looksLikeSearchOrLotEndpoint(url: string): boolean {
  // Algolia
  if (url.includes("algolia.net") || url.includes("algolianet.com") || url.includes("algolia.io"))
    return true;
  // Any XHR that looks like a search or lot listing API
  return (
    url.includes("/search") ||
    url.includes("/api/") ||
    url.includes("/lot") ||
    url.includes("/product") ||
    url.includes("/auction") ||
    url.includes("/item") ||
    url.includes("/listing") ||
    url.includes("/catalog") ||
    url.includes("/query") ||
    url.includes("/filter")
  );
}

/** Extract an array of raw records from various JSON response shapes. */
function extractItems(json: unknown): Record<string, unknown>[] {
  if (!json || typeof json !== "object") return [];
  const j = json as Record<string, unknown>;

  // Algolia: { hits: [...] }
  if (Array.isArray(j.hits)) return j.hits as Record<string, unknown>[];
  // Algolia multi-index: { results: [{ hits: [...] }] }
  if (Array.isArray(j.results)) {
    const all: Record<string, unknown>[] = [];
    for (const r of j.results as Record<string, unknown>[]) {
      if (Array.isArray(r.hits)) all.push(...(r.hits as Record<string, unknown>[]));
    }
    if (all.length > 0) return all;
    // results is a flat array of records
    return j.results as Record<string, unknown>[];
  }
  // Generic: { data: [...] } | { lots: [...] } | { items: [...] } | bare array
  if (Array.isArray(j.data)) return j.data as Record<string, unknown>[];
  if (Array.isArray(j.lots)) return j.lots as Record<string, unknown>[];
  if (Array.isArray(j.items)) return j.items as Record<string, unknown>[];
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  return [];
}

// ─── DOM fallback ─────────────────────────────────────────────────────────────

async function domScrapeLots(page: Page, campaignName: string): Promise<AuctionProductData[]> {
  return page.evaluate(
    (base: string, campaign: string) => {
      const parsePrice = (text?: string | null) =>
        parseFloat((text ?? "").replace(/[^0-9.]/g, "")) || 0;

      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(
          [
            "[class*='lot-card']",
            "[class*='lot_card']",
            "[class*='lot-item']",
            "[class*='lot_item']",
            "[class*='product-card']",
            "[class*='auction-item']",
            "[class*='item-card']",
            "[class*='search-result']",
            "[class*='result-item']",
            "mat-card",
          ].join(", ")
        )
      );

      return cards
        .map((card) => {
          const img = card.querySelector<HTMLImageElement>("img");
          const titleEl = card.querySelector<HTMLElement>(
            "[class*='title'],[class*='name'],[class*='description'],h2,h3,h4,h5"
          );
          const priceEl = card.querySelector<HTMLElement>(
            "[class*='price'],[class*='bid'],[class*='current-bid'],[class*='amount']"
          );
          const timeEl = card.querySelector<HTMLElement>(
            "[class*='time'],[class*='closing'],[class*='end'],[class*='countdown'],time"
          );
          const lotEl = card.querySelector<HTMLElement>(
            "[class*='lot-number'],[class*='lot_number'],[class*='lot-no'],[class*='lotno']"
          );
          const link = card.querySelector<HTMLAnchorElement>(
            "a[href*='lot'],a[href*='item'],a[href*='search'],a"
          );

          const title = titleEl?.innerText?.trim() ?? "";
          if (!title) return null;

          const externalId =
            card.getAttribute("data-id") ||
            card.getAttribute("data-lot-id") ||
            card.getAttribute("id") ||
            link?.href?.match(/\/(\d+)/)?.[1] ||
            Math.random().toString(36).slice(2);

          return {
            externalId,
            title,
            imageUrl: img?.src ?? img?.getAttribute("data-src") ?? "",
            currentPrice: parsePrice(priceEl?.innerText),
            maxPrice: 0,
            auctionEndTime:
              timeEl?.getAttribute("datetime") ??
              timeEl?.innerText?.trim() ??
              new Date().toISOString(),
            lotNumber: lotEl?.innerText?.trim() ?? "",
            category: campaign,
            productUrl: link?.href ?? base,
            scrapedAt: new Date().toISOString(),
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
    },
    BASE_URL,
    campaignName
  );
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapToProduct(
  raw: Record<string, unknown>,
  campaignName: string
): AuctionProductData | null {
  try {
    const parsePrice = (val: unknown) => parseFloat(String(val ?? 0).replace(/[^0-9.]/g, "")) || 0;

    const externalId = String(
      raw.id ??
        raw.objectID ??
        raw.lotId ??
        raw.lot_id ??
        raw.productId ??
        raw.product_id ??
        raw.itemId ??
        raw.item_id ??
        ""
    );
    if (!externalId) return null;

    const title = String(
      raw.title ??
        raw.name ??
        raw.lot_title ??
        raw.lotTitle ??
        raw.description ??
        raw.item_name ??
        raw.itemName ??
        ""
    );
    if (!title) return null;

    const imageVal =
      raw.imageUrl ??
      raw.image_url ??
      raw.image ??
      raw.thumbnail ??
      raw.photo ??
      raw.photo_url ??
      raw.photoUrl ??
      (Array.isArray(raw.images) ? raw.images[0] : undefined) ??
      "";

    return {
      externalId,
      title,
      imageUrl: String(imageVal),
      currentPrice: parsePrice(
        raw.currentPrice ??
          raw.current_price ??
          raw.currentBid ??
          raw.current_bid ??
          raw.bidAmount ??
          raw.bid_amount ??
          raw.price ??
          raw.amount
      ),
      maxPrice: parsePrice(
        raw.maxPrice ??
          raw.max_price ??
          raw.estimate ??
          raw.estimatedValue ??
          raw.reserve ??
          raw.reservePrice ??
          raw.reserve_price ??
          raw.highEstimate ??
          raw.high_estimate
      ),
      auctionEndTime: String(
        raw.auctionEndTime ??
          raw.closing_time ??
          raw.end_time ??
          raw.closingDate ??
          raw.closeTime ??
          raw.close_time ??
          raw.endDate ??
          raw.end_date ??
          new Date().toISOString()
      ),
      lotNumber: String(
        raw.lotNumber ?? raw.lot_number ?? raw.lot ?? raw.lot_no ?? raw.lotNo ?? ""
      ),
      category: String(
        raw.category ??
          raw.categoryName ??
          raw.category_name ??
          raw.type ??
          raw.itemType ??
          raw.item_type ??
          campaignName
      ),
      productUrl: String(
        raw.productUrl ??
          raw.product_url ??
          raw.url ??
          raw.link ??
          raw.itemUrl ??
          raw.item_url ??
          `${BASE_URL}/lots/${externalId}`
      ),
      scrapedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Backward-compat wrapper — prefer scrapeLotsForCampaign directly. */
export async function scrapeProducts(lotsUrl?: string): Promise<AuctionProductData[]> {
  const browser = await launchBrowser();
  try {
    return await scrapeLotsForCampaign(browser, {
      name: "Uncategorized",
      lotsUrl: lotsUrl ?? `${BASE_URL}/campaigns`,
    });
  } finally {
    await browser.close();
  }
}

/**
 * Full scrape: /campaigns → per-campaign lots search URLs → lots.
 * Single browser instance shared across all campaign pages.
 */
export async function scrapeAll(): Promise<AuctionProductData[]> {
  logger.info("🟢 Starting full scrape — /campaigns → lots");

  const campaigns = await scrapeCampaigns();

  if (campaigns.length === 0) {
    logger.warn("🟡 No campaigns found — attempting direct /campaigns page scrape");
    return scrapeProducts(`${BASE_URL}/campaigns`);
  }

  const browser = await launchBrowser();
  const results: AuctionProductData[] = [];

  try {
    for (const campaign of campaigns) {
      const lots = await scrapeLotsForCampaign(browser, campaign);
      results.push(...lots);
      logger.info(`   ↳ "${campaign.name}" → ${lots.length} lots`);
    }
  } finally {
    await browser.close();
  }

  // Deduplicate by externalId
  const seen = new Set<string>();
  const unique = results.filter((p) => {
    if (seen.has(p.externalId)) return false;
    seen.add(p.externalId);
    return true;
  });

  logger.info(`🟢 Scrape done — ${unique.length} unique lots across ${campaigns.length} campaigns`);
  return unique;
}
