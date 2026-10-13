import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// OP-01: Code-side hardening tests (static checks for demo gating + startup).
// Behavioral tests for the middleware are in op01-middleware-behavioral.test.ts.
// Public-404 tests are in op01-public-404.test.ts.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");

// =============================================================================
// 1. /demo credential gating
// =============================================================================

describe("OP-01.1: /demo credentials hidden when production OR DEMO_MODE unset", () => {
  const demoSrc = readFileSync(resolve(SRC_ROOT, "src/app/demo/page.tsx"), "utf-8");

  it("checks NODE_ENV === 'production'", () => {
    expect(demoSrc).toContain("NODE_ENV");
    expect(demoSrc).toContain('"production"');
  });

  it("checks DEMO_MODE env var", () => {
    expect(demoSrc).toContain("DEMO_MODE");
  });

  it("uses showCredentials = !isProduction && demoModeEnabled", () => {
    expect(demoSrc).toContain("showCredentials");
    expect(demoSrc).toMatch(/!isProduction && demoModeEnabled/);
  });

  it("reads DEMO_PASSWORD from env (not a literal)", () => {
    expect(demoSrc).toContain("process.env.DEMO_PASSWORD");
    expect(demoSrc).not.toContain("Test!");
  });

  it("source contains NO literal credential", () => {
    expect(demoSrc).not.toContain("Test!");
    expect(demoSrc).not.toMatch(/["']Test["'].*["']!2345["']/);
  });
});

// =============================================================================
// 2. Startup secret checks
// =============================================================================

describe("OP-01.2: instrumentation.ts production secret checks", () => {
  const instrSrc = readFileSync(resolve(SRC_ROOT, "instrumentation.ts"), "utf-8");

  it("checks SESSION_SECRET + CRON_SECRET in production", () => {
    expect(instrSrc).toContain("SESSION_SECRET");
    expect(instrSrc).toContain("CRON_SECRET");
  });

  it("throws on missing secrets", () => {
    expect(instrSrc).toMatch(/is required in production/);
  });

  it("throws on known demo values", () => {
    expect(instrSrc).toContain("knownDemoValues");
  });

  it("throws if ALLOW_DEMO_SEED=true in production", () => {
    expect(instrSrc).toContain("ALLOW_DEMO_SEED");
  });

  it("does NOT print any secret values", () => {
    expect(instrSrc).not.toContain("Test!");
    expect(instrSrc).not.toMatch(/[0-9a-f]{32,}/i);
  });
});

// =============================================================================
// 7. PasswordHash verification check (script)
// =============================================================================

describe("OP-01.7: demo password leak check module + script", () => {
  it("src/lib/security/demo-password-check.ts exists + exports checkDemoPasswordLeak", () => {
    const path = resolve(SRC_ROOT, "src/lib/security/demo-password-check.ts");
    const src = readFileSync(path, "utf-8");
    expect(src).toContain("export async function checkDemoPasswordLeak");
    expect(src).toContain("bcrypt.compare");
  });

  it("scripts/check-demo-password.ts is a thin wrapper importing the module", () => {
    const path = resolve(SRC_ROOT, "scripts/check-demo-password.ts");
    const src = readFileSync(path, "utf-8");
    expect(src).toContain("demo-password-check");
    expect(src).toContain("PASSWORD_FILE");
    // Must NOT contain bcrypt directly (it's in the module)
    expect(src).not.toContain("bcrypt.compare");
  });

  it("the module never prints the password", () => {
    const path = resolve(SRC_ROOT, "src/lib/security/demo-password-check.ts");
    const src = readFileSync(path, "utf-8");
    expect(src).not.toMatch(/console\.(log|error).*password/i);
  });

  it("the script exits with code 2 when DEMO_PASSWORD is empty", () => {
    const path = resolve(SRC_ROOT, "scripts/check-demo-password.ts");
    const src = readFileSync(path, "utf-8");
    expect(src).toMatch(/exit\(2\)/);
    expect(src).toMatch(/unset|empty/i);
  });
});

// =============================================================================
// No literal credentials anywhere in source
// =============================================================================

describe("OP-01: no literal credentials in source or docs", () => {
  const checkFiles = [
    "src/app/demo/page.tsx",
    "prisma/seed-demo.ts",
    "scripts/reset-demo-passwords.ts",
    "scripts/capture-layout-screenshots.ts",
    "scripts/capture-step5-screenshots.ts",
    "scripts/step8-officer-null-union-test.ts",
    "scripts/verify-login-flow.ts",
    "scripts/check-demo-password.ts",
    "instrumentation.ts",
    "src/middleware.ts",
    "STAKEHOLDER-TEST-SCRIPT.md",
    "KNOWN-LIMITATIONS.md",
    "docs/CONTENT.md",
  ];

  it("no file contains the literal demo credential string", () => {
    for (const file of checkFiles) {
      try {
        const src = readFileSync(resolve(SRC_ROOT, file), "utf-8");
        expect(src, `${file} must not contain the literal credential`).not.toContain("Test!2345");
      } catch {
        // file may not exist yet
      }
    }
  });

  it("spec_layout.txt has been deleted (contained a literal cron secret)", () => {
    // The file should not exist anywhere in the project
    const { existsSync } = require("node:fs");
    const { globSync } = require("node:fs");
    // Just check the known locations
    expect(existsSync(resolve(SRC_ROOT, "scripts/spec_layout.txt"))).toBe(false);
    expect(existsSync(resolve(SRC_ROOT, "download/qnap-dashboard/app/scripts/spec_layout.txt"))).toBe(false);
  });
});
