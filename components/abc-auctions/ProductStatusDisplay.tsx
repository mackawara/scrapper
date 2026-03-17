"use client";

import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { BidderStatus, BidStatusData } from "@/lib/abc-auctions/types";

interface ProductStatusDisplayProps {
  bidderStatus?: BidderStatus;
  bidStatus?: BidStatusData;
}

const BIDDER_STATUS_CONFIG: Record<
  BidderStatus,
  { label: string; color: "success" | "primary" | "error" | "warning" | "default" }
> = {
  active: { label: "Active Bidding", color: "success" },
  won: { label: "Won", color: "primary" },
  outbid: { label: "Outbid", color: "error" },
  waiting: { label: "Waiting", color: "warning" },
  idle: { label: "Idle", color: "default" },
  stopped: { label: "Stopped", color: "default" },
};

const BID_STATUS_CONFIG: Record<
  string,
  { label: string; color: "success" | "primary" | "error" | "warning" | "default"; icon?: string }
> = {
  winning: { label: "Winning", color: "success", icon: "✓" },
  losing: { label: "Losing", color: "error", icon: "✗" },
  overMax: { label: "Over Max", color: "warning", icon: "⚠" },
  failed: { label: "Failed", color: "error", icon: "✗" },
  outbid: { label: "Outbid", color: "error", icon: "✗" },
  won: { label: "Won 🏆", color: "primary", icon: "★" },
  lost: { label: "Lost", color: "default", icon: "✗" },
  tied: { label: "Tied", color: "warning", icon: "=" },
};

export default function ProductStatusDisplay({
  bidderStatus,
  bidStatus,
}: ProductStatusDisplayProps) {
  return (
    <Stack spacing={1} width="100%">
      {/* Bidder Status */}
      {bidderStatus && (
        <Chip
          label={BIDDER_STATUS_CONFIG[bidderStatus]?.label || bidderStatus}
          color={BIDDER_STATUS_CONFIG[bidderStatus]?.color || "default"}
          size="small"
          variant="filled"
        />
      )}

      {/* Bid Status with Details */}
      {bidStatus?.status && (
        <Tooltip
          title={
            <Stack spacing={0.5}>
              {bidStatus.amount && (
                <Typography variant="caption">
                  Last Bid: ${bidStatus.amount.toLocaleString()}
                </Typography>
              )}
              {bidStatus.currentPrice && (
                <Typography variant="caption">
                  Current Price: ${bidStatus.currentPrice.toLocaleString()}
                </Typography>
              )}
              {bidStatus.maxBid && (
                <Typography variant="caption">
                  Max Bid: ${bidStatus.maxBid.toLocaleString()}
                </Typography>
              )}
              {bidStatus.isOutbid && (
                <Typography variant="caption" sx={{ color: "warning.light" }}>
                  ⚠ Outbid
                </Typography>
              )}
            </Stack>
          }
          arrow
        >
          <Box>
            <Chip
              label={BID_STATUS_CONFIG[bidStatus.status]?.label || bidStatus.status}
              color={BID_STATUS_CONFIG[bidStatus.status]?.color || "default"}
              size="small"
              variant="outlined"
              sx={{
                fontWeight: 600,
                fontSize: "0.75rem",
                "& .MuiChip-label": {
                  px: 1,
                },
              }}
            />
          </Box>
        </Tooltip>
      )}

      {/* Final Status (after auction ends) */}
      {bidStatus?.finalStatus && (
        <Chip
          label={BID_STATUS_CONFIG[bidStatus.finalStatus]?.label || bidStatus.finalStatus}
          color={BID_STATUS_CONFIG[bidStatus.finalStatus]?.color || "default"}
          size="small"
          variant="filled"
          sx={{ fontWeight: 600 }}
        />
      )}
    </Stack>
  );
}
