"use client";

import { useCallback, useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CategoryIcon from "@mui/icons-material/Category";
import DeleteIcon from "@mui/icons-material/Delete";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import GridViewIcon from "@mui/icons-material/GridView";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ProjectShell, { NavItem } from "@/components/ProjectShell";
import CountdownTimer from "@/components/abc-auctions/CountdownTimer";
import { WishlistProductData } from "@/lib/abc-auctions/types";

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
    label: "Wish List",
    href: "/abc-auctions/wishlist",
    icon: <FavoriteBorderIcon fontSize="small" />,
  },
];

export default function WishlistPage() {
  const [wishlist, setWishlist] = useState<WishlistProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningCheck, setRunningCheck] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [regexPattern, setRegexPattern] = useState("");
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "success" });

  const matchedProducts = Array.from(
    wishlist
      .filter((item) => item.hasMatch)
      .flatMap((item) => item.latestMatches ?? [])
      .reduce((map, match) => {
        const existing = map.get(match.externalId);
        if (!existing) {
          map.set(match.externalId, match);
          return map;
        }

        if (
          new Date(match.auctionEndTime).getTime() < new Date(existing.auctionEndTime).getTime()
        ) {
          map.set(match.externalId, match);
        }

        return map;
      }, new Map<string, WishlistProductData["latestMatches"][number]>())
      .values()
  ).sort((a, b) => new Date(a.auctionEndTime).getTime() - new Date(b.auctionEndTime).getTime());

  const fetchWishlist = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/abc-auctions/wishlist");
      const data = await res.json();
      setWishlist(data.wishlist ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const runCheck = useCallback(
    async (force: boolean) => {
      setRunningCheck(true);
      try {
        const res = await fetch("/api/abc-auctions/wishlist/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        });
        const data = await res.json();
        if (!res.ok) {
          setSnackbar({ open: true, message: data.error ?? "Check failed", severity: "error" });
          return;
        }
        if (force) {
          const checked = Number(data.checked ?? 0);
          const matchedRules = Number(data.matchedRules ?? 0);
          const refreshedProducts = Number(data.refreshedProducts ?? 0);
          const upsertedProducts = Number(data.upsertedProducts ?? 0);
          const skipped = Boolean(data.skipped);

          setSnackbar({
            open: true,
            message: skipped
              ? "No active rules to check"
              : `Checked ${checked} rules · matched ${matchedRules} · refreshed ${refreshedProducts} lots (${upsertedProducts} upserts)`,
            severity: "success",
          });
        }
        await fetchWishlist();
      } catch {
        setSnackbar({ open: true, message: "Check failed (network error)", severity: "error" });
      } finally {
        setRunningCheck(false);
      }
    },
    [fetchWishlist]
  );

  useEffect(() => {
    fetchWishlist().finally(() => {
      runCheck(false);
    });
  }, [fetchWishlist, runCheck]);

  async function handleCreate() {
    if (!query.trim()) {
      setSnackbar({ open: true, message: "Query is required", severity: "error" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/abc-auctions/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, regexPattern }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSnackbar({ open: true, message: data.error ?? "Failed to add", severity: "error" });
        return;
      }
      setQuery("");
      setRegexPattern("");
      setSnackbar({ open: true, message: "Wish list rule added", severity: "success" });
      await fetchWishlist();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/abc-auctions/wishlist/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setSnackbar({ open: true, message: err.error ?? "Failed to delete", severity: "error" });
      return;
    }
    setWishlist((prev) => prev.filter((item) => item._id !== id));
  }

  async function handleToggleActive(item: WishlistProductData, isActive: boolean) {
    const res = await fetch(`/api/abc-auctions/wishlist/${item._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setSnackbar({ open: true, message: err.error ?? "Failed to update", severity: "error" });
      return;
    }
    setWishlist((prev) =>
      prev.map((existing) => (existing._id === item._id ? { ...existing, isActive } : existing))
    );
  }

  return (
    <ProjectShell title="ABC Auctions" navItems={NAV_ITEMS} searchPlaceholder="Search lots…">
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <FavoriteBorderIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>
            Wish List
          </Typography>
          {!loading && (
            <Typography variant="body2" color="text.secondary">
              {wishlist.length} rule{wishlist.length !== 1 ? "s" : ""}
            </Typography>
          )}
        </Stack>

        <Button
          variant="outlined"
          size="small"
          onClick={() => runCheck(true)}
          startIcon={
            runningCheck ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />
          }
          disabled={runningCheck}
        >
          {runningCheck ? "Checking…" : "Check now"}
        </Button>
      </Stack>

      <Card variant="outlined" sx={{ mb: 2.5 }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} alignItems="center">
            <TextField
              label="Desired product"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. toyota rav4"
              fullWidth
              size="small"
            />
            <TextField
              label="Regex (optional)"
              value={regexPattern}
              onChange={(e) => setRegexPattern(e.target.value)}
              placeholder="Leave empty for loose matching"
              fullWidth
              size="small"
              InputProps={{
                startAdornment: <InputAdornment position="start">/</InputAdornment>,
                endAdornment: <InputAdornment position="end">/i</InputAdornment>,
              }}
            />
            <Button
              variant="contained"
              onClick={handleCreate}
              disabled={creating}
              startIcon={creating ? <CircularProgress size={14} color="inherit" /> : null}
            >
              {creating ? "Saving…" : "Add"}
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Empty regex uses a very loose matcher that tolerates spaces and separators.
          </Typography>
        </CardContent>
      </Card>

      {!loading && (
        <Card variant="outlined" sx={{ mb: 2.5 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
              <Typography variant="subtitle1" fontWeight={700}>
                Matching Products
              </Typography>
              <Chip label={matchedProducts.length} size="small" color="warning" />
            </Stack>

            {matchedProducts.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No matches yet. Click Check now after new lots are published.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {matchedProducts.map((match) => (
                  <Card
                    key={match.externalId}
                    variant="outlined"
                    sx={{ borderColor: "warning.main" }}
                  >
                    <CardContent sx={{ py: 1.25 }}>
                      <Stack direction="row" spacing={1.25} alignItems="flex-start">
                        <Avatar
                          src={match.imageUrl || undefined}
                          variant="rounded"
                          sx={{ width: 56, height: 56, bgcolor: "grey.100", flexShrink: 0 }}
                        >
                          <VisibilityIcon fontSize="small" />
                        </Avatar>

                        <Stack sx={{ flexGrow: 1, minWidth: 0 }} spacing={0.5}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {match.title}
                          </Typography>
                          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                            <Typography variant="caption" color="text.secondary">
                              Current bid: ${match.currentPrice.toLocaleString()}
                            </Typography>
                            <CountdownTimer auctionEndTime={match.auctionEndTime} />
                          </Stack>
                        </Stack>

                        <IconButton
                          size="small"
                          href={match.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          component="a"
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && <Divider sx={{ mb: 2 }} />}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : wishlist.length === 0 ? (
        <Alert severity="info">No wish list rules yet.</Alert>
      ) : (
        <Stack spacing={1.5}>
          {wishlist.map((item) => (
            <Card
              key={item._id}
              variant="outlined"
              sx={{
                borderColor: item.hasMatch ? "warning.main" : undefined,
                borderWidth: item.hasMatch ? 2 : 1,
              }}
            >
              <CardContent sx={{ py: 1.5 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                      <Typography variant="subtitle2" fontWeight={700} noWrap>
                        {item.query}
                      </Typography>
                      {item.hasMatch && (
                        <Chip label={`Found ${item.matchCount}`} size="small" color="warning" />
                      )}
                      {!item.isActive && <Chip label="Paused" size="small" variant="outlined" />}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
                      Pattern: {item.regexPattern || "(auto loose regex)"}
                    </Typography>
                    {item.hasMatch && item.latestMatches?.[0] && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }} noWrap>
                        First match: {item.latestMatches[0].title}
                      </Typography>
                    )}
                  </Stack>

                  <Tooltip title={item.isActive ? "Pause rule" : "Enable rule"}>
                    <Switch
                      checked={item.isActive}
                      onChange={(_e, checked) => handleToggleActive(item, checked)}
                    />
                  </Tooltip>
                  <Tooltip title="Delete rule">
                    <IconButton color="error" onClick={() => handleDelete(item._id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

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
