import mongoose, { Document, Model, Schema } from "mongoose";

export interface IWishlistMatch {
  externalId: string;
  title: string;
  productUrl: string;
  imageUrl: string;
  currentPrice: number;
  auctionEndTime: Date;
}

export interface IWishlistProduct extends Document {
  query: string;
  regexPattern: string;
  isActive: boolean;
  hasMatch: boolean;
  matchCount: number;
  latestMatches: IWishlistMatch[];
  lastCheckedAt: Date | null;
  lastMatchAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const WishlistMatchSchema = new Schema<IWishlistMatch>(
  {
    externalId: { type: String, required: true },
    title: { type: String, required: true },
    productUrl: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    currentPrice: { type: Number, default: 0 },
    auctionEndTime: { type: Date, required: true },
  },
  { _id: false }
);

const WishlistProductSchema = new Schema<IWishlistProduct>(
  {
    query: { type: String, required: true, trim: true },
    regexPattern: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    hasMatch: { type: Boolean, default: false, index: true },
    matchCount: { type: Number, default: 0 },
    latestMatches: { type: [WishlistMatchSchema], default: [] },
    lastCheckedAt: { type: Date, default: null },
    lastMatchAt: { type: Date, default: null },
  },
  { timestamps: true }
);

WishlistProductSchema.index({ createdAt: -1 });
WishlistProductSchema.index({ isActive: 1, lastCheckedAt: 1 });

const WishlistProduct: Model<IWishlistProduct> =
  mongoose.models.WishlistProduct ||
  mongoose.model<IWishlistProduct>("WishlistProduct", WishlistProductSchema);

export default WishlistProduct;
