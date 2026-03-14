"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CategoryIcon from "@mui/icons-material/Category";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import GridViewIcon from "@mui/icons-material/GridView";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ProjectShell, { NavItem } from "@/components/ProjectShell";
import BidStatusChip from "@/components/abc-auctions/BidStatusChip";
import CountdownTimer from "@/components/abc-auctions/CountdownTimer";
import { MonitorStatus, WatchedProductData } from "@/lib/abc-auctions/types";

const NAV_ITEMS: NavItem[] = [
  { label: "Browse", href: "/abc-auctions", icon: <GridViewIcon fontSize="small" /> },
  { label: "Categories", href: "/abc-auctions/categories", icon: <CategoryIcon fontSize="small" /> },
  { label: "Watch List", href: "/abc-auctions/watchlist", icon: <VisibilityIcon fontSize="small" /> },
];

interface EditDialogState {
  open: boolean;
  item: WatchedProductData | null;
  minBid: string;
  maxBid: string;
  error: string;
  loading: boolean;
}

export default function WatchlistPage() {
  const [watched, setWatched] = useState<WatchedProductData[]>([]);
  const [monitors, setMonitors] = useState<MonitorStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // item id being acted on
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

  const fetchWatched = useCallback(async () => {
    setLoading(true);
    try {
      const [wRes, mRes] = await Promise.all([
        fetch("/api/abc-auctions/watch"),
        fetch("/api/abc-auctions/bid/monitor"),
      ]);
      const wData = await wRes.json();
      const mData = await mRes.json();
      setWatched(wData.watched ?? []);
      setMonitors(mData.monitors ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatched();
    // Poll monitor statuses every 15s
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

  const isRunning = (item: WatchedProductData) => {
    const m = getMonitorStatus(item._id);
    return m?.bidderStatus === "active" || m?.bidderStatus === "waiting";
  };

  return (
    <ProjectShell title="ABC Auctions" navItems={NAV_ITEMS} searchPlaceholder="Search lots…">
      <Stack direction="row" alignItems="center" spacing={1.5} mb={3}>
        <VisibilityIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>
          Watch List
        </Typography>
        {!loading && (
          <Typography variant="body2" color="text.secondary">
            {watched.length} item{watched.length !== 1 ? "s" : ""}
          </Typography>
        )}
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
      ) : (
        <Stack spacing={2}>
          {watched.map((item) => {
            const monitor = getMonitorStatus(item._id);
            const running = isRunning(item);
            const busy = actionLoading === item._id;
            const status = monitor?.bidderStatus ?? item.bidderStatus;

            return (
              <Card key={item._id} elevation={1} sx={{ "&:hover": { boxShadow: 3 }, transition: "box-shadow 0.2s" }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack direction="row" spacing={2} alignItems="flex-start">
                    {/* Thumbnail */}
                    <Avatar
                      src={item.imageUrl || undefined}
                      variant="rounded"
                      sx={{ width: 72, height: 72, bgcolor: "grey.100", flexShrink: 0, cursor: "pointer" }}
                      onClick={() => window.open(item.productUrl, "_blank", "noopener,noreferrer")}
                    >
                      <VisibilityIcon />
                    </Avatar>

                    {/* Details */}
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                        <Typography
                          variant="subtitle2"
                          fontWeight={600}
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {item.title}
                        </Typography>
                        <BidStatusChip status={status} />
                      </Stack>

                      <Stack direction="row" spacing={3} mt={1} flexWrap="wrap">
                        <Stack>
                          <Typography variant="caption" color="text.secondary">
                            Min bid
                          </Typography>
                          <Typography variant="body2" fontWeight={600}>
                            ${item.minBid.toLocaleString()}
                          </Typography>
                        </Stack>
                        <Stack>
                          <Typography variant="caption" color="text.secondary">
                            Max bid
                          </Typography>
                          <Typography variant="body2" fontWeight={600} color="primary">
                            ${item.maxBid.toLocaleString()}
                          </Typography>
                        </Stack>
                        {monitor?.lastBidAmount != null && (
                          <Stack>
                            <Typography variant="caption" color="text.secondary">
                              Last bid
                            </Typography>
                            <Typography variant="body2" fontWeight={600}>
                              ${monitor.lastBidAmount.toLocaleString()}
                            </Typography>
                          </Stack>
                        )}
                        <Stack>
                          <Typography variant="caption" color="text.secondary">
                            Closes
                          </Typography>
                          <CountdownTimer auctionEndTime={item.auctionEndTime} />
                        </Stack>
                      </Stack>
                    </Box>
                  </Stack>

                  <Divider sx={{ my: 1.5 }} />

                  {/* Actions */}
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
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
                    <Tooltip title="Edit bid limits">
                      <IconButton size="small" onClick={() => openEditDialog(item)} disabled={busy}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove from watch list">
                      <IconButton size="small" color="error" onClick={() => handleDelete(item)} disabled={busy}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>

                    <Box sx={{ flexGrow: 1 }} />

                    {running ? (
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PauseIcon />}
                        onClick={() => handleMonitorAction(item, "stop")}
                        disabled={busy}
                      >
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
                        onClick={() => handleMonitorAction(item, "start")}
                        disabled={busy}
                      >
                        Start Monitor
                      </Button>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Edit Dialog */}
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
              inputProps={{ min: 0, step: 1 }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              helperText="Start bidding once price exceeds this"
              fullWidth
              size="small"
            />
            <TextField
              label="Max Bid *"
              type="number"
              value={editDialog.maxBid}
              onChange={(e) => setEditDialog((s) => ({ ...s, maxBid: e.target.value }))}
              inputProps={{ min: 1, step: 1 }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
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
