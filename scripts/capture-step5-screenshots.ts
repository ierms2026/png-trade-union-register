// =============================================================================
// capture-step5-screenshots.ts — Step 5 onboarding visual verification.
//
// Captures the screens changed by Step 5 (onboarding for non-technical
// testers):
//   1. Dashboard (with the new WelcomePanel)
//   2. Unions list (with StatusBadge withHelp popovers)
//   3. Retention view (with DefinitionPopover next to the heading)
//   4. Calendar view (with the empty-state notice)
//
// USAGE: npx tsx scripts/capture-step5-screenshots.ts
//
// PREREQ: dev server running on http://localhost:3000.
// AUTH: logs in as registrar@example.com / Test!2345.
//
// OUTPUT:
//   download/step5-screenshots/01-dashboard-welcome.png
//   download/step5-screenshots/02-unions-status-help.png
//   download/step5-screenshots/03-retention-help.png
//   download/step5-screenshots/04-calendar-empty-notice.png
// =============================================================================

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = "http://localhost:3000";
const OUTPUT_DIR = resolve(__dirname, "../download/step5-screenshots");

const EMAIL = "registrar@example.com";
const PASSWORD = "Test!2345";

async function login(page: import("playwright").Page) {
  // Hit the API directly — faster + more reliable than scraping the form.
  const res = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`Login failed: ${res.status()} ${res.statusText()}`);
  }
  // The session cookie is set automatically on the page's context.
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // --- Login -------------------------------------------------------------
  await login(page);

  // --- 1. Dashboard (welcome panel) -------------------------------------
  await page.goto(`${BASE_URL}/?view=dashboard`);
  await page.waitForLoadState("networkidle");
  // Wait for the welcome panel to render
  await page.waitForSelector('[data-testid="welcome-panel"]', { timeout: 10000 });
  await page.screenshot({
    path: resolve(OUTPUT_DIR, "01-dashboard-welcome.png"),
    fullPage: false,
  });
  console.log("✓ 01-dashboard-welcome.png");

  // --- 2. Unions list (status help popover) -----------------------------
  await page.goto(`${BASE_URL}/?view=unions`);
  await page.waitForLoadState("networkidle");
  // Wait for unions to render
  await page.waitForTimeout(1500);
  // Find the first StatusBadge help button and click it to show the popover
  const helpButtons = page.locator('button[aria-label*="What does"]');
  const helpCount = await helpButtons.count();
  if (helpCount > 0) {
    await helpButtons.first().click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({
    path: resolve(OUTPUT_DIR, "02-unions-status-help.png"),
    fullPage: false,
  });
  console.log(`✓ 02-unions-status-help.png (found ${helpCount} help buttons)`);

  // Close any open popover before navigating
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // --- 3. Retention view (heading help popover) -------------------------
  await page.goto(`${BASE_URL}/?view=retention`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  // Click the first help button on the retention page (next to the heading)
  const retentionHelp = page.locator('button[aria-label*="What does"]').first();
  if (await retentionHelp.count()) {
    await retentionHelp.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({
    path: resolve(OUTPUT_DIR, "03-retention-help.png"),
    fullPage: false,
  });
  console.log("✓ 03-retention-help.png");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // --- 4. Calendar view (empty-state notice) ----------------------------
  // Navigate to a future month likely to have no events to trigger the
  // "No events this month" notice. We navigate to the current month first,
  // then advance 12 months forward.
  await page.goto(`${BASE_URL}/?view=calendar`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  // If there are events this month, advance to next month until we find
  // an empty one (or we've advanced 24 months).
  for (let i = 0; i < 24; i++) {
    const emptyNotice = await page.locator('[data-testid="calendar-empty-notice"]').count();
    if (emptyNotice > 0) break;
    // Click the "next month" button (ChevronRight)
    const nextBtn = page.locator('button:has(svg.lucide-chevron-right)').first();
    if (!(await nextBtn.count())) break;
    await nextBtn.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({
    path: resolve(OUTPUT_DIR, "04-calendar-empty-notice.png"),
    fullPage: false,
  });
  console.log("✓ 04-calendar-empty-notice.png");

  await browser.close();
  console.log("\nAll screenshots saved to:", OUTPUT_DIR);
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
