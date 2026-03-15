export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
export const TEN_MINUTES_MS = 10 * 60 * 1000;

export const POLL_INTERVAL_WAITING_MS = 60_000; // 60s — while >24h from auction end
export const POLL_INTERVAL_EARLY_BID_MS = 300_000; // 5m — during 24h→10m early-bid window
export const POLL_INTERVAL_FINAL_BID_MS = 15_000; // 15s — during final 10m recursive bidding
