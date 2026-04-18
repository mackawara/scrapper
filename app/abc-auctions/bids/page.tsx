"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import GavelIcon from "@mui/icons-material/Gavel";
import CategoryIcon from "@mui/icons-material/Category";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import GridViewIcon from "@mui/icons-material/GridView";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import SettingsIcon from "@mui/icons-material/Settings";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ProjectShell, { NavItem } from "@/components/ProjectShell";
import ProductCard from "@/components/abc-auctions/ProductCard";
import { AuctionProductData, BidStatusData, WatchedProductData } from "@/lib/abc-auctions/types";

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
  { label: "Bids", href: "/abc-auctions/bids", icon: <LocalFireDepartmentIcon fontSize="small" /> },
  {
    label: "Wish List",
    href: "/abc-auctions/wishlist",
    icon: <FavoriteBorderIcon fontSize="small" />,
  },
  { label: "Settings", href: "/abc-auctions/settings", icon: <SettingsIcon fontSize="small" /> },
];

interface BidStats {
  total: number;
  winning: number;
  losing: number;
  overMax: number;
  failed: number;
  currentStatus?: string;
  latestBidAmount?: number;
  latestBidAt?: string;
  maxBid?: number;
  isOutbid?: boolean;
  currentPriceNow?: number;
}

interface Bid {
  _id: string;
  watchedProductId: string;
  bidAmount: number;
  status: "winning" | "losing" | "overMax" | "failed" | "outbid";
  success: boolean;
  currentPriceAtBid?: number;
  currentPriceNow?: number;
  createdAt: string;
  error?: string;
}

const STATUS_CHIP_COLOR: Record<string, "success" | "error" | "warning" | "default"> = {
  winning: "success",
  losing: "error",
  overMax: "warning",
  failed: "default",
  outbid: "error",
};

function toAuctionProduct(w: WatchedProductData, currentPrice?: number): AuctionProductData {
  return {
    externalId: w.externalId,
    title: w.title,
    imageUrl: w.imageUrl,
    currentPrice: currentPrice ?? w.lastBidAmount ?? 0,
    maxPrice: w.maxBid,
    auctionEndTime: w.auctionEndTime,
    lotNumber: "",
    category: "",
    productUrl: w.productUrl,
    scrapedAt: w.createdAt,
  };
}

export default function BidsPage() {
  const [watchedProducts, setWatchedProducts] = useState<WatchedProductData[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [stats, setStats] = useState<BidStats | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveCurrentPrice, setLiveCurrentPrice] = useState<number | null>(null);

  useEffect(() => {
    const fetchWatchedProducts = async () => {
      try {
        const res = await fetch("/api/abc-auctions/watch");
        const data = await res.json();
        const watched: WatchedProductData[] = data.watched || [];
        setWatchedProducts(watched);
        if (watched[0]) setSelectedProductId(watched[0]._id);
      } catch (err) {
        console.error("Failed to fetch watched products", err);
      }
    };
    fetchWatchedProducts();
  }, []);

  // Fetch live current price whenever the selected product changes
  useEffect(() => {
    const product = watchedProducts.find((p) => p._id === selectedProductId);
    if (!product) return;
    setLiveCurrentPrice(null);
    fetch(`/api/abc-auctions/products/live?externalIds=${product.externalId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.products?.[0]) setLiveCurrentPrice(data.products[0].currentPrice);
      })
      .catch(() => {});
  }, [selectedProductId, watchedProducts]);

  useEffect(() => {
    if (!selectedProductId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsRes, bidsRes] = await Promise.all([
          fetch(`/api/abc-auctions/bids/stats?watchedProductId=${selectedProductId}`),
          fetch(`/api/abc-auctions/bids?watchedProductId=${selectedProductId}&limit=50`),
        ]);
        const statsData = await statsRes.json();
        const bidsData = await bidsRes.json();
        setStats(statsData.stats);
        setBids(bidsData.bids || []);
      } catch (err) {
        console.error("Failed to fetch bids data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [selectedProductId]);

  const selectedProduct = watchedProducts.find((p) => p._id === selectedProductId);

  const bidStatus: BidStatusData | undefined = stats
    ? {
        status: stats.currentStatus,
        amount: stats.latestBidAmount,
        currentPrice: stats.currentPriceNow,
        maxBid: stats.maxBid,
        isOutbid: stats.isOutbid,
      }
    : undefined;

  return (
    <ProjectShell title="ABC Auctions" navItems={NAV_ITEMS}>
      <Stack direction="row" alignItems="center" spacing={1.5} mb={3}>
        <GavelIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>
          Bids Tracker
        </Typography>
      </Stack>

      <FormControl size="small" sx={{ mb: 4, width: 480, maxWidth: "100%" }}>
        <InputLabel>Select Product</InputLabel>
        <Select
          value={selectedProductId}
          label="Select Product"
          onChange={(e) => setSelectedProductId(e.target.value)}
        >
          {watchedProducts.map((p) => (
            <MenuItem key={p._id} value={p._id}>
              {p.title}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {selectedProduct ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "300px 1fr" },
            gap: 3,
            alignItems: "start",
          }}
        >
          {/* Product card */}
          <ProductCard
            product={toAuctionProduct(selectedProduct, liveCurrentPrice ?? stats?.currentPriceNow)}
            isWatched={true}
            bidderStatus={selectedProduct.bidderStatus}
            bidStatus={bidStatus}
            onWatch={() => {}}
          />

          {/* Stats + bid history */}
          <Stack spacing={3}>
            {/* Stats row */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
                gap: 2,
              }}
            >
              {[
                { label: "Total Bids", value: stats?.total ?? "—", color: "primary.main" },
                { label: "Winning", value: stats?.winning ?? "—", color: "success.main" },
                { label: "Losing", value: stats?.losing ?? "—", color: "error.main" },
                { label: "Over Max", value: stats?.overMax ?? "—", color: "warning.main" },
                { label: "Failed", value: stats?.failed ?? "—", color: "text.secondary" },
              ].map(({ label, value, color }) => (
                <Card key={label} elevation={1}>
                  <CardContent sx={{ py: 1.5, px: 2, "&:last-child": { pb: 1.5 } }}>
                    <Typography variant="h5" fontWeight={700} color={color}>
                      {value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {label}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>

            {/* Outbid alert */}
            {stats?.isOutbid && (
              <Paper
                variant="outlined"
                sx={{ p: 2, borderColor: "error.main", bgcolor: "error.50" }}
              >
                <Typography variant="body2" color="error.dark" fontWeight={600}>
                  ⚠️ You have been outbid in the last 10 minutes!
                </Typography>
              </Paper>
            )}

            {/* Bid history */}
            <Card elevation={1}>
              <Box sx={{ px: 3, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Bid History
                </Typography>
              </Box>

              {loading ? (
                <Stack alignItems="center" justifyContent="center" py={5}>
                  <CircularProgress size={32} />
                </Stack>
              ) : bids.length === 0 ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ p: 3, textAlign: "center" }}
                >
                  No bids placed yet
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Time</TableCell>
                        <TableCell>Bid Amount</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Price at Bid</TableCell>
                        <TableCell>Current Price</TableCell>
                        <TableCell>Notes</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {bids.map((bid) => (
                        <TableRow key={bid._id} hover>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(bid.createdAt).toLocaleString()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>
                              US${bid.bidAmount}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={bid.status}
                              size="small"
                              color={STATUS_CHIP_COLOR[bid.status] ?? "default"}
                              sx={{ fontWeight: 600, fontSize: 11 }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {bid.currentPriceAtBid ? `US$${bid.currentPriceAtBid}` : "—"}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {bid.currentPriceNow ? `US$${bid.currentPriceNow}` : "—"}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {!bid.success && bid.error && (
                              <Typography variant="caption" color="error">
                                {bid.error}
                              </Typography>
                            )}
                            {bid.status === "losing" && (
                              <Typography variant="caption" color="warning.main">
                                Outbid
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Card>
          </Stack>
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ p: 6, textAlign: "center" }}>
          <Typography color="text.secondary">Select a product to view bid history</Typography>
        </Paper>
      )}
    </ProjectShell>
  );
}
