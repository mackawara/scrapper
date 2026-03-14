"use client";

import { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import { AuctionProductData } from "@/lib/abc-auctions/types";

interface WatchDialogProps {
  open: boolean;
  product: AuctionProductData | null;
  onClose: () => void;
  onConfirm: (minBid: number, maxBid: number) => Promise<void>;
  loading: boolean;
}

export default function WatchDialog({ open, product, onClose, onConfirm, loading }: WatchDialogProps) {
  const [minBid, setMinBid] = useState("0");
  const [maxBid, setMaxBid] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setMinBid("0");
      setMaxBid("");
      setError("");
    }
  }, [open]);

  function validate() {
    const min = parseFloat(minBid);
    const max = parseFloat(maxBid);
    if (isNaN(max) || max <= 0) return "Max bid must be greater than 0";
    if (isNaN(min) || min < 0) return "Min bid cannot be negative";
    if (max < min) return "Max bid must be greater than or equal to min bid";
    return "";
  }

  async function handleConfirm() {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    await onConfirm(parseFloat(minBid), parseFloat(maxBid));
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>
        Watch Product
        {product && (
          <Typography variant="body2" color="text.secondary" mt={0.5} noWrap>
            {product.title}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} pt={1}>
          {product && (
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Current price</Typography>
              <Typography variant="body2" fontWeight={600}>
                ${product.currentPrice.toLocaleString()}
              </Typography>
            </Stack>
          )}

          <TextField
            label="Min Bid ($)"
            type="number"
            value={minBid}
            onChange={(e) => setMinBid(e.target.value)}
            inputProps={{ min: 0, step: 1 }}
            helperText="Bidding starts when price reaches this value (default 0)"
            fullWidth
            size="small"
          />

          <TextField
            label="Max Bid ($) *"
            type="number"
            value={maxBid}
            onChange={(e) => setMaxBid(e.target.value)}
            inputProps={{ min: 1, step: 1 }}
            helperText="Bidding stops when price exceeds this value"
            fullWidth
            size="small"
            autoFocus
          />

          {error && (
            <Typography variant="caption" color="error">
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={loading}
          variant="contained"
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {loading ? "Saving…" : "Watch"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
