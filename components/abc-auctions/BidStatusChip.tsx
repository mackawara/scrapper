"use client";

import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import { BidderStatus } from "@/lib/abc-auctions/types";
import { bidderStatusDisplay } from "@/lib/abc-auctions/status-display";

export default function BidStatusChip({ status }: { status: BidderStatus }) {
  const { label, color, hint } = bidderStatusDisplay(status);
  return (
    <Tooltip title={hint} arrow>
      <Chip label={label} color={color} size="small" />
    </Tooltip>
  );
}
