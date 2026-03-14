"use client";

import { useEffect, useState } from "react";
import Typography from "@mui/material/Typography";

function getTimeLeft(endTime: string) {
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { h, m, s, diff };
}

export default function CountdownTimer({ auctionEndTime }: { auctionEndTime: string }) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(auctionEndTime));

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft(auctionEndTime)), 1000);
    return () => clearInterval(id);
  }, [auctionEndTime]);

  if (!timeLeft) {
    return (
      <Typography variant="caption" color="error" fontWeight={600}>
        Auction closed
      </Typography>
    );
  }

  const isUrgent = timeLeft.diff <= 11 * 60 * 1000;

  return (
    <Typography
      variant="caption"
      fontWeight={600}
      color={isUrgent ? "error" : "text.secondary"}
    >
      {isUrgent && "⚡ "}
      {String(timeLeft.h).padStart(2, "0")}:{String(timeLeft.m).padStart(2, "0")}:{String(timeLeft.s).padStart(2, "0")}
    </Typography>
  );
}
