import mongoose from "mongoose";
import logger from "./logger";

const MONGODB_URI = process.env.MONGODB_URI as string;

// if (!MONGODB_URI) {
//   throw new Error("Please define the MONGODB_URI environment variable in .env.local");
// }

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache;
}

const cached: MongooseCache = global.mongooseCache ?? { conn: null, promise: null };
global.mongooseCache = cached;

async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI).then((m) => {
      logger.info("MongoDB connected");
      return m;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;
