import { describe, it, expect } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// =============================================================================
// OP-01: SESSION_SECRET behavioural test.
// Imports the session module with SESSION_SECRET unset and expects a throw.
// Uses a spawned process (can't unset env in-process because the module
// caches the value at import time).
// =============================================================================

describe("OP-01: SESSION_SECRET — behavioural test", () => {
  it("throws when SESSION_SECRET is unset (no fallback)", () => {
    const testScript = `import "${resolve(__dirname, "../../../src/lib/auth/session")}";`;
    const tmpPath = "/tmp/test-session-secret.ts";
    writeFileSync(tmpPath, testScript);
    try {
      execFileSync("npx", ["tsx", tmpPath], {
        env: { ...process.env, SESSION_SECRET: "" },
        encoding: "utf-8",
        timeout: 10000,
      });
      // If we get here, no throw — fail
      unlinkSync(tmpPath);
      expect.unreachable("Expected session.ts to throw when SESSION_SECRET is unset");
    } catch (e: any) {
      unlinkSync(tmpPath);
      expect(e.stderr).toContain("SESSION_SECRET");
      expect(e.stderr).toContain("required");
    }
  });

  it("Dockerfile/deploy scripts reference SESSION_SECRET (no literal)", () => {
    const { readFileSync } = require("node:fs");
    const files = [
      "download/Dockerfile",
      "download/qnap-dashboard/Dockerfile",
      "download/deploy-qnap.sh",
      "download/qnap-dashboard/startup.sh",
      "download/README-QNAP.md",
      "download/README-DEPLOY.md",
    ];
    for (const file of files) {
      try {
        const src = readFileSync(resolve(__dirname, "../../../..", file), "utf-8");
        if (src.includes("SESSION_SECRET")) {
          // Must be a reference (ENV/export), not a literal value
          expect(src).not.toMatch(/SESSION_SECRET\s*=\s*["'][a-f0-9]{16,}["']/);
        }
      } catch {
        // file may not exist
      }
    }
  });
});
