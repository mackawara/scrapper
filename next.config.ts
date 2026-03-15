import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn-s3.abcauctions.co.zw",
      },
    ],
  },
  output: "standalone",
};

export default nextConfig;
