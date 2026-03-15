import connectDB from "@/lib/mongoose";
import WatchedProduct from "@/models/WatchedProduct";
import logger from "@/lib/logger";
import { BidderStatus, MonitorStatus } from "./types";
import {
  TWENTY_FOUR_HOURS_MS,
  TEN_MINUTES_MS,
  POLL_INTERVAL_WAITING_MS,
  POLL_INTERVAL_EARLY_BID_MS,
  POLL_INTERVAL_FINAL_BID_MS,
} from "./constants";
import { launchBrowser, launchPage, SITE_READY } from "./browser";
import type { Browser, Page } from "puppeteer";

// ─── ABC Auctions constants ─────────────────────────────────────────────────

const API_BASE = process.env.ABC_AUCTIONS_API_URL ?? "https://app-api.abcauctions.co.zw";
const SITE_BASE = process.env.ABC_AUCTIONS_BASE_URL ?? "https://app.abcauctions.co.zw";

// ─── In-memory state ─────────────────────────────────────────────────────────

const stopSignals = new Map<string, boolean>();
const monitorStatuses = new Map<string, MonitorStatus>();

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function updateStatus(id: string, status: BidderStatus, extra?: Partial<MonitorStatus>) {
  await connectDB();
  await WatchedProduct.findByIdAndUpdate(id, {
    bidderStatus: status,
    ...(extra?.lastBidAmount != null && { lastBidAmount: extra.lastBidAmount }),
    ...(extra?.lastBidAt != null && { lastBidAt: extra.lastBidAt }),
  });
  monitorStatuses.set(id, {
    ...(monitorStatuses.get(id) ?? {}),
    watchedProductId: id,
    bidderStatus: status,
    lastBidAmount: extra?.lastBidAmount ?? null,
    lastBidAt: extra?.lastBidAt ?? null,
    ...extra,
  });
}

// ─── Price check via API (no browser!) ───────────────────────────────────────

interface LotDetailResponse {
  Id: number;
  CurrentBid: number | null;
  StartingBid: number;
  Status: number;
  EndDate: string;
  AuctionLotId: number;
  Type: number;
}

/**
 * Extract lot ID and type from a product URL.
 * URLs may look like:
 *   /lot/1/693868
 *   /lots/693868
 *   /search(dialog:lot/1/693868)
 */
function parseLotUrl(productUrl: string): {
  id: string;
  type: string;
} | null {
  // /lot/{type}/{id}
  const lotMatch = productUrl.match(/\/lot\/(\d+)\/(\d+)/);
  if (lotMatch) return { type: lotMatch[1], id: lotMatch[2] };

  // /lots/{id} — default type 1
  const lotsMatch = productUrl.match(/\/lots\/(\d+)/);
  if (lotsMatch) return { type: "1", id: lotsMatch[1] };

  return null;
}

/**
 * Get current bid price via the REST API — fast, no browser needed.
 */
async function getCurrentPrice(productUrl: string): Promise<number | null> {
  const parsed = parseLotUrl(productUrl);
  if (!parsed) {
    logger.warn("🌕 Cannot parse lot URL", { productUrl });
    return null;
  }

  try {
    const url = `${API_BASE}/lots/detail?id=${parsed.id}&type=${parsed.type}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      logger.warn("🌕 Lot detail API error", {
        status: res.status,
        productUrl,
      });
      return null;
    }

    const data = (await res.json()) as LotDetailResponse;
    return data.CurrentBid ?? data.StartingBid ?? null;
  } catch (err) {
    logger.error("🔴 Failed to fetch current price via API", {
      productUrl,
      err,
    });
    return null;
  }
}

// ─── Login via Puppeteer ─────────────────────────────────────────────────────

function getBidderCredentials(): {
  username: string;
  password: string;
} | null {
  const username = process.env.ABC_AUCTIONS_EMAIL ?? process.env.ABC_AUCTIONS_USERNAME;
  const password = process.env.ABC_AUCTIONS_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

export function hasBidderCredentials(): boolean {
  return getBidderCredentials() != null;
}

/**
 * Full login flow:
 *  1) Navigate to /login
 *  2) Account gate → click LOGIN button on "Already have an account?" side
 *  3) Fill email + password → click LOGIN
 *  4) Handle verification page → click SKIP if it appears
 */
async function loginWithPuppeteer(browser: Browser): Promise<Page | null> {
  const creds = getBidderCredentials();
  if (!creds) {
    logger.warn("🌕 No credentials configured", {
      requiredEnv: ["ABC_AUCTIONS_EMAIL or ABC_AUCTIONS_USERNAME", "ABC_AUCTIONS_PASSWORD"],
    });
    return null;
  }

  const page = await launchPage(browser);

  try {
    // Go to login page
    await page.goto(`${SITE_BASE}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForFunction(SITE_READY, { timeout: 20_000 });
    await page.waitForNetworkIdle({ idleTime: 1500, timeout: 10_000 }).catch(() => {});

    // Step 1: Account gate — click the LOGIN button (right side)
    // Look for a button containing "LOGIN" text
    const gateLoginBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((b) => b.textContent?.trim().toUpperCase().includes("LOGIN")) ?? null;
    });

    if (gateLoginBtn && (gateLoginBtn as unknown as { asElement: () => unknown }).asElement?.()) {
      await (gateLoginBtn as unknown as import("puppeteer").ElementHandle).click();
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 10_000 }).catch(() => {});
      logger.debug("🟣 Clicked account gate LOGIN button");
    }

    // Step 2: Fill login form
    await page.waitForSelector('input[type="email"], input[type="text"]', {
      timeout: 10_000,
    });

    const emailInput = await page.$(
      'input[type="email"], input[name*="email"], input[placeholder*="email"], input[placeholder*="Email"]'
    );
    const passwordInput = await page.$('input[type="password"], input[name*="password"]');

    if (!emailInput || !passwordInput) {
      logger.warn("🌕 Login form fields not found");
      await page.close();
      return null;
    }

    await emailInput.click({ clickCount: 3 });
    await emailInput.type(creds.username, { delay: 30 });
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(creds.password, { delay: 30 });

    // Step 3: Click LOGIN submit button
    const loginBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((b) => b.textContent?.trim().toUpperCase().includes("LOGIN")) ?? null;
    });

    if (loginBtn && (loginBtn as unknown as { asElement: () => unknown }).asElement?.()) {
      await (loginBtn as unknown as import("puppeteer").ElementHandle).click();
    } else {
      // Fallback: press Enter
      await passwordInput.press("Enter");
    }

    await page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 })
      .catch(() => {});
    await page.waitForNetworkIdle({ idleTime: 1500, timeout: 10_000 }).catch(() => {});

    // Step 4: Handle verification page — click SKIP if present
    const skipBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((b) => b.textContent?.trim().toUpperCase().includes("SKIP")) ?? null;
    });

    if (skipBtn && (skipBtn as unknown as { asElement: () => unknown }).asElement?.()) {
      await (skipBtn as unknown as import("puppeteer").ElementHandle).click();
      await page
        .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10_000 })
        .catch(() => {});
      logger.debug("🟣 Clicked SKIP on verification page");
    }

    // Verify login succeeded — should NOT still have a password input
    const stillOnLogin = await page.$('input[type="password"]');
    if (stillOnLogin) {
      logger.warn("🌕 Login appears unsuccessful — still on login page");
      await page.close();
      return null;
    }

    logger.info("🟢 Login successful");
    return page;
  } catch (err) {
    logger.error("🔴 Login failed", { err });
    await page.close().catch(() => {});
    return null;
  }
}

// ─── Bid placement via Puppeteer ─────────────────────────────────────────────

/**
 * Navigate to the lot page and place a bid using the dropdown selector.
 *
 * The ABC Auctions bid interface uses a dropdown of valid bid increments
 * (e.g. US$90, US$100) rather than a free-text input. We select the closest
 * option that doesn't exceed our target amount.
 */
async function placeBid(page: Page, productUrl: string, amount: number): Promise<boolean> {
  logger.info("🟢 Placing bid", { productUrl, amount });

  try {
    // Navigate to lot detail
    await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForFunction(SITE_READY, { timeout: 20_000 });
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 15_000 }).catch(() => {});

    // Wait for the bid section to be available
    // Look for "Bid" button or bid dropdown
    await page.waitForFunction(
      () => {
        const buttons = Array.from(document.querySelectorAll("button"));
        return buttons.some(
          (b) =>
            b.textContent?.trim().toUpperCase() === "BID" ||
            b.textContent?.trim().toUpperCase() === "PLACE BID"
        );
      },
      { timeout: 15_000 }
    );

    // Try to find and interact with the bid dropdown
    // The bid dropdown lists available bid amounts like US$90.00, US$100.00 etc.
    const bidSelected = await page.evaluate((targetAmount: number) => {
      // Look for select elements or dropdown-like elements
      const selects = Array.from(document.querySelectorAll("select"));
      for (const sel of selects) {
        const options = Array.from(sel.options);
        // Find the best option that's <= targetAmount
        let bestOption: HTMLOptionElement | null = null;
        for (const opt of options) {
          const val = parseFloat(opt.value.replace(/[^0-9.]/g, ""));
          if (!isNaN(val) && val <= targetAmount) {
            if (!bestOption || val > parseFloat(bestOption.value.replace(/[^0-9.]/g, ""))) {
              bestOption = opt;
            }
          }
        }
        if (bestOption) {
          sel.value = bestOption.value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }

      // Fallback: look for a text input for bid amount
      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          'input[type="number"], input[placeholder*="bid" i], input[name*="bid" i], input[class*="bid" i]'
        )
      );
      if (inputs.length > 0) {
        const input = inputs[0];
        // Clear and set value using native setter to trigger Angular change detection
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, String(targetAmount));
        } else {
          input.value = String(targetAmount);
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }

      // Fallback 2: look for mat-select or custom dropdown
      const matSelect = document.querySelector("mat-select");
      if (matSelect) {
        (matSelect as HTMLElement).click();
        return false; // Signal that we clicked the dropdown
      }

      return false;
    }, amount);

    if (!bidSelected) {
      // If we clicked a mat-select dropdown, wait and pick option
      await sleep(500);
      const optionClicked = await page.evaluate((targetAmount: number) => {
        const options = Array.from(
          document.querySelectorAll<HTMLElement>("mat-option, [role='option'], .cdk-option")
        );
        let bestOpt: HTMLElement | null = null;
        let bestVal = 0;
        for (const opt of options) {
          const text = opt.textContent ?? "";
          const val = parseFloat(text.replace(/[^0-9.]/g, ""));
          if (!isNaN(val) && val <= targetAmount && val > bestVal) {
            bestOpt = opt;
            bestVal = val;
          }
        }
        if (bestOpt) {
          bestOpt.click();
          return true;
        }
        return false;
      }, amount);

      if (!optionClicked) {
        logger.warn("🌕 Could not select bid amount", { amount });
        return false;
      }
    }

    await sleep(500);

    // Click the BID button
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const bidBtn = buttons.find(
        (b) =>
          b.textContent?.trim().toUpperCase() === "BID" ||
          b.textContent?.trim().toUpperCase() === "PLACE BID"
      );
      if (bidBtn && !bidBtn.disabled) {
        bidBtn.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      logger.warn("🌕 Bid button not found or disabled");
      return false;
    }

    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 10_000 }).catch(() => {});

    // Check for confirmation dialog and confirm if present
    await sleep(1000);
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const confirmBtn = buttons.find(
        (b) =>
          b.textContent?.trim().toUpperCase().includes("CONFIRM") ||
          b.textContent?.trim().toUpperCase().includes("YES") ||
          b.textContent?.trim().toUpperCase().includes("OK")
      );
      if (confirmBtn) confirmBtn.click();
    });

    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 5_000 }).catch(() => {});

    logger.info("🟢 Bid submitted", { productUrl, amount });
    return true;
  } catch (err) {
    logger.error("🔴 Bid placement failed", { productUrl, amount, err });
    return false;
  }
}

export async function placeManualBid(productUrl: string, amount: number): Promise<boolean> {
  const browser = await launchBrowser();
  try {
    const page = await loginWithPuppeteer(browser);
    if (!page) return false;
    return await placeBid(page, productUrl, amount);
  } finally {
    await browser.close();
  }
}

// ─── Monitor loop ────────────────────────────────────────────────────────────

async function monitorLoop(id: string): Promise<void> {
  logger.info("🟢 Monitor loop started", { id });

  // Pre-launch browser and login for the whole monitor session
  let browser: Browser | null = null;
  let loggedInPage: Page | null = null;

  while (true) {
    if (stopSignals.get(id)) {
      logger.info("🟢 Stop signal received", { id });
      await updateStatus(id, "stopped");
      stopSignals.delete(id);
      monitorStatuses.delete(id);
      if (browser) await browser.close().catch(() => {});
      return;
    }

    await connectDB();
    const watched = await WatchedProduct.findById(id);
    if (!watched) {
      logger.warn("🌕 Watched product not found, stopping monitor", { id });
      if (browser) await browser.close().catch(() => {});
      return;
    }

    const now = Date.now();
    const endTime = new Date(watched.auctionEndTime).getTime();
    const timeLeft = endTime - now;

    // Auction already over
    if (timeLeft <= 0) {
      const currentPrice = await getCurrentPrice(watched.productUrl);
      const status: BidderStatus =
        currentPrice != null &&
        watched.lastBidAmount != null &&
        currentPrice <= watched.lastBidAmount
          ? "won"
          : "outbid";
      await updateStatus(id, status);
      logger.info(`🟢 Auction ended — status: ${status}`, { id });
      monitorStatuses.delete(id);
      if (browser) await browser.close().catch(() => {});
      return;
    }

    // More than 24 hours left — keep waiting (use API for price, no browser)
    if (timeLeft > TWENTY_FOUR_HOURS_MS) {
      await updateStatus(id, "waiting");
      logger.debug("🟣 Waiting for auction window", {
        id,
        minutesLeft: Math.round(timeLeft / 60000),
      });
      await sleep(POLL_INTERVAL_WAITING_MS);
      continue;
    }

    // Within 24 hours — get current price via API (fast!)
    const currentPrice = await getCurrentPrice(watched.productUrl);

    if (currentPrice === null) {
      logger.warn("🌕 Could not read current price, retrying", { id });
      const pollInterval =
        timeLeft <= TEN_MINUTES_MS ? POLL_INTERVAL_FINAL_BID_MS : POLL_INTERVAL_EARLY_BID_MS;
      await sleep(pollInterval);
      continue;
    }

    if (currentPrice >= watched.maxBid) {
      logger.info("🟢 Price reached maxBid — stopping", {
        id,
        currentPrice,
        maxBid: watched.maxBid,
      });
      await updateStatus(id, "stopped");
      monitorStatuses.delete(id);
      if (browser) await browser.close().catch(() => {});
      return;
    }

    // Decision: should we bid?
    const isFinalWindow = timeLeft <= TEN_MINUTES_MS;
    const hasPlacedEarlyBid = watched.lastBidAmount != null;
    const isOutbid = watched.lastBidAmount != null && currentPrice > watched.lastBidAmount;

    const shouldPlaceEarlyBid =
      !isFinalWindow && !hasPlacedEarlyBid && currentPrice >= watched.minBid;
    const shouldPlaceRecursiveBid =
      isFinalWindow && currentPrice >= watched.minBid && (!hasPlacedEarlyBid || isOutbid);

    if (shouldPlaceEarlyBid || shouldPlaceRecursiveBid) {
      const bidAmount = Math.min(currentPrice + 1, watched.maxBid);
      await updateStatus(id, "active");

      // Lazy-launch browser and login only when we actually need to bid
      if (!browser || !loggedInPage) {
        browser = await launchBrowser();
        loggedInPage = await loginWithPuppeteer(browser);
        if (!loggedInPage) {
          logger.warn("🌕 Cannot login — stopping bidder", { id });
          await updateStatus(id, "stopped");
          monitorStatuses.delete(id);
          if (browser) await browser.close().catch(() => {});
          return;
        }
      }

      const success = await placeBid(loggedInPage, watched.productUrl, bidAmount);

      if (success) {
        const bidTime = new Date().toISOString();
        await updateStatus(id, "active", {
          lastBidAmount: bidAmount,
          lastBidAt: bidTime,
        });
      }
    } else {
      logger.debug("🟣 Bidding conditions not met", {
        id,
        currentPrice,
        minBid: watched.minBid,
        isFinalWindow,
        hasPlacedEarlyBid,
        isOutbid,
      });
    }

    const pollInterval = isFinalWindow ? POLL_INTERVAL_FINAL_BID_MS : POLL_INTERVAL_EARLY_BID_MS;
    await sleep(pollInterval);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public exports ──────────────────────────────────────────────────────────

export function startMonitor(watchedProductId: string): void {
  if (monitorStatuses.has(watchedProductId)) {
    logger.warn("🌕 Monitor already running", { watchedProductId });
    return;
  }
  stopSignals.set(watchedProductId, false);
  monitorStatuses.set(watchedProductId, {
    watchedProductId,
    bidderStatus: "waiting",
    lastBidAmount: null,
    lastBidAt: null,
  });
  monitorLoop(watchedProductId).catch((err) => {
    logger.error("🔴 Monitor loop crashed", { watchedProductId, err });
    monitorStatuses.delete(watchedProductId);
  });
}

export function stopMonitor(watchedProductId: string): void {
  stopSignals.set(watchedProductId, true);
}

export function getMonitorStatuses(): MonitorStatus[] {
  return Array.from(monitorStatuses.values());
}
