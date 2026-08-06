export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
export const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
export const ONE_HOUR_MS = 60 * 60 * 1000;
export const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * Lot status values returned by the ABC Auctions API.
 *
 * Verified against live data on 2026-08-06:
 *   Status 1 — bidding is open, EndDate is in the future
 *   Status 2 — bidding has closed (EndDate just passed)
 *   Status 3 — ended without a sale; offers accepted until OfferWindowEndDate
 */
export const LOT_STATUS = {
  LIVE: 1,
  CLOSED: 2,
  OFFER_WINDOW: 3,
} as const;

/**
 * The snipe window — we place no bids at all until a lot is this close to
 * closing. Configurable via ABC_SNIPE_WINDOW_MINUTES (default 10 minutes).
 */
function readSnipeWindowMinutes(): number {
  const raw = Number(process.env.ABC_SNIPE_WINDOW_MINUTES);
  if (!Number.isFinite(raw) || raw <= 0) return 10;
  // Guard against a typo turning into an hours-long window.
  return Math.min(raw, 60);
}

export const SNIPE_WINDOW_MS = readSnipeWindowMinutes() * 60 * 1000;

/**
 * How often the scheduler wakes up. Individual lots are only touched when
 * their own `nextCheckAt` has passed, so this is cheap.
 */
export const SCHEDULER_TICK_MS = 5_000;

/**
 * Adaptive poll intervals, chosen by how far a lot is from closing.
 * Inside the snipe window we poll every 15s, which is the precision the
 * bidding strategy is built around.
 */
export const POLL_INTERVAL_SNIPE_MS = 15_000; // inside the snipe window
export const POLL_INTERVAL_APPROACHING_MS = 60_000; // snipe window → 1h out
export const POLL_INTERVAL_NEAR_MS = 5 * 60_000; // 1h → 6h out
export const POLL_INTERVAL_FAR_MS = 15 * 60_000; // 6h → 24h out
export const POLL_INTERVAL_DISTANT_MS = 30 * 60_000; // more than 24h out

/**
 * Pick the poll interval for a lot that closes in `timeLeftMs`.
 */
export function pollIntervalFor(timeLeftMs: number): number {
  if (timeLeftMs <= SNIPE_WINDOW_MS) return POLL_INTERVAL_SNIPE_MS;
  if (timeLeftMs <= ONE_HOUR_MS) return POLL_INTERVAL_APPROACHING_MS;
  if (timeLeftMs <= SIX_HOURS_MS) return POLL_INTERVAL_NEAR_MS;
  if (timeLeftMs <= TWENTY_FOUR_HOURS_MS) return POLL_INTERVAL_FAR_MS;
  return POLL_INTERVAL_DISTANT_MS;
}

/**
 * How long after a lot's end time we keep polling it, waiting for the API to
 * flip it to a closed status so we can record the final outcome.
 */
export const POST_CLOSE_GRACE_MS = 10 * 60_000;

/**
 * Warn in the UI once the stored JWT has less than this left before expiry.
 */
export const TOKEN_EXPIRY_WARNING_MS = 6 * 60 * 60 * 1000;
