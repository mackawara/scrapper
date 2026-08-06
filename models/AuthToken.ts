import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * The ABC Auctions JWT, persisted so it survives process restarts.
 *
 * The site's login endpoint requires a CAPTCHA, so the token cannot be
 * refreshed automatically — it is pasted in from a manual browser session.
 * Losing it on every deploy silently stopped all auto-bidding, hence this
 * collection. A single document is kept, keyed by `singleton`.
 */
export interface IAuthToken extends Document {
  singleton: "abc-auctions";
  token: string;
  expiresAt: Date;
  sub: string;
  sid: number;
  updatedAt: Date;
}

const AuthTokenSchema = new Schema<IAuthToken>(
  {
    singleton: { type: String, required: true, unique: true, default: "abc-auctions" },
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    sub: { type: String, default: "" },
    sid: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

const AuthToken: Model<IAuthToken> =
  mongoose.models.AuthToken || mongoose.model<IAuthToken>("AuthToken", AuthTokenSchema);

export default AuthToken;
