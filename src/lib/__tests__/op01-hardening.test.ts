import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// OP-01: Code-side hardening tests.
//
// 1. /demo: credentials hidden when NODE_ENV=production OR DEMO_MODE unset.
// 2. Startup: instrumentation.ts checks secrets + ALLOW_DEMO_SEED gate.
// 3. DEMO_READ_ONLY: middleware blocks non-GET requests (except auth).
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");

// =============================================================================
// 1. /demo credential gating
// =============================================================================

describe("OP-01.1: /demo credentials hidden in production OR when DEMO_MODE unset", () => {
  const demoSrc = readFileSync(
    resolve(SRC_ROOT, "src/app/demo/page.tsx"),
    "utf-8",
  );

  it("checks NODE_ENV === 'production'", () => {
    expect(demoSrc).toContain('NODE_ENV');
    expect(demoSrc).toContain('"production"');
  });

  it("checks DEMO_MODE env var", () => {
    expect(demoSrc).toContain("DEMO_MODE");
  });

  it("uses a showCredentials variable that requires BOTH non-production AND DEMO_MODE", () => {
    expect(demoSrc).toContain("showCredentials");
    expect(demoSrc).toMatch(/!isProduction && demoModeEnabled/);
  });

  it("credentials are only shown when showCredentials is true", () => {
    expect(demoSrc).toMatch(/\{showCredentials \?/);
  });

  it("source does NOT contain the literal credential string", () => {
    expect(demoSrc).not.toContain("Test!");
  });

  it("has a non-production message about setting DEMO_MODE", () => {
    expect(demoSrc).toContain("Set DEMO_MODE=true");
  });

  it("has a production message about contacting the Registrar", () => {
    expect(demoSrc).toContain("not available in production");
  });
});

// =============================================================================
// 2. Startup secret checks
// =============================================================================

describe("OP-01.2: instrumentation.ts production secret checks", () => {
  const instrSrc = readFileSync(
    resolve(SRC_ROOT, "instrumentation.ts"),
    "utf-8",
  );

  it("checks NODE_ENV === 'production'", () => {
    expect(instrSrc).toContain('NODE_ENV');
    expect(instrSrc).toContain('"production"');
  });

  it("checks SESSION_SECRET is set", () => {
    expect(instrSrc).toContain("SESSION_SECRET");
  });

  it("checks CRON_SECRET is set", () => {
    expect(instrSrc).toContain("CRON_SECRET");
  });

  it("throws on missing secrets in production", () => {
    expect(instrSrc).toMatch(/is required in production/);
  });

  it("throws on known demo values", () => {
    expect(instrSrc).toContain("knownDemoValues");
    expect(instrSrc).toMatch(/known demo value/);
  });

  it("throws if ALLOW_DEMO_SEED=true in production (blocks demo password)", () => {
    expect(instrSrc).toContain("ALLOW_DEMO_SEED");
    expect(instrSrc).toMatch(/ALLOW_DEMO_SEED.*true.*production/);
  });

  it("does NOT print any secret values", () => {
    // The known demo values array should only contain the dev fallback
    // strings, not the actual seed password or cron secret.
    expect(instrSrc).not.toContain("Test!");
    // The file should not contain any hex strings that look like secrets
    // (32+ hex chars)
    expect(instrSrc).not.toMatch(/[0-9a-f]{32,}/i);
  });
});

// Known demo value locations (file:line only, no values printed)
describe("OP-01.2: known demo value locations (file:line only)", () => {
  it("reports where the demo password is defined (file:line only)", () => {
    // These are the locations — the test verifies the files exist.
    // The actual values are NOT printed.
    const locations = [
      "prisma/seed-demo.ts:45",
      "prisma/seed-demo.ts:54",
      "scripts/spec_layout.txt:61",
      "scripts/spec_layout.txt:73",
      "scripts/spec_layout.txt:85",
      "src/app/demo/page.tsx:33",
    ];
    for (const loc of locations) {
      const [file] = loc.split(":");
      const fullPath = resolve(SRC_ROOT, file);
      expect(readFileSync(fullPath, "utf-8").length).toBeGreaterThan(0);
    }
  });

  it("reports where the cron secret dev fallback WAS (now removed)", () => {
    // The cron routes used to have a dev-cron-secret fallback. Step 4 (B6)
    // removed it. Verify the cron routes read from env only.
    const cronFiles = [
      "src/app/api/cron/audit-retention-sweep/route.ts",
      "src/app/api/cron/compliance-digest/route.ts",
      "src/app/api/cron/compliance-snapshot/route.ts",
      "src/app/api/cron/compliance-sweep/route.ts",
      "src/app/api/cron/snapshot-retention-sweep/route.ts",
      "src/app/api/cron/webhook-retry/route.ts",
    ];
    for (const file of cronFiles) {
      const src = readFileSync(resolve(SRC_ROOT, file), "utf-8");
      expect(src).toContain("CRON_SECRET");
      expect(src).not.toMatch(/dev-cron-secret/i);
    }
  });
});

// =============================================================================
// 3. DEMO_READ_ONLY middleware
// =============================================================================

describe("OP-01.3: DEMO_READ_ONLY middleware", () => {
  const middlewareSrc = readFileSync(
    resolve(SRC_ROOT, "src/middleware.ts"),
    "utf-8",
  );

  it("middleware.ts exists + exports a middleware function", () => {
    expect(middlewareSrc).toContain("export function middleware");
  });

  it("checks DEMO_READ_ONLY === 'true'", () => {
    expect(middlewareSrc).toContain("DEMO_READ_ONLY");
    expect(middlewareSrc).toMatch(/DEMO_READ_ONLY.*"true"/);
  });

  it("allows GET/HEAD/OPTIONS requests", () => {
    expect(middlewareSrc).toMatch(/req\.method === "GET"/);
    expect(middlewareSrc).toMatch(/req\.method === "HEAD"/);
    expect(middlewareSrc).toMatch(/req\.method === "OPTIONS"/);
  });

  it("allows POST to /api/auth/login + /api/auth/logout + password reset", () => {
    expect(middlewareSrc).toContain("/api/auth/login");
    expect(middlewareSrc).toContain("/api/auth/logout");
    expect(middlewareSrc).toContain("/api/auth/forgot-password");
    expect(middlewareSrc).toContain("/api/auth/set-password");
  });

  it("blocks other non-GET requests with 403", () => {
    expect(middlewareSrc).toMatch(/status: 403/);
    expect(middlewareSrc).toContain("read-only demo");
  });

  it("is a no-op when DEMO_READ_ONLY is not set", () => {
    expect(middlewareSrc).toMatch(/DEMO_READ_ONLY !== "true"[\s\S]*?NextResponse\.next/);
  });

  it("matcher covers /api/*", () => {
    expect(middlewareSrc).toContain('"/api/:path*"');
  });
});
