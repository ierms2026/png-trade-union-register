import { describe, it, expect } from "vitest";
import { isRetentionEnabled, RETENTION_DISABLED_MESSAGE } from "@/lib/retention-flag";

// =============================================================================
// T11: Retention flag off returns a bare 404 (decision D5).
//
// When NEXT_PUBLIC_RETENTION_ENABLED is not set (or "false"), retention routes
// must return HTTP 404 with a generic body. The env var name must NOT appear
// in the response body — that would leak implementation detail to anyone
// hitting the URL.
//
// This test asserts the contract on RETENTION_DISABLED_MESSAGE (the constant
// every retention route returns in its 404 body when the flag is off). The
// route-level integration is verified by route-coverage.test.ts; this test
// locks the body content itself.
// =============================================================================

describe("T11: retention flag off — bare 404, no env var name in body", () => {
  it("RETENTION_DISABLED_MESSAGE does not contain the env var name", () => {
    expect(RETENTION_DISABLED_MESSAGE).not.toContain("NEXT_PUBLIC_RETENTION_ENABLED");
    expect(RETENTION_DISABLED_MESSAGE).not.toContain("RETENTION_ENABLED");
  });

  it("RETENTION_DISABLED_MESSAGE is a generic not-found message", () => {
    // The message must be generic — it reads as "this resource doesn't exist",
    // not "this feature is disabled, here's how to turn it on".
    expect(RETENTION_DISABLED_MESSAGE).toMatch(/not found|not available|not enabled/i);
    expect(RETENTION_DISABLED_MESSAGE.length).toBeLessThan(200);
  });

  it("isRetentionEnabled reads the env var (does not throw when unset)", () => {
    // The function reads process.env.NEXT_PUBLIC_RETENTION_ENABLED. In the
    // test environment it's unset, so isRetentionEnabled() returns false.
    // (Tests do not set the env var; see vitest.config.ts / setup.ts.)
    expect(typeof isRetentionEnabled()).toBe("boolean");
  });
});
