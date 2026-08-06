/**
 * Lifecycle of a watched lot.
 *
 *   idle       — added to the watch list, monitoring not started
 *   waiting    — monitored, but still outside the snipe window
 *   armed      — inside the snipe window, watching for the moment to bid
 *   bidding    — a bid request is in flight
 *   winning    — we hold the high bid
 *   outbid     — someone is above us and we still have budget left
 *   maxReached — price is beyond maxBid; we stop bidding but keep watching
 *                so the final outcome gets recorded
 *   won        — auction closed with us on top
 *   lost       — auction closed with someone else on top
 *   stopped    — paused by the user
 *   error      — last poll or bid failed; see lastError
 */
export const BIDDER_STATUSES = [
  "idle",
  "waiting",
  "armed",
  "bidding",
  "winning",
  "outbid",
  "maxReached",
  "won",
  "lost",
  "stopped",
  "error",
] as const;

export type BidderStatus = (typeof BIDDER_STATUSES)[number];

/** Statuses where the scheduler stops touching the lot entirely. */
export const TERMINAL_BIDDER_STATUSES: readonly BidderStatus[] = ["won", "lost", "stopped"];

/** Statuses where the lot is under active automated management. */
export const RUNNING_BIDDER_STATUSES: readonly BidderStatus[] = [
  "waiting",
  "armed",
  "bidding",
  "winning",
  "outbid",
];

export interface AuctionProductData {
  externalId: string;
  title: string;
  imageUrl: string;
  currentPrice: number;
  maxPrice: number;
  auctionEndTime: string; // ISO string
  lotNumber: string;
  category: string;
  productUrl: string;
  scrapedAt: string;
}

export interface BidStatusData {
  status?: string; // winning, losing, overMax, failed, outbid
  amount?: number;
  currentPrice?: number;
  maxBid?: number;
  isOutbid?: boolean;
  finalStatus?: string; // won, lost, tied
}

export interface WatchedProductData {
  _id: string;
  externalId: string;
  productUrl: string;
  title: string;
  imageUrl: string;
  minBid: number;
  maxBid: number;
  bidderStatus: BidderStatus;
  lastBidAmount: number | null;
  lastBidAt: string | null;
  currentPrice: number | null;
  isHighestBidder: boolean | null;
  bidCount: number;
  lastError: string | null;
  auctionEndTime: string;
  createdAt: string;
  /** Set by GET /api/abc-auctions/watch — the auction has finished. */
  isClosed?: boolean;
  latestBidStatus?: BidStatusData;
}

export interface MonitorStatus {
  watchedProductId: string;
  bidderStatus: BidderStatus;
  lastBidAmount: number | null;
  lastBidAt: string | null;
  currentPrice: number | null;
  isHighestBidder: boolean | null;
  bidCount: number;
  lastError: string | null;
  auctionEndTime: string;
  /** Milliseconds until this lot enters the snipe window (0 once inside). */
  msUntilSnipeWindow: number;
}

export interface SchedulerState {
  running: boolean;
  activeLots: number;
  lotsInSnipeWindow: number;
  lastTickAt: string | null;
  snipeWindowMinutes: number;
}

export interface WishlistMatchData {
  externalId: string;
  title: string;
  productUrl: string;
  imageUrl: string;
  currentPrice: number;
  auctionEndTime: string;
}

export interface WishlistProductData {
  _id: string;
  query: string;
  regexPattern: string;
  isActive: boolean;
  hasMatch: boolean;
  matchCount: number;
  latestMatches: WishlistMatchData[];
  lastCheckedAt: string | null;
  lastMatchAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScrapedCategory {
  name: string;
  url: string;
}

export interface Campaign {
  name: string;
  /** Full /search?sort=2&facets=... URL for this campaign's lots */
  lotsUrl: string;
}
