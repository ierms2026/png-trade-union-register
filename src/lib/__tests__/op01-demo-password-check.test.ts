import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { writeFileSync, unlinkSync } from "node:fs";
import { resetDb, testDb } from "./setup";
import { checkDemoPasswordLeak, runPasswordLeakCheck, readCandidatePasswordsFromFile } from "@/lib/security/demo-password-check";

const TEST_PASSWORD = "test-only-password-for-vitest-12chars";

describe("OP-01: checkDemoPasswordLeak — real module (file-based)", () => {
  beforeEach(async () => { await resetDb(); });
  afterEach(async () => { await resetDb(); });

  it("returns matching user's email (not the password) when hash matches", async () => {
    const hash = await bcrypt.hash(TEST_PASSWORD, 4);
    await testDb.user.create({ data: { email: "match@example.com", passwordHash: hash, role: "OFFICER" } });
    const matches = await checkDemoPasswordLeak([TEST_PASSWORD], async () =>
      testDb.user.findMany({ select: { email: true, role: true, passwordHash: true } })
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].email).toBe("match@example.com");
    expect(JSON.stringify(matches)).not.toContain(TEST_PASSWORD);
  });

  it("returns empty array when no user's hash matches", async () => {
    const hash = await bcrypt.hash("a-different-password", 4);
    await testDb.user.create({ data: { email: "no@example.com", passwordHash: hash, role: "REGISTRAR" } });
    const matches = await checkDemoPasswordLeak([TEST_PASSWORD], async () =>
      testDb.user.findMany({ select: { email: true, role: true, passwordHash: true } })
    );
    expect(matches).toHaveLength(0);
  });

  it("returns empty array when DB has no users", async () => {
    const matches = await checkDemoPasswordLeak([TEST_PASSWORD], async () => []);
    expect(matches).toHaveLength(0);
  });

  it("checks multiple candidate passwords", async () => {
    const hash1 = await bcrypt.hash("password-one-12chars", 4);
    const hash2 = await bcrypt.hash("password-two-12chars", 4);
    await testDb.user.create({ data: { email: "a@example.com", passwordHash: hash1, role: "REGISTRAR" } });
    await testDb.user.create({ data: { email: "b@example.com", passwordHash: hash2, role: "OFFICER" } });
    const matches = await checkDemoPasswordLeak(["password-one-12chars", "password-two-12chars"], async () =>
      testDb.user.findMany({ select: { email: true, role: true, passwordHash: true } })
    );
    expect(matches).toHaveLength(2);
  });

  it("skips users with malformed passwordHash", async () => {
    await testDb.user.create({ data: { email: "bad@example.com", passwordHash: "not-bcrypt", role: "REGISTRAR" } });
    const matches = await checkDemoPasswordLeak([TEST_PASSWORD], async () =>
      testDb.user.findMany({ select: { email: true, role: true, passwordHash: true } })
    );
    expect(matches).toHaveLength(0);
  });
});

describe("OP-01: runPasswordLeakCheck — exit codes", () => {
  beforeEach(async () => { await resetDb(); });
  afterEach(async () => { await resetDb(); });

  it("returns code 0 when no match", async () => {
    const { code } = await runPasswordLeakCheck([TEST_PASSWORD], async () => []);
    expect(code).toBe(0);
  });

  it("returns code 1 with matches when a user has the password", async () => {
    const hash = await bcrypt.hash(TEST_PASSWORD, 4);
    await testDb.user.create({ data: { email: "leak@example.com", passwordHash: hash, role: "OFFICER" } });
    const { code, matches } = await runPasswordLeakCheck([TEST_PASSWORD], async () =>
      testDb.user.findMany({ select: { email: true, role: true, passwordHash: true } })
    );
    expect(code).toBe(1);
    expect(matches[0].email).toBe("leak@example.com");
    expect(JSON.stringify(matches)).not.toContain(TEST_PASSWORD);
  });

  it("returns code 2 when candidate passwords array is empty", async () => {
    const { code } = await runPasswordLeakCheck([], async () => []);
    expect(code).toBe(2);
  });
});

describe("OP-01: readCandidatePasswordsFromFile — file-based", () => {
  const TMP_FILE = "/tmp/test-candidate-passwords.txt";

  afterEach(() => {
    try { unlinkSync(TMP_FILE); } catch {}
  });

  it("reads passwords from a file (one per line)", () => {
    writeFileSync(TMP_FILE, "password-one-12chars\npassword-two-12chars\n");
    process.env.PASSWORD_FILE = TMP_FILE;
    const result = readCandidatePasswordsFromFile();
    expect(result).toEqual(["password-one-12chars", "password-two-12chars"]);
    delete process.env.PASSWORD_FILE;
  });

  it("returns empty array when PASSWORD_FILE is unset", () => {
    delete process.env.PASSWORD_FILE;
    const result = readCandidatePasswordsFromFile();
    expect(result).toEqual([]);
  });

  it("returns empty array when file does not exist", () => {
    process.env.PASSWORD_FILE = "/tmp/nonexistent-file-12345.txt";
    const result = readCandidatePasswordsFromFile();
    expect(result).toEqual([]);
    delete process.env.PASSWORD_FILE;
  });
});
