/**
 * ABC Auctions API Client
 *
 * Handles authenticated API calls (login, bid placement, price checks)
 * using direct REST calls — no Puppeteer needed.
 *
 * The login endpoint requires a CAPTCHA code that can't be automated,
 * so we store a JWT token that the user provides (from a manual login
 * session) and refresh it before expiry.
 */

import logger from "@/lib/logger";

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

/**
 * Store a JWT token (provided by the user from a manual login).
 * Returns token info or null if the token is invalid/expired.
 */
export function setAuthToken(token: string): {
  sub: string;
  sid: number;
  expiresAt: string;
  expiresInHours: number;
} | null {
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

/**
 * Get info about the current token (for UI display).
 */
export function getTokenInfo(): {
  hasToken: boolean;
  sub: string | null;
  expiresAt: string | null;
  expiresInHours: number | null;
  isExpired: boolean;
} {
  if (!currentToken) {
    return {
      hasToken: false,
      sub: null,
      expiresAt: null,
      expiresInHours: null,
      isExpired: false,
    };
  }

  const now = Date.now();
  const isExpired = now >= currentToken.expiresAt;
  const expiresInHours = isExpired
    ? 0
    : Math.round(((currentToken.expiresAt - now) / 3600000) * 10) / 10;

  return {
    hasToken: true,
    sub: currentToken.sub,
    expiresAt: new Date(currentToken.expiresAt).toISOString(),
    expiresInHours,
    isExpired,
  };
}

/** Clear the stored token. */
export function clearAuthToken(): void {
  currentToken = null;
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
    const res = await fetch(`${API_BASE}/onboarding/login`, {
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

interface LotDetailResponse {
  Id: number;
  CurrentBid: number | null;
  StartingBid: number;
  Status: number;
  EndDate: string;
  AuctionLotId: number;
  Type: number;
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
 * Fetch the full lot detail from the API.
 * Always fetches fresh data — prices change frequently during active bidding.
 * Caches the AuctionLotId mapping separately (it never changes).
 */
export async function getLotDetail(productUrl: string): Promise<LotDetailResponse | null> {
  const parsed = parseLotUrl(productUrl);
  if (!parsed) {
    logger.warn("🌕 Cannot parse lot URL", { productUrl });
    return null;
  }

  try {
    const url = `${API_BASE}/lots/detail?id=${parsed.id}&type=${parsed.type}`;
    const res = await fetch(url, {
      headers: BASE_HEADERS,
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
    const cacheKey = `${parsed.type}:${parsed.id}`;
    auctionLotIdCache.set(cacheKey, data.AuctionLotId);

    logger.debug("🔵 Lot detail fetched", {
      urlId: parsed.id,
      auctionLotId: data.AuctionLotId,
      currentBid: data.CurrentBid,
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

    const res = await fetch(`${API_BASE}/lots/search?${params.toString()}`, {
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

// ─── Bid increment tiers ───────────────────────────────────────────────────

/**
 * ABC Auctions only accepts bids at specific increment boundaries.
 * These tiers define: [maxPrice, increment] — the increment applies
 * for prices up to (and including) maxPrice.
 *
 * Verified from live dropdown data:
 *   $3 lot: 4,5,6,7,8,9,10,12,14,16,18,20,25,30,35,40,45,50,60,70,80,90,100,...
 *   $120 lot: 130,140,...,200,225,250,...,500,550,600,...,1000,1100,...,3000
 */
const BID_INCREMENT_TIERS: Array<[number, number]> = [
  [10, 1], // $0 – $10:      $1 increments   → 1, 2, 3, ... 10
  [20, 2], // $10 – $20:     $2 increments   → 12, 14, 16, 18, 20
  [50, 5], // $20 – $50:     $5 increments   → 25, 30, 35, 40, 45, 50
  [100, 10], // $50 – $100:    $10 increments  → 60, 70, 80, 90, 100
  [200, 10], // $100 – $200:   $10 increments  → 110, 120, ... 200
  [500, 25], // $200 – $500:   $25 increments  → 225, 250, ... 500
  [1000, 50], // $500 – $1000:  $50 increments  → 550, 600, ... 1000
  [Infinity, 100], // $1000+:        $100 increments → 1100, 1200, ... 3000+
];

/**
 * Get the bid increment for a given price.
 */
export function getBidIncrement(currentPrice: number): number {
  for (const [maxPrice, increment] of BID_INCREMENT_TIERS) {
    if (currentPrice < maxPrice) return increment;
  }
  return 250; // fallback
}

/**
 * Get the next valid bid amount above the current price.
 * Snaps UP to the nearest valid increment boundary.
 */
export function getNextValidBid(currentPrice: number): number {
  const increment = getBidIncrement(currentPrice);
  // Round up to the next increment boundary
  return Math.ceil((currentPrice + 1) / increment) * increment;
}

/**
 * Snap a desired bid amount to the nearest valid amount (round down).
 * Returns the highest valid bid that doesn't exceed the desired amount.
 */
export function snapToValidBid(desiredAmount: number): number {
  const increment = getBidIncrement(desiredAmount);
  return Math.floor(desiredAmount / increment) * increment;
}

/**
 * Given a current price and a max budget, compute the bid amount to place.
 * Returns the next valid bid above currentPrice, capped at maxBid.
 * Returns null if the next valid bid exceeds maxBid.
 */
export function computeBidAmount(currentPrice: number, maxBid: number): number | null {
  const nextBid = getNextValidBid(currentPrice);
  if (nextBid > maxBid) return null;
  return nextBid;
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
      const res = await fetch(detailUrl, {
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
  const token = getAuthToken();
  if (!token) {
    return {
      success: false,
      error:
        "No valid auth token. Please provide a JWT token via the /api/abc-auctions/auth/token endpoint.",
    };
  }

  // Snap to a valid bid amount
  const bidAmount = snapToValidBid(amount);
  if (bidAmount <= 0) {
    return { success: false, error: `Invalid bid amount after snapping: ${amount} → ${bidAmount}` };
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
    const res = await fetch(url, {
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
      clearAuthToken();
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
