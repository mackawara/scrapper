/**
 * Verifies lib/abc-auctions/bid-ladder.ts against live ABC Auctions data.
 *
 * Every `CurrentBid` on the site is an amount the platform actually accepted,
 * so each one must sit exactly on the ladder our code generates for that lot.
 * A single mismatch means the sniper would compute an amount the server
 * rejects — at the wire, with no time to recover.
 *
 * Run:  node --experimental-strip-types scripts/verify-bid-ladder.mjs
 */

import {
  getNextValidBid,
  isValidBidAmount,
  computeBidAmount,
  FALLBACK_BID_INCREMENTS,
} from "../lib/abc-auctions/bid-ladder.ts";

const API = "https://app-api.abcauctions.co.zw";
const HEADERS = {
  Accept: "application/json",
  AppPlatform: "3",
  BuildNumber: "1520",
  Origin: "https://app.abcauctions.co.zw",
  Referer: "https://app.abcauctions.co.zw/",
};

const get = async (url) => {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

let failures = 0;
const check = (ok, label) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}`);
};

// ── 1. The live increments table ──────────────────────────────────────────
const me = await get(`${API}/profile/me`);
const increments = [...me.Settings.BidIncrements].sort((a, b) => a.MinimumValue - b.MinimumValue);

console.log("Live increment table:");
for (const t of increments) {
  console.log(`   $${t.MinimumValue} – $${t.MaximumValue}: +$${t.Bid}`);
}

console.log("\nFallback table matches the live one:");
check(
  JSON.stringify(increments) === JSON.stringify(FALLBACK_BID_INCREMENTS),
  "hardcoded fallback is in sync with the API"
);

// ── 2. Every accepted bid must be on its lot's ladder ─────────────────────
const lots = [];
let cursor;
for (let page = 0; page < 12; page++) {
  const params = new URLSearchParams({ Size: "100", Sort: "2" });
  if (cursor) params.set("Cursor", cursor);
  const data = await get(`${API}/lots/search?${params}`);
  for (const lot of data.List) if (lot.CurrentBid != null) lots.push(lot);
  cursor = data.Meta.Cursor;
  if (!cursor) break;
}

console.log(`\nChecking ${lots.length} lots with a real accepted bid:`);
const offLadder = lots.filter((l) => !isValidBidAmount(l.StartingBid, l.CurrentBid, increments));
check(
  offLadder.length === 0,
  `all accepted bids sit on the generated ladder (${lots.length - offLadder.length}/${lots.length})`
);
for (const l of offLadder.slice(0, 10)) {
  console.log(
    `        lot ${l.Id} type ${l.Type}: start $${l.StartingBid}, accepted $${l.CurrentBid}`
  );
}

// ── 3. The next bid always advances, and never exceeds the max ────────────
console.log("\nBid computation invariants:");
const noAdvance = lots.filter(
  (l) => getNextValidBid(l.StartingBid, l.CurrentBid, increments) <= l.CurrentBid
);
check(noAdvance.length === 0, "next valid bid is always strictly above the current price");

const overMax = lots.filter((l) => {
  const bid = computeBidAmount(l.StartingBid, l.CurrentBid, l.CurrentBid + 1, increments);
  return bid != null && bid > l.CurrentBid + 1;
});
check(overMax.length === 0, "computeBidAmount never returns an amount above maxBid");

const producedInvalid = lots.filter((l) => {
  const bid = computeBidAmount(l.StartingBid, l.CurrentBid, Infinity, increments);
  return bid == null || !isValidBidAmount(l.StartingBid, bid, increments);
});
check(producedInvalid.length === 0, "every computed bid is itself a valid ladder amount");

// ── 4. minBid acts as a floor, not a gate ─────────────────────────────────
console.log("\nminBid semantics:");
const cheap = { startingBid: 1, currentPrice: 2 };
check(
  computeBidAmount(cheap.startingBid, cheap.currentPrice, 100, increments, 0) === 3,
  "minBid 0 bids the cheapest increment ($3 over a $2 price)"
);
check(
  computeBidAmount(cheap.startingBid, cheap.currentPrice, 100, increments, 20) === 20,
  "minBid 20 raises the bid to $20 rather than skipping the lot"
);
check(
  computeBidAmount(cheap.startingBid, cheap.currentPrice, 10, increments, 20) === null,
  "a minBid above maxBid yields no bid"
);
check(
  computeBidAmount(1, 9999, 100, increments) === null,
  "a price already past maxBid yields no bid"
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
