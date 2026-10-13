import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// =============================================================================
// OP-01: Tests for requireDemoPassword() — the shared validation function.
//
// Tests by spawning a tiny script that calls requireDemoPassword() and exits.
// We can't import it directly because it calls process.exit() on failure.
// =============================================================================

const ORIG_DEMO_PASSWORD = process.env.DEMO_PASSWORD;
const ORIG_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  if (ORIG_DEMO_PASSWORD !== undefined) process.env.DEMO_PASSWORD = ORIG_DEMO_PASSWORD;
  else delete process.env.DEMO_PASSWORD;
  // NODE_ENV is read-only in TypeScript — use Reflect or cast
  if (ORIG_NODE_ENV !== undefined) (process.env as Record<string, string>).NODE_ENV = ORIG_NODE_ENV;
  else delete (process.env as Record<string, string>).NODE_ENV;
});

function runRequireDemoPassword(env: Record<string, string>): { code: number; stdout: string; stderr: string } {
  const { writeFileSync, unlinkSync } = require("node:fs");
  // Write a tiny TS script to /tmp that imports the real module
  const testScript = `import { requireDemoPassword } from "${resolve(__dirname, "../../../src/lib/security/require-demo-password")}";
try {
  const pw = requireDemoPassword();
  console.log("OK:" + pw.length);
  process.exit(0);
} catch (e) {
  process.exit(99);
}`;
  const tmpPath = "/tmp/test-require-demo-password.ts";
  writeFileSync(tmpPath, testScript);
  try {
    const stdout = execFileSync("npx", ["tsx", tmpPath], {
      env: { ...process.env, ...env },
      encoding: "utf-8",
      timeout: 15000,
    });
    unlinkSync(tmpPath);
    return { code: 0, stdout, stderr: "" };
  } catch (e: any) {
    unlinkSync(tmpPath);
    return {
      code: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

describe("OP-01: requireDemoPassword() — shared validation", () => {
  it("exits 1 when DEMO_PASSWORD is unset", () => {
    const result = runRequireDemoPassword({ NODE_ENV: "development" });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unset");
  });

  it("exits 1 when DEMO_PASSWORD is empty", () => {
    const result = runRequireDemoPassword({ NODE_ENV: "development", DEMO_PASSWORD: "" });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unset");
  });

  it("exits 1 when DEMO_PASSWORD is under 12 chars", () => {
    const result = runRequireDemoPassword({ NODE_ENV: "development", DEMO_PASSWORD: "short" });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("under 12");
  });

  it("exits 1 in production (without ALLOW_DEMO_SEED)", () => {
    const result = runRequireDemoPassword({
      NODE_ENV: "production",
      DEMO_PASSWORD: "valid-password-12chars",
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("production");
  });

  it("succeeds (exit 0) when DEMO_PASSWORD is valid + not production", () => {
    const result = runRequireDemoPassword({
      NODE_ENV: "development",
      DEMO_PASSWORD: "valid-password-12chars",
    });
    expect(result.code).toBe(0);
    // Must NOT print the password value
    expect(result.stdout).not.toContain("valid-password-12chars");
    expect(result.stderr).not.toContain("valid-password-12chars");
  });

  it("succeeds in production when ALLOW_DEMO_SEED=true", () => {
    const result = runRequireDemoPassword({
      NODE_ENV: "production",
      DEMO_PASSWORD: "valid-password-12chars",
      ALLOW_DEMO_SEED: "true",
    });
    expect(result.code).toBe(0);
  });
});
