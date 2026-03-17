export type BidderStatus = "idle" | "waiting" | "active" | "won" | "outbid" | "stopped";

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
  auctionEndTime: string;
  createdAt: string;
  latestBidStatus?: BidStatusData;
}

export interface MonitorStatus {
  watchedProductId: string;
  bidderStatus: BidderStatus;
  lastBidAmount: number | null;
  lastBidAt: string | null;
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
