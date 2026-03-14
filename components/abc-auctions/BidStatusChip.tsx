"use client";

import Chip from "@mui/material/Chip";
import { BidderStatus } from "@/lib/abc-auctions/types";

const STATUS_CONFIG: Record<BidderStatus, { label: string; color: "success" | "primary" | "error" | "warning" | "default" }> = {
  active:  { label: "Bidding",  color: "success" },
  won:     { label: "Won",      color: "primary" },
  outbid:  { label: "Outbid",   color: "error" },
  waiting: { label: "Waiting",  color: "warning" },
  idle:    { label: "Idle",     color: "default" },
  stopped: { label: "Stopped",  color: "default" },
};

export default function BidStatusChip({ status }: { status: BidderStatus }) {
  const { label, color } = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  return <Chip label={label} color={color} size="small" />;
}
