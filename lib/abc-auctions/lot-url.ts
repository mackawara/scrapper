/**
 * Lot URL parsing, kept free of server-only imports so client components can
 * use it. `api-client.ts` re-exports `parseLotUrl` for existing callers, but it
 * also pulls in mongoose and winston — importing it from a component would drag
 * both into the browser bundle.
 */

/**
 * Extract lot ID and type from a product URL.
 */
export function parseLotUrl(productUrl: string): { id: string; type: string } | null {
  // Matches both the plain route (/lot/1/123) and the dialog-outlet form
  // (/search(dialog:lot/1/123)) that the site actually deep-links with.
  const lotMatch = productUrl.match(/(?:\/|dialog:)lot\/(\d+)\/(\d+)/);
  if (lotMatch) return { type: lotMatch[1], id: lotMatch[2] };

  const lotsMatch = productUrl.match(/\/lots\/(\d+)/);
  if (lotsMatch) return { type: "1", id: lotsMatch[1] };

  // Also handle query-style: ?id=123
  const idMatch = productUrl.match(/[?&]id=(\d+)/);
  if (idMatch) return { type: "1", id: idMatch[1] };

  return null;
}

/**
 * Every id a record answers to — its stored `externalId` plus whatever its URL
 * carries.
 *
 * The API labels each lot with an `Id`, an `AuctionLotId` and a `LotNumber`, and
 * different parts of this app were populated from different ones. Matching a
 * watched lot to a browse card therefore cannot assume both sides chose the
 * same number; it has to try every id each side holds.
 */
export function lotIdsFor(record: { externalId?: string | null; productUrl?: string | null }) {
  const ids: string[] = [];
  const externalId = record.externalId?.trim();
  if (externalId) ids.push(externalId);

  const parsed = record.productUrl ? parseLotUrl(record.productUrl) : null;
  if (parsed && !ids.includes(parsed.id)) ids.push(parsed.id);

  return ids;
}
