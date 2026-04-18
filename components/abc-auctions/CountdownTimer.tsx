"use client";

import { useEffect, useRef, useState } from "react";
import Typography from "@mui/material/Typography";
import { intervalToDuration, isPast, isValid, parseISO } from "date-fns";

function getTimeLeft(endTime: string) {
  const end = parseISO(endTime);
  if (!isValid(end) || isPast(end)) return null;

  const duration = intervalToDuration({ start: new Date(), end });
  const diff = end.getTime() - Date.now();
  return {
    d: duration.days ?? 0,
    h: duration.hours ?? 0,
    m: duration.minutes ?? 0,
    s: duration.seconds ?? 0,
    diff,
  };
}

export default function CountdownTimer({
  auctionEndTime,
  onClose,
}: {
  auctionEndTime: string;
  onClose?: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(auctionEndTime));
  const firedClose = useRef(false);

  useEffect(() => {
    const end = parseISO(auctionEndTime);
    if (!isValid(end) || isPast(end)) {
      // Already closed when mounted — don't re-fire onClose
      return;
    }
    firedClose.current = false;
    const id = setInterval(() => {
      const tl = getTimeLeft(auctionEndTime);
      setTimeLeft(tl);
      if (!tl) {
        clearInterval(id);
        if (!firedClose.current) {
          firedClose.current = true;
          onClose?.();
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [auctionEndTime, onClose]);

  if (!timeLeft) {
    return (
      <Typography variant="caption" color="error" fontWeight={600}>
        Auction closed
      </Typography>
    );
  }

  const isUrgent = timeLeft.diff <= 11 * 60 * 1000;
  const formattedTimeLeft =
    timeLeft.d > 0
      ? `${timeLeft.d}d ${timeLeft.h}h ${timeLeft.m}m`
      : `${timeLeft.h}h ${timeLeft.m}m ${timeLeft.s}s`;

  return (
    <Typography variant="caption" fontWeight={600} color={isUrgent ? "error" : "text.secondary"}>
      {isUrgent && "⚡ "}
      {formattedTimeLeft}
    </Typography>
  );
}
