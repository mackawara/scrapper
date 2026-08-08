"use client";

import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Card from "@mui/material/Card";
import { AuctionProductData, WatchedProductData, BidStatusData } from "@/lib/abc-auctions/types";
import { lotIdsFor } from "@/lib/abc-auctions/lot-url";
import ProductCard from "./ProductCard";

interface ProductGridProps {
  products: AuctionProductData[];
  watched: WatchedProductData[];
  wishlistMatchExternalIds?: string[];
  bidProductIds?: string[];
  bidStatusMap?: Map<string, BidStatusData>;
  loading: boolean;
  onWatch: (product: AuctionProductData) => void;
  onBid: (product: AuctionProductData) => void;
  onAuctionClose?: () => void;
  bidLoadingExternalId?: string | null;
}

function CardSkeleton() {
  return (
    <Card elevation={1} sx={{ height: 340 }}>
      <Skeleton variant="rectangular" height={180} />
      <Skeleton variant="text" sx={{ mx: 2, mt: 1 }} width="60%" />
      <Skeleton variant="text" sx={{ mx: 2 }} width="90%" />
      <Skeleton variant="text" sx={{ mx: 2 }} width="40%" />
      <Skeleton variant="rectangular" height={32} sx={{ mx: 2, mt: 1, borderRadius: 1 }} />
    </Card>
  );
}

export default function ProductGrid({
  products,
  watched,
  wishlistMatchExternalIds = [],
  bidProductIds = [],
  bidStatusMap = new Map(),
  loading,
  onWatch,
  onBid,
  onAuctionClose,
  bidLoadingExternalId = null,
}: ProductGridProps) {
  /**
   * Watched lots are keyed under every id they answer to, and each card is
   * looked up by every id it holds. A lot stored under its AuctionLotId has to
   * match a card carrying its lot `Id`, or a watched lot silently reads as
   * un-watched and offers to be watched again.
   */
  const watchedMap = new Map<string, WatchedProductData>();
  for (const w of watched) {
    for (const id of lotIdsFor(w)) if (!watchedMap.has(id)) watchedMap.set(id, w);
  }
  const findWatched = (product: AuctionProductData) => {
    for (const id of lotIdsFor(product)) {
      const hit = watchedMap.get(id);
      if (hit) return hit;
    }
    return undefined;
  };

  const wishlistMatchSet = new Set(wishlistMatchExternalIds);
  const bidProductIdSet = new Set(bidProductIds);
  const sortedProducts = [...products].sort((a, b) => {
    const aPriority = wishlistMatchSet.has(a.externalId)
      ? 2
      : findWatched(a) || bidProductIdSet.has(a.externalId)
        ? 1
        : 0;
    const bPriority = wishlistMatchSet.has(b.externalId)
      ? 2
      : findWatched(b) || bidProductIdSet.has(b.externalId)
        ? 1
        : 0;
    return bPriority - aPriority;
  });

  if (loading && products.length === 0) {
    return (
      <Grid container spacing={2}>
        {Array.from({ length: 12 }).map((_, i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <CardSkeleton />
          </Grid>
        ))}
      </Grid>
    );
  }

  return (
    <Grid container spacing={2}>
      {sortedProducts.map((product) => {
        const watchEntry = findWatched(product);
        const bidStatus = watchEntry ? bidStatusMap.get(watchEntry._id) : undefined;
        return (
          <Grid key={product.externalId} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <ProductCard
              product={product}
              isWatched={!!watchEntry}
              isWishlistMatch={wishlistMatchSet.has(product.externalId)}
              bidderStatus={watchEntry?.bidderStatus}
              bidStatus={bidStatus}
              onWatch={() => onWatch(product)}
              onBid={() => onBid(product)}
              onAuctionClose={onAuctionClose}
              bidLoading={bidLoadingExternalId === product.externalId}
            />
          </Grid>
        );
      })}
    </Grid>
  );
}
