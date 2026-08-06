/**
 * ABC Auctions API Client
 *
 * Handles authenticated API calls (login, bid placement, price checks)
 * using direct REST calls — no Puppeteer needed.
 *
 * The login endpoint requires a CAPTCHA code that can't be automated,
 * so we store a JWT token that the user provides (from a manual login
 * session). It is persisted to MongoDB so it survives process restarts,
 * and the UI warns before it expires.
 *
 * All outbound calls go through `limitedFetch` (see rate-limiter.ts).
 */

import logger from "@/lib/logger";
import connectDB from "@/lib/mongoose";
import AuthToken from "@/models/AuthToken";
import { limitedFetch } from "./rate-limiter";
import { TOKEN_EXPIRY_WARNING_MS } from "./constants";
import { BidIncrementTier, FALLBACK_BID_INCREMENTS } from "./bid-ladder";

// The ladder maths lives in bid-ladder.ts (import-free so it can be verified
// directly against the live API — see scripts/verify-bid-ladder.mjs).
export * from "./bid-ladder";

const API_BASE = process.env.ABC_AUCTIONS_API_URL ?? "https://app-api.abcauctions.co.zw";
const SITE_BASE = process.env.ABC_AUCTIONS_BASE_URL ?? "https://app.abcauctions.co.zw";

// ─── Shared request headers ────────────────────────────────────────────────

const BASE_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "Content-Type": "application/json",
  AppPlatform: "3",
  BuildNumber: "1520",
  Origin: SITE_BASE,
  Referer: `${SITE_BASE}/`,
};

// ─── Token state ───────────────────────────────────────────────────────────

interface StoredToken {
  token: string;
  expiresAt: number; // Unix ms
  sub: string; // user ID from JWT
  sid: number; // session ID from JWT
}

let currentToken: StoredToken | null = null;

/** Decode JWT payload (no verification — the server does that). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// ─── Token management ──────────────────────────────────────────────────────

export interface StoredTokenSummary {
  sub: string;
  sid: number;
  expiresAt: string;
  expiresInHours: number;
}

/**
 * Store a JWT token in memory (provided by the user from a manual login).
 * Returns token info or null if the token is invalid/expired.
 *
 * Does not persist — use `storeAuthToken` for that.
 */
export function setAuthToken(token: string): StoredTokenSummary | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") {
    logger.warn("🌕 Invalid JWT token — could not decode payload");
    return null;
  }

  const expiresAt = payload.exp * 1000; // Convert to ms
  const now = Date.now();

  if (expiresAt <= now) {
    logger.warn("🌕 JWT token is already expired", {
      exp: new Date(expiresAt).toISOString(),
    });
    return null;
  }

  currentToken = {
    token,
    expiresAt,
    sub: String(payload.sub ?? ""),
    sid: Number(payload.sid ?? 0),
  };

  const expiresInHours = Math.round(((expiresAt - now) / 3600000) * 10) / 10;
  logger.info("🟢 Auth token stored", {
    sub: currentToken.sub,
    sid: currentToken.sid,
    expiresAt: new Date(expiresAt).toISOString(),
    expiresInHours,
  });

  return {
    sub: currentToken.sub,
    sid: currentToken.sid,
    expiresAt: new Date(expiresAt).toISOString(),
    expiresInHours,
  };
}

/**
 * Get the current auth token if it's still valid.
 * Returns null if no token or if it's expired.
 *
 * This is the synchronous, in-memory view. Server code that may run on a
 * freshly booted process should prefer `ensureAuthToken()`, which falls back
 * to the persisted copy in MongoDB.
 */
export function getAuthToken(): string | null {
  if (!currentToken) return null;
  if (Date.now() >= currentToken.expiresAt) {
    logger.warn("🌕 Auth token expired");
    currentToken = null;
    return null;
  }
  return currentToken.token;
}

// ─── Persistence ───────────────────────────────────────────────────────────

/** Write the in-memory token through to MongoDB. */
async function persistToken(stored: StoredToken): Promise<void> {
  try {
    await connectDB();
    await AuthToken.findOneAndUpdate(
      { singleton: "abc-auctions" },
      {
        singleton: "abc-auctions",
        token: stored.token,
        expiresAt: new Date(stored.expiresAt),
        sub: stored.sub,
        sid: stored.sid,
      },
      { upsert: true }
    );
    logger.info("🟢 Auth token persisted to MongoDB");
  } catch (err) {
    // The token still works in-memory — persistence failing is not fatal.
    logger.error("🔴 Failed to persist auth token", { err });
  }
}

/**
 * Load the persisted token into memory. Returns true if a usable token was
 * restored. Called on boot and lazily whenever memory is empty.
 */
export async function loadPersistedToken(): Promise<boolean> {
  try {
    await connectDB();
    const doc = await AuthToken.findOne({ singleton: "abc-auctions" }).lean();
    if (!doc) return false;

    const expiresAt = new Date(doc.expiresAt).getTime();
    if (Date.now() >= expiresAt) {
      logger.warn("🌕 Persisted auth token has expired — a new token is needed", {
        expiredAt: new Date(expiresAt).toISOString(),
      });
      return false;
    }

    currentToken = {
      token: doc.token,
      expiresAt,
      sub: doc.sub ?? "",
      sid: doc.sid ?? 0,
    };

    logger.info("🟢 Auth token restored from MongoDB", {
      sub: currentToken.sub,
      expiresAt: new Date(expiresAt).toISOString(),
    });
    return true;
  } catch (err) {
    logger.error("🔴 Failed to load persisted auth token", { err });
    return false;
  }
}

/**
 * Get a valid token, falling back to the persisted copy when this process
 * has just started. Use this from the bidder and any long-running job.
 */
export async function ensureAuthToken(): Promise<string | null> {
  const inMemory = getAuthToken();
  if (inMemory) return inMemory;

  // Env var takes priority — it is how a fresh deploy is seeded.
  initTokenFromEnv();
  const fromEnv = getAuthToken();
  if (fromEnv) return fromEnv;

  await loadPersistedToken();
  return getAuthToken();
}

/**
 * Store a token and persist it. Prefer this over `setAuthToken` anywhere the
 * token should survive a restart.
 */
export async function storeAuthToken(token: string): Promise<StoredTokenSummary | null> {
  const result = setAuthToken(token);
  if (result && currentToken) {
    await persistToken(currentToken);
  }
  return result;
}

/**
 * Get info about the current token (for UI display).
 */
export interface TokenInfo {
  hasToken: boolean;
  sub: string | null;
  expiresAt: string | null;
  expiresInHours: number | null;
  isExpired: boolean;
  /** True once the token is close enough to expiry that bidding is at risk. */
  isExpiringSoon: boolean;
}

export function getTokenInfo(): TokenInfo {
  if (!currentToken) {
    return {
      hasToken: false,
      sub: null,
      expiresAt: null,
      expiresInHours: null,
      isExpired: false,
      isExpiringSoon: false,
    };
  }

  const now = Date.now();
  const msRemaining = currentToken.expiresAt - now;
  const isExpired = msRemaining <= 0;
  const expiresInHours = isExpired ? 0 : Math.round((msRemaining / 3600000) * 10) / 10;

  return {
    hasToken: true,
    sub: currentToken.sub,
    expiresAt: new Date(currentToken.expiresAt).toISOString(),
    expiresInHours,
    isExpired,
    isExpiringSoon: !isExpired && msRemaining <= TOKEN_EXPIRY_WARNING_MS,
  };
}

/**
 * Token info that also consults the persisted copy, so a freshly booted
 * process reports the real state rather than "no token".
 */
export async function getTokenInfoAsync(): Promise<TokenInfo> {
  await ensureAuthToken();
  return getTokenInfo();
}

/** Clear the stored token, in memory and in MongoDB. */
export async function clearAuthToken(): Promise<void> {
  currentToken = null;
  try {
    await connectDB();
    await AuthToken.deleteOne({ singleton: "abc-auctions" });
  } catch (err) {
    logger.error("🔴 Failed to delete persisted auth token", { err });
  }
  logger.info("🟢 Auth token cleared");
}

/**
 * Initialize token from env var if available and no token is stored yet.
 * Call this at startup / on first use.
 */
export function initTokenFromEnv(): void {
  if (currentToken) return; // Already have a token
  const envToken = process.env.ABC_AUCTIONS_TOKEN;
  if (envToken) {
    const result = setAuthToken(envToken);
    if (result) {
      logger.info("🟢 Auth token loaded from ABC_AUCTIONS_TOKEN env var", {
        expiresInHours: result.expiresInHours,
      });
    }
  }
}

// Auto-initialize from env on module load
initTokenFromEnv();

// ─── API Login (for when the user provides a CAPTCHA code) ─────────────────

/**
 * Login via the API. Requires the CAPTCHA `code` from the frontend.
 * Normally the user logs in manually and we just store the token,
 * but this can be used if the code is available.
 */
export async function loginWithApi(
  email: string,
  password: string,
  code: string
): Promise<string | null> {
  try {
    const res = await limitedFetch(`${API_BASE}/onboarding/login`, {
      method: "POST",
      headers: BASE_HEADERS,
      body: JSON.stringify({ Email: email, Password: password, Code: code }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.warn("🌕 API login failed", { status: res.status, body: text });
      return null;
    }

    const data = await res.json();
    // The token might be in different places depending on the API response
    const token =
      data.Token ??
      data.token ??
      data.AccessToken ??
      data.accessToken ??
      data.access_token ??
      data.jwt;

    if (typeof token === "string" && token.length > 0) {
      setAuthToken(token);
      return token;
    }

    // Maybe the whole response IS the token (string response)
    if (typeof data === "string" && data.includes(".")) {
      setAuthToken(data);
      return data;
    }

    logger.warn("🌕 Could not find token in login response", {
      keys: Object.keys(data),
    });
    return null;
  } catch (err) {
    logger.error("🔴 API login error", { err });
    return null;
  }
}

// ─── Lot detail (price check) ──────────────────────────────────────────────

export interface LotDetailResponse {
  Id: number;
  CurrentBid: number | null;
  StartingBid: number;
  Status: number;
  EndDate: string;
  AuctionLotId: number;
  Type: number;
  /**
   * User-scoped fields. These are only meaningful when the request carried a
   * Bearer token — unauthenticated they come back as false/0 for everyone.
   */
  HighestBidder?: boolean;
  MaxBid?: number;
  Watching?: boolean;
  CurrentBidderId?: number | null;
  /** Canonical browser URL for the lot, as the site itself builds it. */
  Url?: string;
}

interface SearchLotResult {
  Id: number;
  AuctionLotId: number;
  LotNumber: number | string | null;
  Type: number;
  Title?: string;
}

interface LotSearchResponse {
  List: SearchLotResult[];
}

/**
 * Cache for AuctionLotId mapping (lot URL id → AuctionLotId).
 * This never changes for a given lot, so we cache it indefinitely.
 */
const auctionLotIdCache = new Map<string, number>();
const bidIdLookupCache = new Map<string, string>();

/**
 * Very short-lived cache of full lot details, opt-in via `maxAgeMs`.
 *
 * The watch list polls every 15s for N lots; without this, opening two browser
 * tabs would double the API load for no benefit. The bidder never opts in — it
 * must see the true current price before committing money.
 */
const lotDetailCache = new Map<string, { at: number; data: LotDetailResponse }>();

/**
 * Extract lot ID and type from a product URL.
 */
export function parseLotUrl(productUrl: string): { id: string; type: string } | null {
  const lotMatch = productUrl.match(/\/lot\/(\d+)\/(\d+)/);
  if (lotMatch) return { type: lotMatch[1], id: lotMatch[2] };

  const lotsMatch = productUrl.match(/\/lots\/(\d+)/);
  if (lotsMatch) return { type: "1", id: lotsMatch[1] };

  // Also handle query-style: ?id=123
  const idMatch = productUrl.match(/[?&]id=(\d+)/);
  if (idMatch) return { type: "1", id: idMatch[1] };

  return null;
}

/**
 * Normalise a lot URL to the form the ABC web app can actually route.
 *
 * The Angular app only knows `/lot/{type}/{id}`. An older scraper stored
 * `/lots/{id}`, which the SPA serves a 200 for (index.html is returned for any
 * path) but has no route for, so the tab opens to a blank page. Our own API
 * parsing accepts both, which is why this went unnoticed.
 */
export function canonicalLotUrl(productUrl: string): string {
  const parsed = parseLotUrl(productUrl);
  if (!parsed) return productUrl;
  return `${SITE_BASE}/lot/${parsed.type}/${parsed.id}`;
}

/**
 * Fetch the full lot detail from the API.
 * Always fetches fresh data — prices change frequently during active bidding.
 * Caches the AuctionLotId mapping separately (it never changes).
 *
 * Pass `{ authenticated: true }` to send the Bearer token, which makes the
 * API populate the user-scoped fields (`HighestBidder`, `MaxBid`, `Watching`).
 * `HighestBidder` is the only trustworthy "am I winning" signal — comparing
 * the current price to our last bid guesses wrong whenever someone else
 * matches our amount through the site's own proxy bidding.
 */
export async function getLotDetail(
  productUrl: string,
  opts?: { authenticated?: boolean; maxAgeMs?: number }
): Promise<LotDetailResponse | null> {
  const parsed = parseLotUrl(productUrl);
  if (!parsed) {
    logger.warn("🌕 Cannot parse lot URL", { productUrl });
    return null;
  }

  const cacheKey = `${parsed.type}:${parsed.id}:${opts?.authenticated ? "auth" : "anon"}`;
  if (opts?.maxAgeMs) {
    const hit = lotDetailCache.get(cacheKey);
    if (hit && Date.now() - hit.at < opts.maxAgeMs) return hit.data;
  }

  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (opts?.authenticated) {
    const token = await ensureAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      logger.debug("🟣 No token available — fetching lot detail unauthenticated");
    }
  }

  try {
    const url = `${API_BASE}/lots/detail?id=${parsed.id}&type=${parsed.type}`;
    const res = await limitedFetch(url, {
      headers,
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

    // Cache the AuctionLotId mapping (stable, never changes for a lot)
    auctionLotIdCache.set(`${parsed.type}:${parsed.id}`, data.AuctionLotId);
    lotDetailCache.set(cacheKey, { at: Date.now(), data });

    logger.debug("🔵 Lot detail fetched", {
      urlId: parsed.id,
      auctionLotId: data.AuctionLotId,
      currentBid: data.CurrentBid,
      highestBidder: data.HighestBidder,
    });

    return data;
  } catch (err) {
    logger.error("🔴 Failed to fetch lot detail", { productUrl, err });
    return null;
  }
}

/**
 * Get the AuctionLotId for a product URL.
 * Uses an in-memory cache (the mapping never changes for a lot).
 * Falls back to fetching the lot detail if not cached.
 */
export async function getAuctionLotId(productUrl: string): Promise<number | null> {
  const parsed = parseLotUrl(productUrl);
  if (!parsed) return null;

  const cacheKey = `${parsed.type}:${parsed.id}`;
  const cached = auctionLotIdCache.get(cacheKey);
  if (cached != null) return cached;

  const detail = await getLotDetail(productUrl);
  return detail?.AuctionLotId ?? null;
}

/**
 * Get current bid price via the REST API.
 * Always fetches fresh — never returns stale cached prices.
 */
export async function getCurrentPrice(productUrl: string): Promise<number | null> {
  const detail = await getLotDetail(productUrl);
  if (!detail) return null;
  return detail.CurrentBid ?? detail.StartingBid ?? null;
}

async function resolveAuctionLotIdFromSearch(identifier: string): Promise<string | null> {
  if (!/^\d+$/.test(identifier)) return null;

  const cached = bidIdLookupCache.get(identifier);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      Size: "50",
      Sort: "2",
      Query: identifier,
    });

    const res = await limitedFetch(`${API_BASE}/lots/search?${params.toString()}`, {
      headers: BASE_HEADERS,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as Partial<LotSearchResponse>;
    const list = Array.isArray(data.List) ? data.List : [];
    if (list.length === 0) return null;

    const numericId = Number(identifier);
    const exact = list.find((lot) => {
      const lotNumber = Number(lot.LotNumber);
      return (
        lot.Id === numericId ||
        lot.AuctionLotId === numericId ||
        (Number.isFinite(lotNumber) && lotNumber === numericId)
      );
    });

    const match = exact ?? list[0];
    if (!match || !Number.isFinite(match.AuctionLotId)) return null;

    const resolved = String(match.AuctionLotId);

    bidIdLookupCache.set(identifier, resolved);
    bidIdLookupCache.set(String(match.Id), resolved);
    bidIdLookupCache.set(String(match.AuctionLotId), resolved);
    if (match.LotNumber != null) {
      bidIdLookupCache.set(String(match.LotNumber), resolved);
    }

    logger.info("🔵 Resolved bid id via lots/search", {
      identifier,
      lotId: match.Id,
      auctionLotId: match.AuctionLotId,
      lotNumber: match.LotNumber,
      type: match.Type,
    });

    return resolved;
  } catch (err) {
    logger.debug("🟣 lots/search bid-id resolution failed", { identifier, err });
    return null;
  }
}

// ─── Bid increments ────────────────────────────────────────────────────────

let cachedIncrements: BidIncrementTier[] | null = null;
let incrementsFetchedAt = 0;
let usingFallback = false;
const INCREMENTS_TTL_MS = 6 * 60 * 60 * 1000;
/** Short TTL when we had to fall back, so a transient failure self-heals. */
const INCREMENTS_FALLBACK_TTL_MS = 5 * 60 * 1000;

/**
 * The live increment ladder, from `GET /profile/me` → `Settings.BidIncrements`.
 * This is the same source the website's own bid dropdown uses, so following it
 * guarantees our amounts land on boundaries the server will accept.
 */
export async function getBidIncrements(): Promise<BidIncrementTier[]> {
  const ttl = usingFallback ? INCREMENTS_FALLBACK_TTL_MS : INCREMENTS_TTL_MS;
  if (cachedIncrements && Date.now() - incrementsFetchedAt < ttl) {
    return cachedIncrements;
  }

  try {
    const res = await limitedFetch(`${API_BASE}/profile/me`, {
      headers: BASE_HEADERS,
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      const data = (await res.json()) as { Settings?: { BidIncrements?: BidIncrementTier[] } };
      const tiers = data.Settings?.BidIncrements;

      if (Array.isArray(tiers) && tiers.length > 0) {
        cachedIncrements = [...tiers].sort((a, b) => a.MinimumValue - b.MinimumValue);
        incrementsFetchedAt = Date.now();
        usingFallback = false;
        logger.debug("🔵 Bid increments refreshed", { tiers: cachedIncrements.length });
        return cachedIncrements;
      }
    }
    logger.warn("🌕 Could not read BidIncrements from /profile/me — using fallback ladder");
  } catch (err) {
    logger.warn("🌕 Failed to fetch bid increments — using fallback ladder", { err });
  }

  cachedIncrements = FALLBACK_BID_INCREMENTS;
  incrementsFetchedAt = Date.now();
  usingFallback = true;
  return cachedIncrements;
}

// ─── Bid placement via API ─────────────────────────────────────────────────

export interface BidResult {
  success: boolean;
  bidAmount?: number;
  requestUrl?: string;
  error?: string;
  response?: unknown;
}

async function resolveBidExternalId(
  externalId: string | null | undefined,
  productUrl?: string
): Promise<string | null> {
  const normalizedExternalId = externalId?.trim() ?? "";

  // Primary path: use payload/db externalId directly for bidding.
  if (/^\d+$/.test(normalizedExternalId)) {
    bidIdLookupCache.set(normalizedExternalId, normalizedExternalId);
    return normalizedExternalId;
  }

  if (productUrl) {
    const auctionLotId = await getAuctionLotId(productUrl);
    if (auctionLotId != null) {
      const resolved = String(auctionLotId);
      bidIdLookupCache.set(resolved, resolved);
      if (normalizedExternalId) {
        bidIdLookupCache.set(normalizedExternalId, resolved);
      }

      if (normalizedExternalId && normalizedExternalId !== resolved) {
        logger.info("🔵 Overriding bid id with AuctionLotId from URL", {
          providedExternalId: normalizedExternalId,
          resolvedExternalId: resolved,
          productUrl,
        });
      }
      return resolved;
    }

    const parsed = parseLotUrl(productUrl);
    if (parsed?.id) {
      const resolvedFromUrlId = await resolveAuctionLotIdFromSearch(parsed.id);
      if (resolvedFromUrlId) return resolvedFromUrlId;
    }
  }

  if (normalizedExternalId && /^\d+$/.test(normalizedExternalId)) {
    const resolvedViaSearch = await resolveAuctionLotIdFromSearch(normalizedExternalId);
    if (resolvedViaSearch) return resolvedViaSearch;

    // Fallback: externalId may be the lot page Id instead of AuctionLotId.
    // Try resolving via lots/detail (defaulting type=1 when URL is unavailable).
    try {
      const detailUrl = `${API_BASE}/lots/detail?id=${normalizedExternalId}&type=1`;
      const res = await limitedFetch(detailUrl, {
        headers: BASE_HEADERS,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = (await res.json()) as Partial<{ AuctionLotId: number }>;
        if (typeof data.AuctionLotId === "number" && Number.isFinite(data.AuctionLotId)) {
          const resolved = String(data.AuctionLotId);
          bidIdLookupCache.set(normalizedExternalId, resolved);
          bidIdLookupCache.set(resolved, resolved);

          if (resolved !== normalizedExternalId) {
            logger.info("🔵 Resolved lot id to AuctionLotId via fallback", {
              providedExternalId: normalizedExternalId,
              resolvedExternalId: resolved,
            });
          }
          return resolved;
        }
      }
    } catch {
      // Ignore and fall back to raw numeric id.
    }

    return normalizedExternalId;
  }

  return null;
}

/**
 * Place a bid using the direct API call.
 *
 * Endpoint: GET /bids/place?id={externalId}&amount={amount}
 * Requires: Bearer token in Authorization header
 *
 * The amount is automatically snapped to the nearest valid bid increment.
 */
export async function placeBidApi(
  externalId: string,
  amount: number,
  productUrl?: string
): Promise<BidResult> {
  const token = await ensureAuthToken();
  if (!token) {
    return {
      success: false,
      error:
        "No valid auth token. Please provide a JWT token via the /api/abc-auctions/auth/token endpoint.",
    };
  }

  // The caller is responsible for producing a ladder-valid amount (see
  // computeBidAmount). Re-snapping here would corrupt a correct amount, so we
  // only sanity-check it.
  const bidAmount = Math.round(amount * 100) / 100;
  if (!(bidAmount > 0)) {
    return { success: false, error: `Invalid bid amount: ${amount}` };
  }

  const resolvedExternalId = await resolveBidExternalId(externalId, productUrl);
  if (!resolvedExternalId) {
    return {
      success: false,
      error: productUrl
        ? `Could not resolve bid id for: ${productUrl}`
        : `Invalid externalId: ${externalId}`,
    };
  }

  const url = `${API_BASE}/bids/place?id=${resolvedExternalId}&amount=${bidAmount}`;

  logger.info("🟢 Placing bid via API", {
    externalId: resolvedExternalId,
    amount: bidAmount,
    url,
  });

  try {
    const res = await limitedFetch(url, {
      method: "GET",
      headers: {
        ...BASE_HEADERS,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (res.ok) {
      logger.info("🟢 Bid placed successfully via API", {
        externalId: resolvedExternalId,
        amount: bidAmount,
        response: data,
      });
      return { success: true, bidAmount, requestUrl: url, response: data };
    }

    // Handle specific error codes
    if (res.status === 401) {
      logger.warn("🌕 Auth token rejected — clearing token");
      await clearAuthToken();
      return {
        success: false,
        error: "Auth token expired or invalid. Please provide a new token.",
      };
    }

    logger.warn("🌕 Bid API returned error", {
      status: res.status,
      body: text,
    });
    return {
      success: false,
      requestUrl: url,
      error: `API error ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`,
    };
  } catch (err) {
    logger.error("🔴 Bid API request failed", { url, err });
    return {
      success: false,
      requestUrl: url,
      error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
