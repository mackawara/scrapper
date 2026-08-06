import { BidderStatus } from "./types";

export type StatusColor = "success" | "primary" | "error" | "warning" | "info" | "default";

export interface StatusDisplay {
  label: string;
  color: StatusColor;
  /** Shown on hover — explains what the bidder is actually doing. */
  hint: string;
}

/**
 * Single source of truth for how a bidder status is presented, shared by the
 * chip, the card and the watch list.
 */
export const BIDDER_STATUS_DISPLAY: Record<BidderStatus, StatusDisplay> = {
  idle: {
    label: "Idle",
    color: "default",
    hint: "On the watch list but not being monitored. Press Start to arm it.",
  },
  waiting: {
    label: "Waiting",
    color: "info",
    hint: "Monitored, but still outside the snipe window. No bids will be placed yet.",
  },
  armed: {
    label: "Armed",
    color: "warning",
    hint: "Inside the snipe window — bidding as soon as we're not the high bidder.",
  },
  bidding: {
    label: "Bidding…",
    color: "warning",
    hint: "A bid is in flight.",
  },
  winning: {
    label: "Winning",
    color: "success",
    hint: "We currently hold the high bid.",
  },
  outbid: {
    label: "Outbid",
    color: "error",
    hint: "Someone is above us. We'll bid again on the next poll if budget allows.",
  },
  maxReached: {
    label: "Max reached",
    color: "warning",
    hint: "The next valid increment would exceed your max bid, so bidding stopped.",
  },
  won: { label: "Won 🏆", color: "primary", hint: "Auction closed with us on top." },
  lost: { label: "Lost", color: "default", hint: "Auction closed with someone else on top." },
  stopped: { label: "Stopped", color: "default", hint: "Paused by you." },
  error: { label: "Error", color: "error", hint: "The last poll or bid failed." },
};

export function bidderStatusDisplay(status: BidderStatus | undefined): StatusDisplay {
  return (status && BIDDER_STATUS_DISPLAY[status]) || BIDDER_STATUS_DISPLAY.idle;
}

/** Presentation for the per-bid records on the Bids page. */
export const BID_STATUS_DISPLAY: Record<string, { label: string; color: StatusColor }> = {
  winning: { label: "Winning", color: "success" },
  losing: { label: "Losing", color: "error" },
  overMax: { label: "Over max", color: "warning" },
  failed: { label: "Failed", color: "error" },
  outbid: { label: "Outbid", color: "error" },
  won: { label: "Won 🏆", color: "primary" },
  lost: { label: "Lost", color: "default" },
  tied: { label: "Tied", color: "warning" },
};
