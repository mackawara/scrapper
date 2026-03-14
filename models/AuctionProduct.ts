import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAuctionProduct extends Document {
  externalId: string;
  title: string;
  imageUrl: string;
  currentPrice: number;
  maxPrice: number;
  auctionEndTime: Date;
  lotNumber: string;
  category: string;
  productUrl: string;
  scrapedAt: Date;
}

const AuctionProductSchema = new Schema<IAuctionProduct>(
  {
    externalId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    imageUrl: { type: String, default: "" },
    currentPrice: { type: Number, default: 0 },
    maxPrice: { type: Number, default: 0 },
    auctionEndTime: { type: Date, required: true },
    lotNumber: { type: String, default: "" },
    category: { type: String, default: "Uncategorized" },
    productUrl: { type: String, required: true },
    scrapedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Auto-expire cached products after 6 hours
AuctionProductSchema.index({ scrapedAt: 1 }, { expireAfterSeconds: 21600 });

const AuctionProduct: Model<IAuctionProduct> =
  mongoose.models.AuctionProduct ||
  mongoose.model<IAuctionProduct>("AuctionProduct", AuctionProductSchema);

export default AuctionProduct;
