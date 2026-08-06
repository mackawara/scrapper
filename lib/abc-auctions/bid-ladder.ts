/**
 * Bid ladder maths for ABC Auctions.
 *
 * Deliberately free of imports so it can be exercised directly against live
 * API data (see scripts/verify-bid-ladder.mjs) — this is the money path and a
 * wrong amount is a rejected bid at the wire.
 */

/**
 * A bid-increment tier exactly as the ABC API publishes it:
 * `Bid` is the step size for prices in [MinimumValue, MaximumValue).
 */
export interface BidIncrementTier {
  Bid: number;
  MinimumValue: number;
  MaximumValue: number;
}

/**
 * Fallback ladder, used only if GET /profile/me is unreachable. It mirrors the
 * table the API served on 2026-08-06 — keep it in sync, but the live fetch is
 * what should normally be in effect.
 */
export const FALLBACK_BID_INCREMENTS: BidIncrementTier[] = [
  { Bid: 1, MinimumValue: 0, MaximumValue: 10 },
  { Bid: 2, MinimumValue: 10, MaximumValue: 20 },
  { Bid: 5, MinimumValue: 20, MaximumValue: 50 },
  { Bid: 10, MinimumValue: 50, MaximumValue: 200 },
  { Bid: 25, MinimumValue: 200, MaximumValue: 500 },
  { Bid: 50, MinimumValue: 500, MaximumValue: 1000 },
  { Bid: 100, MinimumValue: 1000, MaximumValue: 15000 },
  { Bid: 250, MinimumValue: 15000, MaximumValue: 20000 },
  { Bid: 500, MinimumValue: 20000, MaximumValue: 50000 },
  { Bid: 1000, MinimumValue: 50000, MaximumValue: 100000 },
  { Bid: 2500, MinimumValue: 100000, MaximumValue: 999999999 },
];

/**
 * Step size at a given price. Mirrors the site's own lookup:
 *   increments.filter(r => r.MinimumValue <= t && r.MaximumValue > t)[0].Bid
 */
export function getBidIncrement(price: number, increments: BidIncrementTier[]): number {
  const tier = increments.find((t) => t.MinimumValue <= price && t.MaximumValue > price);
  if (tier) return tier.Bid;
  // Above the top tier, keep using the largest step rather than returning 0.
  return increments[increments.length - 1]?.Bid ?? 1;
}

/**
 * The next valid bid strictly above `currentPrice`.
 *
 * Valid amounts are *not* simply multiples of the increment — the site builds
 * its ladder by walking up from `StartingBid`:
 *
 *   let t = StartingBid; for (…) { amounts.push(t); t += increment(t); }
 *
 * so a lot starting at $7,500 has 15,250 on its ladder but not 15,200. Snapping
 * to a multiple happened to agree for most goods lots and silently disagreed on
 * higher-value ones, which is exactly where a rejected bid costs the most.
 */
export function getNextValidBid(
  startingBid: number,
  currentPrice: number,
  increments: BidIncrementTier[]
): number {
  let amount = startingBid;

  // The opening bid is itself valid when nothing has been bid yet.
  if (currentPrice < startingBid) return startingBid;

  // Walk the ladder. The bound mirrors the site's own 50-entry dropdown but is
  // generous enough to cover a long climb from a low starting bid.
  for (let i = 0; i < 100_000; i++) {
    if (amount > currentPrice) return amount;
    const step = getBidIncrement(amount, increments);
    if (step <= 0) break;
    amount += step;
  }

  return amount;
}

/** True if `amount` sits exactly on this lot's ladder. */
export function isValidBidAmount(
  startingBid: number,
  amount: number,
  increments: BidIncrementTier[]
): boolean {
  let value = startingBid;
  for (let i = 0; i < 100_000 && value <= amount; i++) {
    if (value === amount) return true;
    const step = getBidIncrement(value, increments);
    if (step <= 0) break;
    value += step;
  }
  return false;
}

/**
 * The amount to bid: the cheapest ladder value above `currentPrice`, raised to
 * the next ladder value at or above `minBid`, and rejected if it exceeds
 * `maxBid`.
 */
export function computeBidAmount(
  startingBid: number,
  currentPrice: number,
  maxBid: number,
  increments: BidIncrementTier[],
  minBid = 0
): number | null {
  let bid = getNextValidBid(startingBid, currentPrice, increments);

  if (minBid > bid) {
    // Raise to the first ladder value that meets the floor.
    bid = getNextValidBid(startingBid, minBid - 0.000001, increments);
  }

  if (bid > maxBid) return null;
  return bid;
}
