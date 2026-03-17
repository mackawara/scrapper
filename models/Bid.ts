import mongoose from "mongoose";

/**
 * Represents a single bid attempt on an auction lot.
 * Tracks the status (winning, losing, overMax) and timing.
 */
const bidSchema = new mongoose.Schema(
  {
    // Reference to the WatchedProduct
    watchedProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WatchedProduct",
      required: true,
    },

    // Lot info
    lotId: {
      type: String, // e.g., "691553" from URL
      required: true,
    },
    auctionLotId: {
      type: Number, // e.g., 837318 used by bid API
      required: true,
    },
    productUrl: {
      type: String,
      required: true,
    },
    productTitle: String,

    // Bid details
    bidAmount: {
      type: Number,
      required: true,
    },
    success: {
      type: Boolean,
      required: true,
    },

    // Status: "winning" | "losing" | "overMax" | "failed" | "outbid"
    status: {
      type: String,
      enum: ["winning", "losing", "overMax", "failed", "outbid"],
      default: "winning",
      index: true,
    },

    // Current bid at time of our bid attempt
    currentPriceAtBid: Number,

    // Current bid now (latest)
    currentPriceNow: Number,

    // Max bid we're allowed to go up to
    maxBid: Number,

    // Error message if bid failed
    error: String,

    // API response if successful
    apiResponse: mongoose.Schema.Types.Mixed,

    // For tracking: did we get outbid after this?
    isOutbid: {
      type: Boolean,
      default: false,
    },
    outbidAt: Date,
    outbidBy: Number, // Amount we were outbid by

    // Auction end time
    auctionEndTime: Date,

    // When the auction ended and we checked final status
    auctionEndedAt: Date,
    finalStatus: {
      type: String,
      enum: ["won", "lost", "tied"],
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
    indexes: [
      { watchedProductId: 1, createdAt: -1 },
      { lotId: 1, createdAt: -1 },
      { status: 1, createdAt: -1 },
    ],
  }
);

export default mongoose.models.Bid || mongoose.model("Bid", bidSchema);
