"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Pagination from "@mui/material/Pagination";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import GavelIcon from "@mui/icons-material/Gavel";
import CategoryIcon from "@mui/icons-material/Category";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import GridViewIcon from "@mui/icons-material/GridView";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityIcon from "@mui/icons-material/Visibility";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import SettingsIcon from "@mui/icons-material/Settings";
import ProjectShell, { NavItem } from "@/components/ProjectShell";
import CategorySidebar, { CategoryItem } from "@/components/abc-auctions/CategorySidebar";
import FilterPanel, { Filters, EMPTY_FILTERS } from "@/components/abc-auctions/FilterPanel";
import ProductGrid from "@/components/abc-auctions/ProductGrid";
import WatchDialog from "@/components/abc-auctions/WatchDialog";
import {
  AuctionProductData,
  WatchedProductData,
  WishlistProductData,
} from "@/lib/abc-auctions/types";

const NAV_ITEMS: NavItem[] = [
  { label: "Browse", href: "/abc-auctions", icon: <GridViewIcon fontSize="small" /> },
  {
    label: "Categories",
    href: "/abc-auctions/categories",
    icon: <CategoryIcon fontSize="small" />,
  },
  {
    label: "Watch List",
    href: "/abc-auctions/watchlist",
    icon: <VisibilityIcon fontSize="small" />,
  },
  {
    label: "Bids",
    href: "/abc-auctions/bids",
    icon: <LocalFireDepartmentIcon fontSize="small" />,
  },
  {
    label: "Wish List",
    href: "/abc-auctions/wishlist",
    icon: <FavoriteBorderIcon fontSize="small" />,
  },
  {
    label: "Settings",
    href: "/abc-auctions/settings",
    icon: <SettingsIcon fontSize="small" />,
  },
];

const PAGE_SIZE = 48;

export default function AbcAuctionsPage() {
  const [products, setProducts] = useState<AuctionProductData[]>([]);
  const [watched, setWatched] = useState<WatchedProductData[]>([]);
  const [bidStatusMap, setBidStatusMap] = useState<Map<string, any>>(new Map());
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const cat = new URLSearchParams(window.location.search).get("category");
    return cat ? [cat] : [];
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [regexMode, setRegexMode] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [watchDialog, setWatchDialog] = useState<{
    open: boolean;
    product: AuctionProductData | null;
  }>({
    open: false,
    product: null,
  });
  const [watchLoading, setWatchLoading] = useState(false);
  const [bidLoadingExternalId, setBidLoadingExternalId] = useState<string | null>(null);
  const [bidProductIds, setBidProductIds] = useState<string[]>([]);
  const [wishlistMatchExternalIds, setWishlistMatchExternalIds] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "success" });

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input; validate regex eagerly so the error shows before the API call
  useEffect(() => {
    if (search && regexMode) {
      try {
        new RegExp(search);
        setSearchError("");
      } catch {
        setSearchError("Invalid regex pattern");
        if (searchTimer.current) clearTimeout(searchTimer.current);
        return;
      }
    } else {
      setSearchError("");
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, regexMode]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedCategories, filters]);

  const fetchProducts = useCallback(async () => {
    if (searchError) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
      if (debouncedSearch) {
        const pattern = regexMode
          ? debouncedSearch
          : debouncedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        params.set("search", pattern);
      }
      if (selectedCategories.length === 1) {
        params.set("category", selectedCategories[0]);
      } else if (selectedCategories.length > 1) {
        params.set("categories", selectedCategories.join(","));
      }

      // Sort
      params.set("sortBy", filters.sortBy);
      params.set("sortOrder", filters.sortOrder);

      // Date filters
      if (filters.endAfter) params.set("endAfter", filters.endAfter);
      if (filters.endBefore) params.set("endBefore", filters.endBefore);

      // Price filters
      if (filters.minPrice) params.set("minPrice", filters.minPrice);
      if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);

      const res = await fetch(`/api/abc-auctions/products?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "Search failed");
        return;
      }
      setProducts(data.products ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedCategories, regexMode, searchError, page, filters]);

  const fetchCategories = useCallback(async () => {
    const res = await fetch("/api/abc-auctions/categories");
    const data = await res.json();
    setCategories(data.categories ?? ([] as CategoryItem[]));
  }, []);

  const fetchWatched = useCallback(async () => {
    const res = await fetch("/api/abc-auctions/watch");
    const data = await res.json();
    setWatched(data.watched ?? []);
  }, []);

  const fetchWishlistMatches = useCallback(async () => {
    const res = await fetch("/api/abc-auctions/wishlist");
    const data = await res.json();
    const wishlist = (data.wishlist ?? []) as WishlistProductData[];
    const matchedIds = new Set<string>();
    for (const item of wishlist) {
      if (!item.hasMatch) continue;
      for (const match of item.latestMatches ?? []) {
        matchedIds.add(match.externalId);
      }
    }
    setWishlistMatchExternalIds(Array.from(matchedIds));
  }, []);

  const fetchBidStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/abc-auctions/bids/latest");
      const data = await res.json();
      const statusMap = new Map<string, any>();
      if (data.bidStatuses && Array.isArray(data.bidStatuses)) {
        for (const status of data.bidStatuses) {
          statusMap.set(status.watchedProductId, {
            status: status.latestBidStatus,
            amount: status.latestBidAmount,
            currentPrice: status.currentPrice,
            maxBid: status.maxBid,
            isOutbid: status.isOutbid,
            finalStatus: status.finalStatus,
          });
        }
      }
      setBidStatusMap(statusMap);
    } catch (err) {
      console.error("Failed to fetch bid statuses", err);
    }
  }, []);

  const runDailyWishlistCheck = useCallback(async () => {
    await fetch("/api/abc-auctions/wishlist/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: false }),
    });
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetchCategories();
    fetchWatched();
    fetchBidStatuses();
    runDailyWishlistCheck().finally(() => {
      fetchWishlistMatches();
    });
  }, [
    fetchCategories,
    fetchWatched,
    fetchBidStatuses,
    runDailyWishlistCheck,
    fetchWishlistMatches,
  ]);

  async function handleScrape() {
    setScraping(true);
    try {
      const res = await fetch("/api/abc-auctions/products", { method: "POST" });
      const data = await res.json();
      setSnackbar({ open: true, message: `Scraped ${data.scraped} products`, severity: "success" });
      await Promise.all([fetchProducts(), fetchCategories()]);
      await runDailyWishlistCheck();
      await fetchWishlistMatches();
    } catch {
      setSnackbar({ open: true, message: "Scrape failed", severity: "error" });
    } finally {
      setScraping(false);
    }
  }

  async function handleWatch(minBid: number, maxBid: number) {
    const product = watchDialog.product!;
    setWatchLoading(true);
    try {
      const res = await fetch("/api/abc-auctions/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalId: product.externalId,
          productUrl: product.productUrl,
          title: product.title,
          imageUrl: product.imageUrl,
          auctionEndTime: product.auctionEndTime,
          minBid,
          maxBid,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setSnackbar({ open: true, message: err.error ?? "Failed to watch", severity: "error" });
        return;
      }
      setSnackbar({ open: true, message: "Added to watch list", severity: "success" });
      setWatchDialog({ open: false, product: null });
      await fetchWatched();
    } finally {
      setWatchLoading(false);
    }
  }

  async function handleBid(product: AuctionProductData) {
    setBidLoadingExternalId(product.externalId);
    try {
      const res = await fetch("/api/abc-auctions/bid/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productUrl: product.productUrl,
          currentPrice: product.currentPrice,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSnackbar({
          open: true,
          message: data.error ?? "Failed to place bid",
          severity: "error",
        });
        return;
      }

      setSnackbar({
        open: true,
        message: `Bid placed at $${Number(data.bidAmount ?? product.currentPrice + 1).toLocaleString()}`,
        severity: "success",
      });
      setBidProductIds((prev) =>
        prev.includes(product.externalId) ? prev : [product.externalId, ...prev]
      );
      await Promise.all([fetchProducts(), fetchBidStatuses()]);
    } catch {
      setSnackbar({ open: true, message: "Failed to place bid", severity: "error" });
    } finally {
      setBidLoadingExternalId(null);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const sidebar = (
    <>
      <FilterPanel filters={filters} onChange={setFilters} />
      <CategorySidebar
        categories={categories}
        selected={selectedCategories}
        onChange={setSelectedCategories}
      />
    </>
  );

  return (
    <ProjectShell
      title="ABC Auctions"
      navItems={NAV_ITEMS}
      search={search}
      onSearch={(val) => {
        setSearch(val);
      }}
      searchPlaceholder={regexMode ? "Regex pattern… e.g. ^toyota|ford" : "Search lots…"}
      regexMode={regexMode}
      onToggleRegexMode={() => {
        setRegexMode((r) => !r);
        setSearchError("");
      }}
      searchError={searchError}
      sidebar={sidebar}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <GavelIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>
            Live Lots
          </Typography>
          {!loading && (
            <Typography variant="body2" color="text.secondary">
              {total} items
              {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
            </Typography>
          )}
        </Stack>
        <Button
          variant="outlined"
          size="small"
          startIcon={scraping ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
          onClick={handleScrape}
          disabled={scraping}
        >
          {scraping ? "Scraping…" : "Refresh"}
        </Button>
      </Stack>

      <ProductGrid
        products={products}
        watched={watched}
        wishlistMatchExternalIds={wishlistMatchExternalIds}
        bidProductIds={bidProductIds}
        bidStatusMap={bidStatusMap}
        loading={loading}
        onWatch={(product) => setWatchDialog({ open: true, product })}
        onBid={handleBid}
        bidLoadingExternalId={bidLoadingExternalId}
      />

      {/* Pagination */}
      {totalPages > 1 && !loading && (
        <Stack alignItems="center" mt={4} mb={2}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_e, value) => {
              setPage(value);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            color="primary"
            size="large"
            showFirstButton
            showLastButton
          />
        </Stack>
      )}

      <WatchDialog
        open={watchDialog.open}
        product={watchDialog.product}
        onClose={() => setWatchDialog({ open: false, product: null })}
        onConfirm={handleWatch}
        loading={watchLoading}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </ProjectShell>
  );
}
