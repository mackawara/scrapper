/**
 * Next.js boot hook.
 *
 * Restores the persisted ABC Auctions token and starts the bid scheduler as
 * soon as the server process comes up. Without this, a PM2 restart or a deploy
 * would silently leave every watched lot unmonitored until someone happened to
 * open the watch list and press Start.
 */

export async function register(): Promise<void> {
  // Only the Node.js server runtime — not the edge runtime used by middleware.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const logger = (await import("@/lib/logger")).default;

  try {
    const { loadPersistedToken, getTokenInfo } = await import("@/lib/abc-auctions/api-client");
    const { startScheduler } = await import("@/lib/abc-auctions/bidder");

    await loadPersistedToken();
    const info = getTokenInfo();

    if (!info.hasToken) {
      logger.warn("🌕 Booted without an ABC Auctions token — bidding is disabled until one is set");
    } else if (info.isExpiringSoon) {
      logger.warn("🌕 ABC Auctions token expires soon", { expiresInHours: info.expiresInHours });
    }

    startScheduler();
  } catch (err) {
    logger.error("🔴 Failed to start bid scheduler on boot", { err });
  }
}
