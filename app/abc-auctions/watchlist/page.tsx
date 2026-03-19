"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { compareAsc, compareDesc, parseISO } from "date-fns";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CategoryIcon from "@mui/icons-material/Category";
import DeleteIcon from "@mui/icons-material/Delete";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import GridViewIcon from "@mui/icons-material/GridView";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SettingsIcon from "@mui/icons-material/Settings";
import SortIcon from "@mui/icons-material/Sort";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ProjectShell, { NavItem } from "@/components/ProjectShell";
import ProductCard from "@/components/abc-auctions/ProductCard";
import {
  AuctionProductData,
  BidStatusData,
  MonitorStatus,
  WatchedProductData,
} from "@/lib/abc-auctions/types";

const NAV_ITEMS: NavItem[] = [
  { label: "Browse", href: "/abc-auctions", icon: <GridViewIcon fontSize="small" /> },
  { label: "Categories", href: "/abc-auctions/categories", icon: <CategoryIcon fontSize="small" /> },
  { label: "Watch List", href: "/abc-auctions/watchlist", icon: <VisibilityIcon fontSize="small" /> },
  { label: "Bids", href: "/abc-auctions/bids", icon: <LocalFireDepartmentIcon fontSize="small" /> },
  { label: "Wish List", href: "/abc-auctions/wishlist", icon: <FavoriteBorderIcon fontSize="small" /> },
  { label: "Settings", href: "/abc-auctions/settings", icon: <SettingsIcon fontSize="small" /> },
];

function toAuctionProduct(w: WatchedProductData): AuctionProductData {
  return {
    externalId: w.externalId,
    title: w.title,
    imageUrl: w.imageUrl,
    currentPrice: w.lastBidAmount ?? 0,
    maxPrice: w.maxBid,
    auctionEndTime: w.auctionEndTime,
    lotNumber: "",
    category: "",
    productUrl: w.productUrl,
    scrapedAt: w.createdAt,
  };
}

interface EditDialogState {
  open: boolean;
  item: WatchedProductData | null;
  minBid: string;
  maxBid: string;
  error: string;
  loading: boolean;
}

type SortKey =
  | "closingSoon"
  | "closingLate"
  | "priceLow"
  | "priceHigh"
  | "maxBidLow"
  | "maxBidHigh"
  | "nameAZ"
  | "nameZA"
  | "recentlyAdded";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "closingSoon", label: "Closing soon" },
  { value: "closingLate", label: "Closing latest" },
  { value: "priceLow", label: "Price: low → high" },
  { value: "priceHigh", label: "Price: high → low" },
  { value: "maxBidLow", label: "Max bid: low → high" },
  { value: "maxBidHigh", label: "Max bid: high → low" },
  { value: "nameAZ", label: "Name A → Z" },
  { value: "nameZA", label: "Name Z → A" },
  { value: "recentlyAdded", label: "Recently added" },
];

export default function WatchlistPage() {
  const [watched, setWatched] = useState<WatchedProductData[]>([]);
  const [monitors, setMonitors] = useState<MonitorStatus[]>([]);
  const [liveProductMap, setLiveProductMap] = useState<Map<string, AuctionProductData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("closingSoon");
  const [editDialog, setEditDialog] = useState<EditDialogState>({
    open: false,
    item: null,
    minBid: "",
    maxBid: "",
    error: "",
    loading: false,
  });
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "success" });

  const fetchLiveProducts = useCallback(async (items: WatchedProductData[]) => {
    if (items.length === 0) return;
    const ids = items.map((i) => i.externalId).join(",");
    try {
      const res = await fetch(`/api/abc-auctions/products/live?externalIds=${ids}`);
      const data = await res.json();
      const map = new Map<string, AuctionProductData>();
      for (const p of data.products ?? []) {
        map.set(p.externalId, p as AuctionProductData);
      }
      setLiveProductMap(map);
    } catch {
      // non-critical — cards fall back to WatchedProductData values
    }
  }, []);

  const fetchWatched = useCallback(async () => {
    setLoading(true);
    try {
      const [wRes, mRes] = await Promise.all([
        fetch("/api/abc-auctions/watch"),
        fetch("/api/abc-auctions/bid/monitor"),
      ]);
      const wData = await wRes.json();
      const mData = await mRes.json();
      const items: WatchedProductData[] = wData.watched ?? [];
      setWatched(items);
      setMonitors(mData.monitors ?? []);
      fetchLiveProducts(items);
    } finally {
      setLoading(false);
    }
  }, [fetchLiveProducts]);

  useEffect(() => {
    fetchWatched();
    const id = setInterval(async () => {
      const res = await fetch("/api/abc-auctions/bid/monitor");
      const data = await res.json();
      setMonitors(data.monitors ?? []);
    }, 15000);
    return () => clearInterval(id);
  }, [fetchWatched]);

  function getMonitorStatus(id: string): MonitorStatus | undefined {
    return monitors.find((m) => m.watchedProductId === id);
  }

  const isRunning = (item: WatchedProductData) => {
    const m = getMonitorStatus(item._id);
    return m?.bidderStatus === "active" || m?.bidderStatus === "waiting";
  };

  async function handleMonitorAction(item: WatchedProductData, action: "start" | "stop") {
    setActionLoading(item._id);
    try {
      const res = await fetch("/api/abc-auctions/bid/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchedProductId: item._id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSnackbar({ open: true, message: data.error ?? "Action failed", severity: "error" });
        return;
      }
      setSnackbar({
        open: true,
        message: action === "start" ? "Monitor started" : "Stop signal sent",
        severity: "success",
      });
      await fetchWatched();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(item: WatchedProductData) {
    if (!confirm(`Remove "${item.title}" from watch list?`)) return;
    setActionLoading(item._id);
    try {
      const res = await fetch(`/api/abc-auctions/watch/${item._id}`, { method: "DELETE" });
      if (!res.ok) {
        setSnackbar({ open: true, message: "Failed to remove", severity: "error" });
        return;
      }
      setSnackbar({ open: true, message: "Removed from watch list", severity: "info" });
      setWatched((prev) => prev.filter((w) => w._id !== item._id));
    } finally {
      setActionLoading(null);
    }
  }

  function openEditDialog(item: WatchedProductData) {
    setEditDialog({
      open: true,
      item,
      minBid: String(item.minBid),
      maxBid: String(item.maxBid),
      error: "",
      loading: false,
    });
  }

  async function handleEditSave() {
    const { item, minBid, maxBid } = editDialog;
    if (!item) return;
    const min = parseFloat(minBid);
    const max = parseFloat(maxBid);
    if (isNaN(max) || max <= 0) {
      setEditDialog((s) => ({ ...s, error: "Max bid must be > 0" }));
      return;
    }
    if (!isNaN(min) && max < min) {
      setEditDialog((s) => ({ ...s, error: "Max bid must be >= min bid" }));
      return;
    }
    setEditDialog((s) => ({ ...s, loading: true, error: "" }));
    try {
      const res = await fetch(`/api/abc-auctions/watch/${item._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minBid: min, maxBid: max }),
      });
      if (!res.ok) {
        const err = await res.json();
        setEditDialog((s) => ({ ...s, loading: false, error: err.error ?? "Failed to update" }));
        return;
      }
      setSnackbar({ open: true, message: "Bid limits updated", severity: "success" });
      setEditDialog((s) => ({ ...s, open: false, loading: false }));
      await fetchWatched();
    } catch {
      setEditDialog((s) => ({ ...s, loading: false, error: "Network error" }));
    }
  }

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? watched.filter((w) => w.title.toLowerCase().includes(q))
      : [...watched];

    list.sort((a, b) => {
      const priceA = liveProductMap.get(a.externalId)?.currentPrice ?? a.lastBidAmount ?? 0;
      const priceB = liveProductMap.get(b.externalId)?.currentPrice ?? b.lastBidAmount ?? 0;
      switch (sortBy) {
        case "closingSoon":
          return compareAsc(parseISO(a.auctionEndTime), parseISO(b.auctionEndTime));
        case "closingLate":
          return compareDesc(parseISO(a.auctionEndTime), parseISO(b.auctionEndTime));
        case "priceLow":  return priceA - priceB;
        case "priceHigh": return priceB - priceA;
        case "maxBidLow":  return a.maxBid - b.maxBid;
        case "maxBidHigh": return b.maxBid - a.maxBid;
        case "nameAZ": return a.title.localeCompare(b.title);
        case "nameZA": return b.title.localeCompare(a.title);
        case "recentlyAdded":
          return compareDesc(parseISO(a.createdAt), parseISO(b.createdAt));
        default: return 0;
      }
    });

    return list;
  }, [watched, search, sortBy, liveProductMap]);

  return (
    <ProjectShell
      title="ABC Auctions"
      navItems={NAV_ITEMS}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search watched items…"
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <VisibilityIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>
            Watch List
          </Typography>
          {!loading && (
            <Typography variant="body2" color="text.secondary">
              {filteredAndSorted.length}{search ? ` of ${watched.length}` : ""}{" "}
              item{watched.length !== 1 ? "s" : ""}
            </Typography>
          )}
        </Stack>

        <FormControl size="small" sx={{ minWidth: 210 }}>
          <InputLabel id="sort-label">
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <SortIcon sx={{ fontSize: 16 }} />
              <span>Sort by</span>
            </Stack>
          </InputLabel>
          <Select
            labelId="sort-label"
            value={sortBy}
            label="Sort by"
            onChange={(e) => setSortBy(e.target.value as SortKey)}
          >
            {SORT_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : watched.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 10 }}>
          <VisibilityIcon sx={{ fontSize: 56, color: "text.disabled", mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No watched items yet
          </Typography>
          <Typography variant="body2" color="text.disabled" mb={3}>
            Browse live lots and click Watch to start tracking.
          </Typography>
          <Button variant="contained" href="/abc-auctions" startIcon={<GridViewIcon />}>
            Browse Lots
          </Button>
        </Box>
      ) : filteredAndSorted.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography color="text.secondary">
            No items match &quot;{search}&quot;
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {filteredAndSorted.map((item) => {
            const monitor = getMonitorStatus(item._id);
            const running = isRunning(item);
            const busy = actionLoading === item._id;
            const bidderStatus = monitor?.bidderStatus ?? item.bidderStatus;
            const bidStatus: BidStatusData | undefined = monitor
              ? { status: monitor.bidderStatus, amount: monitor.lastBidAmount ?? undefined }
              : undefined;
            const product = liveProductMap.get(item.externalId) ?? toAuctionProduct(item);

            return (
              <Grid key={item._id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <Stack spacing={1} sx={{ height: "100%" }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <ProductCard
                      product={product}
                      isWatched={true}
                      bidderStatus={bidderStatus}
                      bidStatus={bidStatus}
                      onWatch={() => openEditDialog(item)}
                    />
                  </Box>

                  {/* Monitor controls */}
                  <Stack direction="row" spacing={1} alignItems="center" px={0.5}>
                    <Tooltip title="View on site">
                      <IconButton
                        size="small"
                        href={item.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        component="a"
                      >
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove from watch list">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete(item)}
                        disabled={busy}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Box sx={{ flexGrow: 1 }} />
                    {running ? (
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={
                          busy ? <CircularProgress size={14} color="inherit" /> : <PauseIcon />
                        }
                        onClick={() => handleMonitorAction(item, "stop")}
                        disabled={busy}
                      >
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={
                          busy ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />
                        }
                        onClick={() => handleMonitorAction(item, "start")}
                        disabled={busy}
                      >
                        Start
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Edit bid limits dialog */}
      <Dialog
        open={editDialog.open}
        onClose={() => setEditDialog((s) => ({ ...s, open: false }))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          Edit Bid Limits
          {editDialog.item && (
            <Typography variant="body2" color="text.secondary" mt={0.5} noWrap>
              {editDialog.item.title}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            <TextField
              label="Min Bid"
              type="number"
              value={editDialog.minBid}
              onChange={(e) => setEditDialog((s) => ({ ...s, minBid: e.target.value }))}
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                htmlInput: { min: 0, step: 1 },
              }}
              helperText="Start bidding once price exceeds this"
              fullWidth
              size="small"
            />
            <TextField
              label="Max Bid *"
              type="number"
              value={editDialog.maxBid}
              onChange={(e) => setEditDialog((s) => ({ ...s, maxBid: e.target.value }))}
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                htmlInput: { min: 1, step: 1 },
              }}
              helperText="Stop bidding once price exceeds this"
              fullWidth
              size="small"
              autoFocus
            />
            {editDialog.error && (
              <Typography variant="caption" color="error">
                {editDialog.error}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setEditDialog((s) => ({ ...s, open: false }))}
            disabled={editDialog.loading}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleEditSave}
            disabled={editDialog.loading}
            startIcon={editDialog.loading ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {editDialog.loading ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

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
