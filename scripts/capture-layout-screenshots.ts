// =============================================================================
// capture-layout-screenshots.ts — chunk 6.1 layout verification.
//
// Captures the dashboard at three widths: 1440 / 1024 / 375 (the chunk spec's
// responsive contract). Saves to docs/layout-screenshots/.
//
// USAGE: npx tsx scripts/capture-layout-screenshots.ts
//
// PREREQ: dev server running on http://localhost:3000.
// AUTH: logs in as registrar@example.com (password from DEMO_PASSWORD env var)
//       from scripts/reset-demo-passwords.ts).
//
// OUTPUT:
//   docs/layout-screenshots/dashboard-1440.png
//   docs/layout-screenshots/dashboard-1024.png
//   docs/layout-screenshots/dashboard-375.png
// =============================================================================

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = "http://localhost:3000";
const OUTPUT_DIR = resolve(__dirname, "../docs/layout-screenshots");

const EMAIL = "registrar@example.com";
const PASSWORD = process.env.DEMO_PASSWORD ?? "";

const WIDTHS = [
  { width: 1440, name: "dashboard-1440" }, // Desktop wide
  { width: 1024, name: "dashboard-1024" }, // Desktop narrow (lg: breakpoint)
  { width: 375, name: "dashboard-375" },  // Mobile
];

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();

  for (const { width, name } of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    // --- 1. Login flow ----------------------------------------------------
    // The dashboard is auth-gated. We log in via the API directly (faster
    // + more reliable than scraping the form), then navigate to /. The
    // session cookie is set automatically by the API response and shared
    // with the page via the same browser context.
    console.log(`[${width}px] Logging in via /api/auth/login...`);
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: EMAIL, password: PASSWORD },
      headers: { "Content-Type": "application/json" },
    });
    if (!loginResponse.ok()) {
      console.error(`[${width}px] Login failed: ${loginResponse.status()} ${loginResponse.statusText()}`);
      const body = await loginResponse.text();
      console.error(`[${width}px] Login response body: ${body.slice(0, 200)}`);
    } else {
      const loginBody = await loginResponse.json();
      if (loginBody.requiresTwoFactor) {
        console.error(`[${width}px] Login requires 2FA — script doesn't handle this; aborting.`);
        await context.close();
        continue;
      }
      console.log(`[${width}px] Login OK as ${loginBody.user?.email ?? "(unknown)"}.`);
    }

    console.log(`[${width}px] Navigating to ${BASE_URL}/...`);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

    // --- 2. Wait for the dashboard content to render ---------------------
    // The KPI band has data-testid="kpi-band". Wait for it to appear.
    try {
      await page.waitForSelector('[data-testid="kpi-band"]', { timeout: 30000 });
      console.log(`[${width}px] KPI band rendered.`);
    } catch {
      console.error(`[${width}px] KPI band not found — saving what we have anyway.`);
    }

    // Give the trend chart + heatmap a moment to render too.
    await page.waitForTimeout(2500);

    // --- 3. Screenshot ---------------------------------------------------
    // Full-page screenshot (captures all 6 rows even if they exceed the
    // 900px viewport). The chunk spec asks for "no overflow, no big voids"
    // — full-page is the right capture.
    const outPath = resolve(OUTPUT_DIR, `${name}.png`);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`[${width}px] Saved: ${outPath}`);

    // Also capture the viewport-only screenshot (shows what the user sees
    // without scrolling — the "above the fold" view).
    const viewportPath = resolve(OUTPUT_DIR, `${name}-viewport.png`);
    await page.screenshot({ path: viewportPath, fullPage: false });
    console.log(`[${width}px] Saved: ${viewportPath}`);

    // --- 4. Overflow check ------------------------------------------------
    // The chunk spec: "No page-level horizontal overflow at 1440/1024/375".
    // Measure the page's scrollWidth vs viewport width.
    const overflowInfo = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const winWidth = window.innerWidth;
      return { docWidth, winWidth, hasOverflow: docWidth > winWidth };
    });
    console.log(
      `[${width}px] Overflow check: scrollWidth=${overflowInfo.docWidth}, viewport=${overflowInfo.winWidth}, hasOverflow=${overflowInfo.hasOverflow}`,
    );
    if (overflowInfo.hasOverflow) {
      console.error(`[${width}px] FAIL: page has horizontal overflow!`);
    }

    await context.close();
  }

  await browser.close();
  console.log("\nAll screenshots captured.");
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
