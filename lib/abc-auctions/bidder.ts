import connectDB from "@/lib/mongoose";
import WatchedProduct from "@/models/WatchedProduct";
import logger from "@/lib/logger";
import { BidderStatus, MonitorStatus } from "./types";
import { ELEVEN_MINUTES_MS, POLL_INTERVAL_WAITING_MS, POLL_INTERVAL_ACTIVE_MS } from "./constants";
import { launchBrowser, launchPage, SITE_READY } from "./browser";

// In-memory stop-signal registry — survives for the lifetime of the Node process
const stopSignals = new Map<string, boolean>(); // id → true means "stop requested"
const monitorStatuses = new Map<string, MonitorStatus>();

async function updateStatus(id: string, status: BidderStatus, extra?: Partial<MonitorStatus>) {
  await connectDB();
  await WatchedProduct.findByIdAndUpdate(id, {
    bidderStatus: status,
    ...( extra?.lastBidAmount != null && { lastBidAmount: extra.lastBidAmount }),
    ...(extra?.lastBidAt     != null && { lastBidAt: extra.lastBidAt }),
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

async function getCurrentPrice(productUrl: string): Promise<number | null> {
  const browser = await launchBrowser();
  const page = await launchPage(browser);

  try {
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(SITE_READY, { timeout: 20000 });

    const price = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        "[class*='current-bid'], [class*='current_bid'], [class*='currentBid'], [class*='price']"
      );
      if (!el) return null;
      return parseFloat(el.innerText.replace(/[^0-9.]/g, "")) || null;
    });

    return price;
  } catch (err) {
    logger.error("🔴 Failed to fetch current price", { productUrl, err });
    return null;
  } finally {
    await browser.close();
  }
}

async function placeBid(productUrl: string, amount: number): Promise<boolean> {
  logger.info("🟢 Placing bid", { productUrl, amount });
  const browser = await launchBrowser();
  const page = await launchPage(browser);

  try {
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(SITE_READY, { timeout: 20000 });

    // Find bid input and submit — selectors to be confirmed once real DOM is observed
    const bidInput = await page.$(
      "input[class*='bid'], input[placeholder*='bid'], input[name*='bid'], input[type='number']"
    );
    if (!bidInput) {
      logger.warn("🌕 Bid input not found", { productUrl });
      return false;
    }

    await bidInput.click({ clickCount: 3 });
    await bidInput.type(String(amount));

    const submitBtn = await page.$(
      "button[class*='bid'], button[class*='submit'], button[type='submit']"
    );
    if (!submitBtn) {
      logger.warn("🌕 Bid submit button not found", { productUrl });
      return false;
    }

    await submitBtn.click();
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }).catch(() => {});

    logger.info("🟢 Bid submitted", { productUrl, amount });
    return true;
  } catch (err) {
    logger.error("🔴 Bid placement failed", { productUrl, amount, err });
    return false;
  } finally {
    await browser.close();
  }
}

async function monitorLoop(id: string): Promise<void> {
  logger.info("🟢 Monitor loop started", { id });

  while (true) {
    if (stopSignals.get(id)) {
      logger.info("🟢 Stop signal received", { id });
      await updateStatus(id, "stopped");
      stopSignals.delete(id);
      monitorStatuses.delete(id);
      return;
    }

    await connectDB();
    const watched = await WatchedProduct.findById(id);
    if (!watched) {
      logger.warn("🌕 Watched product not found, stopping monitor", { id });
      return;
    }

    const now = Date.now();
    const endTime = new Date(watched.auctionEndTime).getTime();
    const timeLeft = endTime - now;

    // Auction already over
    if (timeLeft <= 0) {
      const currentPrice = await getCurrentPrice(watched.productUrl);
      const status: BidderStatus =
        currentPrice != null && watched.lastBidAmount != null && currentPrice <= watched.lastBidAmount
          ? "won"
          : "outbid";
      await updateStatus(id, status);
      logger.info(`🟢 Auction ended — status: ${status}`, { id });
      monitorStatuses.delete(id);
      return;
    }

    // More than 11 minutes left — keep waiting
    if (timeLeft > ELEVEN_MINUTES_MS) {
      await updateStatus(id, "waiting");
      logger.debug("🟣 Waiting for auction window", { id, minutesLeft: Math.round(timeLeft / 60000) });
      await sleep(POLL_INTERVAL_WAITING_MS);
      continue;
    }

    // Within 11 minutes — active bidding phase
    const currentPrice = await getCurrentPrice(watched.productUrl);

    if (currentPrice === null) {
      logger.warn("🌕 Could not read current price, retrying", { id });
      await sleep(POLL_INTERVAL_ACTIVE_MS);
      continue;
    }

    if (currentPrice >= watched.maxBid) {
      logger.info("🟢 Price reached maxBid — stopping", { id, currentPrice, maxBid: watched.maxBid });
      await updateStatus(id, "stopped");
      monitorStatuses.delete(id);
      return;
    }

    if (currentPrice >= watched.minBid) {
      const bidAmount = Math.min(currentPrice + 1, watched.maxBid);
      await updateStatus(id, "active");
      const success = await placeBid(watched.productUrl, bidAmount);

      if (success) {
        const now = new Date().toISOString();
        await updateStatus(id, "active", { lastBidAmount: bidAmount, lastBidAt: now });
      }
    } else {
      logger.debug("🟣 Price below minBid — not bidding yet", { id, currentPrice, minBid: watched.minBid });
    }

    await sleep(POLL_INTERVAL_ACTIVE_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  // Fire and forget — intentionally not awaited
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
