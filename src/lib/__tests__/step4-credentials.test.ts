import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// Step 4: Credential hardening tests.
//
// 1. seed-demo.ts refuses to run in production (production gate exists)
// 2. reset-demo-passwords.ts refuses to run in production
// 3. instrumentation.ts has production secret checks
// 4. No /demo tour page with credentials
// 5. session.ts throws in production if SESSION_SECRET is unset
// =============================================================================

describe("Step 4: credential hardening", () => {
  it("seed-demo.ts uses requireDemoPassword() (which has the production gate)", () => {
    const src = readFileSync(resolve(__dirname, "../../../prisma/seed-demo.ts"), "utf8");
    expect(src).toContain("requireDemoPassword");
    // The production gate is in require-demo-password.ts
    const gateSrc = readFileSync(resolve(__dirname, "../../../src/lib/security/require-demo-password.ts"), "utf8");
    expect(gateSrc).toContain("NODE_ENV");
    expect(gateSrc).toContain("production");
    expect(gateSrc).toContain("ALLOW_DEMO_SEED");
    expect(gateSrc).toMatch(/process\.exit\(1\)/);
  });

  it("reset-demo-passwords.ts has a production gate", () => {
    const src = readFileSync(resolve(__dirname, "../../../scripts/reset-demo-passwords.ts"), "utf8");
    expect(src).toContain("NODE_ENV");
    expect(src).toContain("production");
    expect(src).toContain("ALLOW_DEMO_SEED");
    expect(src).toMatch(/process\.exit\(1\)/);
  });

  it("instrumentation.ts checks SESSION_SECRET in production", () => {
    const src = readFileSync(resolve(__dirname, "../../../instrumentation.ts"), "utf8");
    expect(src).toContain("SESSION_SECRET");
    expect(src).toContain("required in production");
    expect(src).toContain("CRON_SECRET");
    expect(src).toContain("known demo value");
  });

  it("session.ts throws in production if SESSION_SECRET is unset, uses dev fallback otherwise", () => {
    const src = readFileSync(resolve(__dirname, "../../../src/lib/auth/session.ts"), "utf8");
    expect(src).toContain("SESSION_SECRET");
    expect(src).toContain("throw new Error");
    expect(src).toContain("production");
    // Dev fallback is allowed — the app must boot in dev without .env
    expect(src).toContain("dev-only-insecure-fallback");
    expect(src).toContain("??");
    // Production guard must exist
    expect(src).toMatch(/NODE_ENV.*production/);
  });

  it("create-stakeholder-account.ts exists and generates random passwords", () => {
    const src = readFileSync(resolve(__dirname, "../../../scripts/create-stakeholder-account.ts"), "utf8");
    expect(src).toMatch(/generatePassword/);
    expect(src).toMatch(/crypto\.randomBytes/);
    expect(src).toMatch(/passwordResetToken/); // forces password change
  });

  it("no /demo tour page shows credentials in production (IA-4: demo page exists but must be production-gated)", () => {
    // IA-4: /demo now exists as a tour page. It shows demo credentials only
    // when NODE_ENV !== "production". This test verifies:
    //   1. The demo page (if it exists) must check NODE_ENV === "production"
    //      + hide credentials in that branch.
    //   2. No OTHER .tsx file in src/app/ may contain both "demo" + "Test!"
    //      or a password pattern (the original guard, kept for non-demo files).
    const appDir = resolve(__dirname, "../../../src/app");
    const { readdirSync, statSync } = require("node:fs");
    const { join } = require("node:path");

    function findFiles(dir: string, ext: string): string[] {
      const results: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) results.push(...findFiles(full, ext));
        else if (entry.endsWith(ext)) results.push(full);
      }
      return results;
    }

    const tsxFiles = findFiles(appDir, ".tsx");
    for (const file of tsxFiles) {
      const content = readFileSync(file, "utf-8");
      const isDemoPage = file.includes("/demo/") || content.includes("Demo Tour");

      if (isDemoPage) {
        // OP-01: the demo page must check BOTH NODE_ENV === "production"
        // AND DEMO_MODE env var. Credentials are shown only when
        // !isProduction && demoModeEnabled.
        expect(content).toContain('NODE_ENV');
        expect(content).toContain('"production"');
        expect(content).toContain('DEMO_MODE');
        expect(content).toMatch(/showCredentials/);
        // The demo password must NOT appear as a literal "Test!" string in
        // the source — it must be assembled from parts (so the source
        // itself doesn't contain the credential).
        expect(content).not.toContain('Test!');
      } else {
        // Non-demo files: the original guard — no "demo" + "Test!" combo.
        if (content.toLowerCase().includes("demo") && content.includes("Test!")) {
          throw new Error(`Found non-demo page with hardcoded password: ${file}`);
        }
        if (content.toLowerCase().includes("demo") && content.match(/password.*["'].*["']/i)) {
          throw new Error(`Found non-demo page with hardcoded password: ${file}`);
        }
      }
    }
  });

  it("cron routes have no dev fallback for CRON_SECRET", () => {
    const cronDir = resolve(__dirname, "../../../src/app/api/cron");
    const { readdirSync, statSync } = require("node:fs");
    const { join } = require("node:path");

    function findFiles(dir: string): string[] {
      const results: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) results.push(...findFiles(full));
        else if (entry.endsWith(".ts")) results.push(full);
      }
      return results;
    }

    const cronFiles = findFiles(cronDir);
    for (const file of cronFiles) {
      const content = readFileSync(file, "utf8");
      // Must read CRON_SECRET from env
      expect(content).toMatch(/process\.env\.CRON_SECRET/);
      // Must NOT have a dev fallback string
      expect(content).not.toMatch(/dev-cron-secret/i);
      expect(content).not.toMatch(/dev.*secret.*fallback/i);
    }
  });
});
