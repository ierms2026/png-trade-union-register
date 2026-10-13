import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { resetDb, testDb } from "./setup";
import { checkDemoPasswordLeak, runPasswordLeakCheck } from "@/lib/security/demo-password-check";

// =============================================================================
// OP-01: Behavioral tests for the demo-password-leak check module.
// Tests the REAL module (src/lib/security/demo-password-check.ts), not a copy.
// =============================================================================

const TEST_PASSWORD = "test-only-password-for-vitest-12chars";

describe("OP-01: checkDemoPasswordLeak — real module", () => {
  beforeEach(async () => { await resetDb(); });
  afterEach(async () => { await resetDb(); });

  it("returns matching user's email (not the password) when hash matches", async () => {
    const hash = await bcrypt.hash(TEST_PASSWORD, 4);
    await testDb.user.create({ data: { email: "match@example.com", passwordHash: hash, role: "OFFICER" } });
    const matches = await checkDemoPasswordLeak(TEST_PASSWORD, async () =>
      testDb.user.findMany({ select: { email: true, role: true, passwordHash: true } })
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].email).toBe("match@example.com");
    expect(JSON.stringify(matches)).not.toContain(TEST_PASSWORD);
  });

  it("returns empty array when no user's hash matches", async () => {
    const hash = await bcrypt.hash("a-different-password", 4);
    await testDb.user.create({ data: { email: "no@example.com", passwordHash: hash, role: "REGISTRAR" } });
    const matches = await checkDemoPasswordLeak(TEST_PASSWORD, async () =>
      testDb.user.findMany({ select: { email: true, role: true, passwordHash: true } })
    );
    expect(matches).toHaveLength(0);
  });

  it("returns empty array when DB has no users", async () => {
    const matches = await checkDemoPasswordLeak(TEST_PASSWORD, async () => []);
    expect(matches).toHaveLength(0);
  });

  it("handles multiple users — returns all matches", async () => {
    const hash = await bcrypt.hash(TEST_PASSWORD, 4);
    await testDb.user.create({ data: { email: "a@example.com", passwordHash: hash, role: "REGISTRAR" } });
    await testDb.user.create({ data: { email: "b@example.com", passwordHash: hash, role: "OFFICER" } });
    await testDb.user.create({ data: { email: "c@example.com", passwordHash: await bcrypt.hash("different", 4), role: "INSPECTOR" } });
    const matches = await checkDemoPasswordLeak(TEST_PASSWORD, async () =>
      testDb.user.findMany({ select: { email: true, role: true, passwordHash: true } })
    );
    expect(matches).toHaveLength(2);
    expect(matches.map(m => m.email).sort()).toEqual(["a@example.com", "b@example.com"]);
  });

  it("skips users with malformed passwordHash", async () => {
    await testDb.user.create({ data: { email: "bad@example.com", passwordHash: "not-bcrypt", role: "REGISTRAR" } });
    const matches = await checkDemoPasswordLeak(TEST_PASSWORD, async () =>
      testDb.user.findMany({ select: { email: true, role: true, passwordHash: true } })
    );
    expect(matches).toHaveLength(0);
  });
});

describe("OP-01: runPasswordLeakCheck — exit codes", () => {
  beforeEach(async () => { await resetDb(); });
  afterEach(async () => { await resetDb(); });

  it("returns code 0 when no match", async () => {
    const { code, matches } = await runPasswordLeakCheck(TEST_PASSWORD, async () => []);
    expect(code).toBe(0);
    expect(matches).toHaveLength(0);
  });

  it("returns code 1 with matches when a user has the password", async () => {
    const hash = await bcrypt.hash(TEST_PASSWORD, 4);
    await testDb.user.create({ data: { email: "leak@example.com", passwordHash: hash, role: "OFFICER" } });
    const { code, matches } = await runPasswordLeakCheck(TEST_PASSWORD, async () =>
      testDb.user.findMany({ select: { email: true, role: true, passwordHash: true } })
    );
    expect(code).toBe(1);
    expect(matches).toHaveLength(1);
    expect(matches[0].email).toBe("leak@example.com");
    expect(JSON.stringify(matches)).not.toContain(TEST_PASSWORD);
  });

  it("returns code 2 when candidate password is empty", async () => {
    const { code, matches } = await runPasswordLeakCheck("", async () => []);
    expect(code).toBe(2);
    expect(matches).toHaveLength(0);
  });
});
