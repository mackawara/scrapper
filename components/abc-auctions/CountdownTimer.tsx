"use client";

import { useEffect, useRef, useState } from "react";
import Typography from "@mui/material/Typography";
import { isValid, parseISO } from "date-fns";

/**
 * Milliseconds until `endTime`, or null once it has passed.
 *
 * Computed straight from the raw difference rather than date-fns'
 * `intervalToDuration`, which buckets into months/years — a lot closing in 45
 * days rendered as "15d" because the month component was dropped.
 */
function msLeft(endTime: string, now: number): number | null {
  const end = parseISO(endTime);
  if (!isValid(end)) return null;
  const diff = end.getTime() - now;
  return diff > 0 ? diff : null;
}

function format(diff: number): string {
  const totalSeconds = Math.floor(diff / 1000);
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export default function CountdownTimer({
  auctionEndTime,
  onClose,
}: {
  auctionEndTime: string;
  onClose?: () => void;
}) {
  // Ticking a clock rather than the remaining time means the countdown always
  // reflects the latest `auctionEndTime` prop — which moves if the platform
  // extends a lot on a late bid.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = msLeft(auctionEndTime, now);
  const closed = diff == null;

  // Don't fire onClose for a lot that was already over when we first rendered.
  const suppressClose = useRef(closed);
  const firedClose = useRef(false);

  useEffect(() => {
    if (!closed) {
      suppressClose.current = false;
      firedClose.current = false;
      return;
    }
    if (suppressClose.current || firedClose.current) return;
    firedClose.current = true;
    onClose?.();
  }, [closed, onClose]);

  if (closed) {
    return (
      <Typography variant="caption" color="error" fontWeight={600}>
        Auction closed
      </Typography>
    );
  }

  // Matches the sniper's default 10-minute window, so "⚡" means "bidding now".
  const isUrgent = diff <= 10 * 60 * 1000;

  return (
    <Typography variant="caption" fontWeight={600} color={isUrgent ? "error" : "text.secondary"}>
      {isUrgent && "⚡ "}
      {format(diff)}
    </Typography>
  );
}
