/**
 * Global rate limiter for the ABC Auctions API.
 *
 * Every outbound call to app-api.abcauctions.co.zw goes through `limitedFetch`
 * so the sniper can poll a dozen closing lots at 15s intervals without ever
 * bursting into the API. A 429/503 puts the whole bucket into backoff — the
 * limit is per-account, so backing off one caller and not the others would be
 * pointless.
 */

import logger from "@/lib/logger";

const SUSTAINED_RATE_PER_SEC = 5;
const BURST_CAPACITY = 10;
const MAX_BACKOFF_MS = 60_000;
const BASE_BACKOFF_MS = 2_000;

let tokens = BURST_CAPACITY;
let lastRefill = Date.now();

/** Timestamp until which all requests must wait (set by 429/503 responses). */
let backoffUntil = 0;
let consecutiveThrottles = 0;

function refill(): void {
  const now = Date.now();
  const elapsedSec = (now - lastRefill) / 1000;
  if (elapsedSec <= 0) return;
  tokens = Math.min(BURST_CAPACITY, tokens + elapsedSec * SUSTAINED_RATE_PER_SEC);
  lastRefill = now;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until a token is available and the backoff window has passed. */
async function acquire(): Promise<void> {
  for (;;) {
    const now = Date.now();

    if (now < backoffUntil) {
      await sleep(backoffUntil - now);
      continue;
    }

    refill();
    if (tokens >= 1) {
      tokens -= 1;
      return;
    }

    // Wait just long enough for the next token to appear.
    await sleep(Math.ceil(((1 - tokens) / SUSTAINED_RATE_PER_SEC) * 1000));
  }
}

function noteThrottled(retryAfterHeader: string | null): void {
  consecutiveThrottles += 1;

  const retryAfterSec = Number(retryAfterHeader);
  const serverDelay =
    Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 0;

  // Exponential backoff, but always respect a server-supplied Retry-After.
  const ourDelay = Math.min(BASE_BACKOFF_MS * 2 ** (consecutiveThrottles - 1), MAX_BACKOFF_MS);
  const delay = Math.max(serverDelay, ourDelay);

  backoffUntil = Date.now() + delay;
  tokens = 0;

  logger.warn("🌕 ABC API throttled — backing off", {
    delayMs: delay,
    consecutiveThrottles,
  });
}

function noteSuccess(): void {
  if (consecutiveThrottles > 0) {
    logger.info("🟢 ABC API backoff cleared");
    consecutiveThrottles = 0;
  }
}

/**
 * Rate-limited `fetch`. Same signature as the global, plus transparent
 * retry on 429/503 responses.
 */
export async function limitedFetch(
  url: string,
  init?: RequestInit,
  opts?: { retries?: number }
): Promise<Response> {
  const retries = opts?.retries ?? 2;

  for (let attempt = 0; ; attempt++) {
    await acquire();
    const res = await fetch(url, init);

    if (res.status === 429 || res.status === 503) {
      noteThrottled(res.headers.get("Retry-After"));
      if (attempt < retries) continue;
      return res;
    }

    noteSuccess();
    return res;
  }
}

/** Current limiter state, for the settings/diagnostics UI. */
export function getRateLimiterState(): {
  availableTokens: number;
  backoffMsRemaining: number;
  consecutiveThrottles: number;
} {
  refill();
  return {
    availableTokens: Math.floor(tokens),
    backoffMsRemaining: Math.max(0, backoffUntil - Date.now()),
    consecutiveThrottles,
  };
}
