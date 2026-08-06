"use client";

import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { BidderStatus, BidStatusData } from "@/lib/abc-auctions/types";
import { BID_STATUS_DISPLAY, bidderStatusDisplay } from "@/lib/abc-auctions/status-display";

interface ProductStatusDisplayProps {
  bidderStatus?: BidderStatus;
  bidStatus?: BidStatusData;
}

export default function ProductStatusDisplay({
  bidderStatus,
  bidStatus,
}: ProductStatusDisplayProps) {
  return (
    <Stack spacing={1} width="100%">
      {/* Bidder Status */}
      {bidderStatus && (
        <Tooltip title={bidderStatusDisplay(bidderStatus).hint} arrow>
          <Chip
            label={bidderStatusDisplay(bidderStatus).label}
            color={bidderStatusDisplay(bidderStatus).color}
            size="small"
            variant="filled"
          />
        </Tooltip>
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
              label={BID_STATUS_DISPLAY[bidStatus.status]?.label || bidStatus.status}
              color={BID_STATUS_DISPLAY[bidStatus.status]?.color || "default"}
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
          label={BID_STATUS_DISPLAY[bidStatus.finalStatus]?.label || bidStatus.finalStatus}
          color={BID_STATUS_DISPLAY[bidStatus.finalStatus]?.color || "default"}
          size="small"
          variant="filled"
          sx={{ fontWeight: 600 }}
        />
      )}
    </Stack>
  );
}
