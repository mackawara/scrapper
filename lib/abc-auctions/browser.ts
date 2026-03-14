import puppeteer, { Browser, Page } from "puppeteer";
import logger from "@/lib/logger";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// In Docker/Linux set PUPPETEER_EXECUTABLE_PATH to use the system browser instead
// of the bundled Chromium, e.g:
//   PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
//   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined;

export async function launchBrowser(): Promise<Browser> {
  if (executablePath) {
    logger.debug("🟣 Using system browser", { executablePath });
  } else {
    logger.debug("🟣 Using bundled Chromium");
  }

  return puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      // Required in Docker — /dev/shm is too small by default
      "--disable-dev-shm-usage",
      // Disable GPU — not available in a headless container
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1280,800",
    ],
  });
}

export async function launchPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  // Use CDP directly — page.setUserAgent() is deprecated in Puppeteer v24
  const client = await page.createCDPSession();
  await client.send("Network.setUserAgentOverride", { userAgent: USER_AGENT });
  await client.detach();
  return page;
}

// Predicate passed to page.waitForFunction — waits for the ABC Auctions Angular shell to hydrate
export const SITE_READY = () => (document.querySelector("app-root")?.children.length ?? 0) > 0;
