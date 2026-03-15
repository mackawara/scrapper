/**
 * Quick test for Puppeteer login flow against ABC Auctions.
 * Run: npx tsx scripts/test-login.ts
 */
import puppeteer from "puppeteer";

const SITE_BASE = "https://app.abcauctions.co.zw";
const email = process.env.ABC_AUCTIONS_EMAIL ?? "mkawara@outlook.com";
const password = process.env.ABC_AUCTIONS_PASSWORD ?? ".C2vAW9uPpUTcsW";

async function main() {
  console.log("═══ Puppeteer Login Test ═══\n");

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1280,800",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // 1. Navigate to login
    console.log("1. Navigating to /login...");
    await page.goto(`${SITE_BASE}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => (document.querySelector("app-root")?.children.length ?? 0) > 0,
      { timeout: 20_000 }
    );
    await page.waitForNetworkIdle({ idleTime: 1500, timeout: 10_000 }).catch(() => {});
    console.log("   ✅ Page loaded\n");

    // 2. Account gate — click LOGIN
    console.log("2. Looking for account gate LOGIN button...");
    const gateLoginBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((b) => b.textContent?.trim().toUpperCase().includes("LOGIN")) ?? null;
    });

    const gateEl = gateLoginBtn.asElement();
    if (gateEl) {
      await gateEl.click();
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 10_000 }).catch(() => {});
      console.log("   ✅ Clicked account gate LOGIN\n");
    } else {
      console.log("   ⚠️ No gate button found — may already be on login form\n");
    }

    // 3. Fill credentials
    console.log("3. Filling credentials...");
    await page.waitForSelector('input[type="email"], input[type="text"]', { timeout: 10_000 });

    const emailInput = await page.$('input[type="email"]');
    const passwordInput = await page.$('input[type="password"]');

    if (!emailInput || !passwordInput) {
      console.log("   ❌ Login form inputs not found!");
      await browser.close();
      return;
    }

    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 20 });
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 20 });
    console.log(`   ✅ Filled: ${email}\n`);

    // 4. Submit login
    console.log("4. Submitting login...");
    const loginBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((b) => b.textContent?.trim().toUpperCase().includes("LOGIN")) ?? null;
    });

    const loginEl = loginBtn.asElement();
    if (loginEl) {
      await loginEl.click();
    } else {
      await passwordInput.press("Enter");
    }

    await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 10_000 }).catch(() => {});
    console.log("   ✅ Login submitted\n");

    // 5. Handle verification skip
    console.log("5. Checking for verification page...");
    const skipBtn = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((b) => b.textContent?.trim().toUpperCase().includes("SKIP")) ?? null;
    });

    const skipEl = skipBtn.asElement();
    if (skipEl) {
      await skipEl.click();
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
      console.log("   ✅ Skipped verification\n");
    } else {
      console.log("   ℹ️ No verification page — continuing\n");
    }

    // 6. Final check
    const stillOnLogin = await page.$('input[type="password"]');
    const currentUrl = page.url();

    if (stillOnLogin) {
      console.log("❌ LOGIN FAILED — still on login page");
      console.log(`   URL: ${currentUrl}`);
    } else {
      console.log("✅ LOGIN SUCCESSFUL!");
      console.log(`   URL: ${currentUrl}`);
    }

    // 7. Navigate to lot page to verify bid interface
    console.log("\n6. Navigating to lot detail to check bid interface...");
    await page.goto(`${SITE_BASE}/lot/1/693868`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => (document.querySelector("app-root")?.children.length ?? 0) > 0,
      { timeout: 20_000 }
    );
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 15_000 }).catch(() => {});

    const hasBidBtn = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.some(
        (b) =>
          b.textContent?.trim().toUpperCase() === "BID" ||
          b.textContent?.trim().toUpperCase() === "PLACE BID"
      );
    });

    const hasLoginPrompt = await page.evaluate(() => {
      return document.body.innerText.includes("PLEASE REGISTER OR LOGIN");
    });

    if (hasBidBtn) {
      console.log("   ✅ Bid button found — bidding interface accessible!");
    } else if (hasLoginPrompt) {
      console.log("   ❌ Login prompt shown — session not preserved");
    } else {
      console.log("   ⚠️ Cannot determine bid interface state");
    }

    // Show all button texts for debugging
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("button"))
        .map((b) => b.textContent?.trim())
        .filter(Boolean);
    });
    console.log(`   Buttons found: ${JSON.stringify(buttons)}`);
  } catch (err) {
    console.log(`\n❌ Error: ${err}`);
  } finally {
    await browser.close();
    console.log("\nBrowser closed.");
  }
}

main().catch(console.error);
