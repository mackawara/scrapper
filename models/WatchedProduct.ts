import mongoose, { Schema, Document, Model } from "mongoose";
import { BidderStatus, BIDDER_STATUSES } from "@/lib/abc-auctions/types";

export interface IWatchedProduct extends Document {
  externalId: string;
  productUrl: string;
  title: string;
  imageUrl: string;
  /** Floor on our own bid amount — never a gate on whether we bid at all. */
  minBid: number;
  /** Hard ceiling. We never place a bid above this. */
  maxBid: number;
  bidderStatus: BidderStatus;
  lastBidAmount: number | null;
  lastBidAt: Date | null;
  /** Latest price seen from the API, refreshed on every poll. */
  currentPrice: number | null;
  /** From the authenticated lot detail — the definitive "are we winning". */
  isHighestBidder: boolean | null;
  /** How many bids we have successfully placed on this lot. */
  bidCount: number;
  /** Last error surfaced to the UI (auth expiry, API rejection, …). */
  lastError: string | null;
  /** The scheduler wakes this lot up once this time has passed. */
  nextCheckAt: Date;
  auctionEndTime: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WatchedProductSchema = new Schema<IWatchedProduct>(
  {
    externalId: { type: String, required: true, unique: true, index: true },
    productUrl: { type: String, required: true },
    title: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    minBid: { type: Number, default: 0 },
    maxBid: { type: Number, required: true },
    bidderStatus: {
      type: String,
      enum: BIDDER_STATUSES,
      default: "idle",
      index: true,
    },
    lastBidAmount: { type: Number, default: null },
    lastBidAt: { type: Date, default: null },
    currentPrice: { type: Number, default: null },
    isHighestBidder: { type: Boolean, default: null },
    bidCount: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    nextCheckAt: { type: Date, default: () => new Date(), index: true },
    auctionEndTime: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

const WatchedProduct: Model<IWatchedProduct> =
  mongoose.models.WatchedProduct ||
  mongoose.model<IWatchedProduct>("WatchedProduct", WatchedProductSchema);

export default WatchedProduct;
