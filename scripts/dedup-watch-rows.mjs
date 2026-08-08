/**
 * De-duplicates the watch list by the lot a row *actually* refers to.
 *
 * The unique index on `externalId` cannot catch these: the same lot gets
 * watched twice under two different id spaces (its AuctionLotId one time, its
 * lot `Id` the next), so both rows look distinct to Mongo while the sniper
 * bids against one lot twice. Titles are no help either — genuinely different
 * lots routinely share a title — so grouping is done on the AuctionLotId
 * resolved from the live API.
 *
 * Survivor, in order of preference:
 *   1. the row that has bid history (a row with bids is the record of what happened)
 *   2. the row still under active monitoring, over one the user stopped
 *   3. the row whose externalId is already the true AuctionLotId
 *   4. the oldest row, having been tracked the longest
 *
 * Bid documents on a losing row are re-pointed at the survivor, so no history
 * is lost. Groups where two rows both carry bids are reported and skipped —
 * merging two separate bid trails is not something to guess at.
 *
 * Bid limits are the one thing that cannot be derived: the same lot was watched
 * twice with two different ceilings, and neither "highest" nor "lowest" is
 * safely guessable. The survivor takes the limits from whichever row in the
 * group was created last, read as the most recent intent. `--limits=keep`
 * leaves the survivor's own limits alone instead.
 *
 * Dry run:  npm run dedup:watch
 * Apply:    npm run dedup:watch -- --apply
 */

import mongoose from "mongoose";
import {
  canonicalLotUrl,
  getLotDetail,
  resolveLotIdentityFrom,
} from "../lib/abc-auctions/api-client.ts";

const APPLY = process.argv.includes("--apply");
/** "latest" — take the most recently set limits; "keep" — leave the survivor's. */
const LIMITS = process.argv.includes("--limits=keep") ? "keep" : "latest";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Run through `make` or export it first.");
  process.exit(1);
}

const short = (s, n = 44) => String(s ?? "").slice(0, n);
const money = (v) => (v == null ? "—" : `$${v}`);

await mongoose.connect(MONGODB_URI);
const watched = mongoose.connection.collection("watchedproducts");
const bids = mongoose.connection.collection("bids");

const rows = await watched.find({}).sort({ createdAt: 1 }).toArray();
console.log(`${rows.length} watch rows\n`);

// ── Resolve every row to a real lot ────────────────────────────────────────

/**
 * The lot a row points at, as `{ auctionLotId, productUrl }`.
 *
 * `lots/detail` is asked first because it answers for both id conventions —
 * directly for a row whose URL carries the real lot `Id`, and via the search
 * recovery inside getLotDetail for one built from a LotNumber. Search alone is
 * not enough: it indexes LotNumber, so looking a correct row up by its `Id`
 * finds nothing. A row whose lot has been taken down resolves to null.
 */
async function identityForRow(row) {
  const detail = await getLotDetail(row.productUrl);
  if (detail?.AuctionLotId != null) {
    return {
      auctionLotId: String(detail.AuctionLotId),
      productUrl: canonicalLotUrl(detail.Url ?? row.productUrl),
    };
  }

  const viaSearch = await resolveLotIdentityFrom(row.productUrl, row.externalId);
  if (!viaSearch) return null;
  return {
    auctionLotId: viaSearch.auctionLotId,
    productUrl: canonicalLotUrl(`/lot/${viaSearch.type}/${viaSearch.id}`),
  };
}

const groups = new Map();
const unresolved = [];

for (const row of rows) {
  const identity = await identityForRow(row);
  const bidCount = await bids.countDocuments({ watchedProductId: row._id });
  const entry = { row, identity, bidCount };

  if (!identity) {
    unresolved.push(entry);
    continue;
  }
  const key = identity.auctionLotId;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(entry);
}

// ── Pick a survivor per duplicated lot ─────────────────────────────────────
const RUNNING = ["waiting", "armed", "bidding", "winning", "outbid"];

function rank(entry) {
  const { row, bidCount, identity } = entry;
  return [
    bidCount > 0 ? 0 : 1,
    RUNNING.includes(row.bidderStatus) ? 0 : 1,
    String(row.externalId) === identity.auctionLotId ? 0 : 1,
    new Date(row.createdAt).getTime(),
  ];
}

const cmp = (a, b) => {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
  return 0;
};

const plan = [];
const skipped = [];
/** Rows kept as-is whose stored ids are still in the wrong id space. */
const strays = [];

for (const [auctionLotId, entries] of groups) {
  if (entries.length < 2) {
    const [only] = entries;
    if (
      String(only.row.externalId) !== only.identity.auctionLotId ||
      only.row.productUrl !== only.identity.productUrl
    ) {
      strays.push(only);
    }
    continue;
  }

  if (entries.filter((e) => e.bidCount > 0).length > 1) {
    skipped.push({ auctionLotId, entries });
    continue;
  }

  const [keep, ...remove] = [...entries].sort(cmp);

  // The most recently watched row states the user's latest ceiling, whether or
  // not that row is the one worth keeping.
  const newest = [...entries].sort(
    (a, b) => new Date(b.row.createdAt) - new Date(a.row.createdAt)
  )[0];
  const differs = newest.row.minBid !== keep.row.minBid || newest.row.maxBid !== keep.row.maxBid;
  const limits =
    LIMITS === "latest" && newest.row._id !== keep.row._id && differs
      ? { minBid: newest.row.minBid, maxBid: newest.row.maxBid, from: newest.row }
      : null;

  plan.push({ auctionLotId, keep, remove, limits });
}

// ── Report ────────────────────────────────────────────────────────────────
if (unresolved.length > 0) {
  console.log(`${unresolved.length} row(s) match no live lot — left untouched:`);
  for (const { row } of unresolved) {
    const ends = new Date(row.auctionEndTime);
    console.log(
      `   ${row.externalId.padStart(9)}  ends ${ends.toISOString().slice(0, 16)}  ${short(row.title)}`
    );
  }
  console.log();
}

if (plan.length === 0 && skipped.length === 0 && strays.length === 0) {
  console.log("No duplicates found, and every row's ids are already correct.");
} else if (plan.length === 0) {
  console.log("No duplicates found.\n");
} else {
  console.log(`${plan.length} duplicated lot(s):\n`);
  for (const { auctionLotId, keep, remove, limits } of plan) {
    console.log(`AuctionLotId ${auctionLotId} — ${short(keep.row.title)}`);
    const line = (label, { row, bidCount }) =>
      console.log(
        `   ${label} externalId=${String(row.externalId).padStart(9)} ` +
          `status=${String(row.bidderStatus).padEnd(10)} ` +
          `min/max=${money(row.minBid)}/${money(row.maxBid)} ` +
          `price=${money(row.currentPrice)} bids=${bidCount} ` +
          `added=${new Date(row.createdAt).toISOString().slice(0, 16)}`
      );
    line("KEEP  ", keep);
    for (const r of remove) line("DELETE", r);

    const maxes = new Set([keep.row.maxBid, ...remove.map((r) => r.row.maxBid)]);
    if (maxes.size > 1) {
      console.log(
        limits
          ? `   ⚠ max bids differ (${[...maxes].map(money).join(" vs ")}) — taking ${money(limits.maxBid)} ` +
              `from the row added ${new Date(limits.from.createdAt).toISOString().slice(0, 16)}`
          : `   ⚠ max bids differ (${[...maxes].map(money).join(" vs ")}) — keeping ${money(keep.row.maxBid)}`
      );
    }
    const movingBids = remove.reduce((n, r) => n + r.bidCount, 0);
    if (movingBids > 0) console.log(`   ${movingBids} bid record(s) will move to the kept row`);
    console.log();
  }
}

/**
 * Mismatched ids are what let two rows describe one lot in the first place, so
 * normalising the rows that are staying is what stops the duplicates coming
 * back — and it saves the search round-trip the runtime otherwise pays on every
 * watch-list load.
 */
if (strays.length > 0) {
  console.log(`${strays.length} row(s) to normalise (kept, but ids in the wrong space):`);
  for (const { row, identity } of strays) {
    console.log(
      `   ${short(row.title, 40).padEnd(40)} externalId ${row.externalId} → ${identity.auctionLotId}`
    );
  }
  console.log();
}

for (const { auctionLotId, entries } of skipped) {
  console.log(
    `SKIPPED AuctionLotId ${auctionLotId} — ${entries.length} rows each carry bid history:\n` +
      entries
        .map((e) => `   externalId=${e.row.externalId} bids=${e.bidCount} "${short(e.row.title)}"`)
        .join("\n")
  );
}

// ── Apply ─────────────────────────────────────────────────────────────────
if (!APPLY) {
  const n = plan.reduce((sum, p) => sum + p.remove.length, 0);
  console.log(
    `\nDry run — nothing changed. Re-run with --apply to delete ${n} row(s)` +
      `${strays.length > 0 ? ` and normalise ${strays.length}` : ""}.`
  );
  await mongoose.disconnect();
  process.exit(0);
}

let deleted = 0;
let moved = 0;
let repaired = 0;
let relimited = 0;

for (const { keep, remove, limits } of plan) {
  for (const r of remove) {
    if (r.bidCount > 0) {
      const res = await bids.updateMany(
        { watchedProductId: r.row._id },
        { $set: { watchedProductId: keep.row._id } }
      );
      moved += res.modifiedCount;
    }
    await watched.deleteOne({ _id: r.row._id });
    deleted++;
  }

  // With the duplicate gone, the unique index is free and the survivor can take
  // the ids it should have had: the AuctionLotId to bid with, and a URL that
  // lots/detail resolves without a search round-trip.
  const needsId = String(keep.row.externalId) !== keep.identity.auctionLotId;
  const needsUrl = keep.row.productUrl !== keep.identity.productUrl;

  const update = {};
  if (needsId) update.externalId = keep.identity.auctionLotId;
  if (needsUrl) update.productUrl = keep.identity.productUrl;
  if (limits) {
    update.minBid = limits.minBid;
    update.maxBid = limits.maxBid;
    // A changed ceiling should reach the bidder now, not at the next poll.
    update.nextCheckAt = new Date();
  }

  if (Object.keys(update).length > 0) {
    try {
      await watched.updateOne({ _id: keep.row._id }, { $set: update });
      if (needsId || needsUrl) repaired++;
      if (limits) relimited++;
    } catch (err) {
      console.log(`   ⚠ could not update the kept row ${keep.row._id}: ${err.message}`);
    }
  }
}

for (const { row, identity } of strays) {
  try {
    await watched.updateOne(
      { _id: row._id },
      { $set: { externalId: identity.auctionLotId, productUrl: identity.productUrl } }
    );
    repaired++;
  } catch (err) {
    console.log(`   ⚠ could not normalise ${row._id}: ${err.message}`);
  }
}

console.log(
  `\nDeleted ${deleted} duplicate row(s), moved ${moved} bid record(s), ` +
    `repaired ids on ${repaired} row(s), applied latest limits to ${relimited} row(s).`
);
await mongoose.disconnect();
