import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./setup";

// =============================================================================
// Smoke tests for the test database infrastructure itself.
//
// These verify that:
//   1. The PrismaClient exported from setup.ts can reach the test SQLite file.
//   2. resetDb() actually clears tables (so tests start from a known state).
//   3. resetDb() is safe to call on an already-empty database (idempotent).
//
// If these fail, every other test file in this directory is suspect — the
// DB connection or the reset helper is broken.
// =============================================================================

describe("test database setup", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("connects to the test database and can run a raw query", async () => {
    // The simplest possible query — if the connection is broken or the
    // schema hasn't been pushed, this throws.
    const result = (await testDb.$queryRaw`SELECT 1 AS one`) as Array<{
      one: number;
    }>;
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(Number(result[0].one)).toBe(1);
  });

  it("resetDb clears the User table (and is called before each test)", async () => {
    // beforeEach already ran resetDb, so the table starts empty.
    expect(await testDb.user.count()).toBe(0);

    // Seed a row.
    await testDb.user.create({
      data: {
        email: "smoke@example.com",
        passwordHash: "!pending",
        role: "REGISTRAR",
      },
    });
    expect(await testDb.user.count()).toBe(1);

    // Reset again — the row should be gone.
    await resetDb();
    expect(await testDb.user.count()).toBe(0);
  });

  it("resetDb is idempotent — calling it on an empty DB is a no-op", async () => {
    expect(await testDb.user.count()).toBe(0);
    await resetDb();
    await resetDb(); // double-call — must not throw, must not change state.
    expect(await testDb.user.count()).toBe(0);
  });
});
