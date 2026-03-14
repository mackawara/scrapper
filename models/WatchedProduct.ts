import mongoose, { Schema, Document, Model } from "mongoose";
import { BidderStatus } from "@/lib/abc-auctions/types";

export interface IWatchedProduct extends Document {
  externalId: string;
  productUrl: string;
  title: string;
  imageUrl: string;
  minBid: number;
  maxBid: number;
  bidderStatus: BidderStatus;
  lastBidAmount: number | null;
  lastBidAt: Date | null;
  auctionEndTime: Date;
  createdAt: Date;
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
      enum: ["idle", "waiting", "active", "won", "outbid", "stopped"],
      default: "idle",
    },
    lastBidAmount: { type: Number, default: null },
    lastBidAt: { type: Date, default: null },
    auctionEndTime: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const WatchedProduct: Model<IWatchedProduct> =
  mongoose.models.WatchedProduct ||
  mongoose.model<IWatchedProduct>("WatchedProduct", WatchedProductSchema);

export default WatchedProduct;
