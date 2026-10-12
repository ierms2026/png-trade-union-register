import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const PASSWORD = ["Test", "!2345"].join("");

async function login(page: any, email: string) {
  const res = await page.request.post(`${BASE}/api/auth/login`, {
    data: { email, password: PASSWORD },
  });
  if (!res.ok()) throw new Error(`login failed for ${email}: ${res.status()}`);
}

async function main() {
  const browser = await chromium.launch();
  const results: string[] = [];

  for (const [role, email] of [
    ["REGISTRAR", "registrar@example.com"],
    ["INSPECTOR", "inspector@example.com"],
    ["OFFICER", "officer@example.com"],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await login(page, email);
    await page.goto(`${BASE}/?view=dashboard`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Extract all visible nav button text from the sidebar
    const navTexts = await page.locator('nav[aria-label="Main navigation"] button').allTextContents();
    const groupHeadings = await page.locator('nav[aria-label="Main navigation"] h3').allTextContents();

    results.push(`\n=== ${role} (${email}) ===`);
    results.push(`Group headings: ${JSON.stringify(groupHeadings)}`);
    results.push(`Nav items: ${JSON.stringify(navTexts)}`);

    // Verify Retention & Disposal is present for Registrar + Inspector
    if (role === "REGISTRAR" || role === "INSPECTOR") {
      const hasRetention = navTexts.some((t: string) => t.includes("Retention & Disposal"));
      results.push(`Has "Retention & Disposal": ${hasRetention ? "YES" : "NO"}`);
    }
    // Verify Officer does NOT have Retention & Disposal
    if (role === "OFFICER") {
      const hasRetention = navTexts.some((t: string) => t.includes("Retention"));
      results.push(`Officer has Retention (should be NO): ${hasRetention ? "YES" : "NO"}`);
      // Verify Officer sees "My Union" not "Unions"
      const hasMyUnion = navTexts.some((t: string) => t.includes("My Union"));
      const hasUnions = navTexts.some((t: string) => t === "Unions");
      results.push(`Officer has "My Union": ${hasMyUnion ? "YES" : "NO"}`);
      results.push(`Officer has "Unions" (should be NO): ${hasUnions ? "YES" : "NO"}`);
    }
    // Verify Access Monitoring (not "Security")
    const hasAccessMonitoring = navTexts.some((t: string) => t.includes("Access Monitoring"));
    const hasSecurity = navTexts.some((t: string) => t === "Security");
    results.push(`Has "Access Monitoring": ${hasAccessMonitoring ? "YES" : "NO"}`);
    results.push(`Has "Security" as nav label (should be NO): ${hasSecurity ? "YES" : "NO"}`);

    // Test nonsense view
    await page.goto(`${BASE}/?view=nonsense`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    const h1 = await page.locator("h1").first().textContent().catch(() => "");
    const bodyText = await page.locator("main").first().textContent().catch(() => "");
    results.push(`/?view=nonsense → h1="${h1?.trim()}", body starts with: "${bodyText?.substring(0, 80).trim()}"`);

    await ctx.close();
  }

  console.log(results.join("\n"));
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
