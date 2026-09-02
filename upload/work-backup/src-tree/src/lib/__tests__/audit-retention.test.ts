import { describe, it, expect, beforeEach } from "vitest";
import { Severity } from "@prisma/client";
import { testDb, resetDb } from "./setup";
import { RETENTION_DAYS, runRetentionSweep } from "@/lib/audit-retention";

// =============================================================================
// Audit retention sweep tests.
//
// The retention policy is:
//   INFO     → pruned after 365 days
//   WARNING  → pruned after 1095 days (3 years)
//   CRITICAL → NEVER pruned (excluded from the config type entirely)
//
// Each test seeds AuditLog rows with backdated `createdAt` values, runs the
// sweep, and asserts the prune counts + surviving rows.
// =============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedAudit(severity: Severity, daysAgo: number) {
  return testDb.auditLog.create({
    data: {
      actorName: "tester",
      action: "test_action",
      entityType: "TestEntity",
      severity,
      // Override the @default(now()) — Prisma lets us backdate explicitly.
      createdAt: new Date(Date.now() - daysAgo * DAY_MS),
    },
  });
}

// -----------------------------------------------------------------------------
// RETENTION_DAYS config
// -----------------------------------------------------------------------------

describe("RETENTION_DAYS config", () => {
  it("retains INFO entries for 365 days", () => {
    expect(RETENTION_DAYS.INFO).toBe(365);
  });

  it("retains WARNING entries for 1095 days (3 years)", () => {
    expect(RETENTION_DAYS.WARNING).toBe(1095);
  });

  it("does NOT configure CRITICAL — CRITICAL entries are never pruned", () => {
    // The type is Record<Exclude<Severity, "CRITICAL">, number>, so the
    // CRITICAL key is absent at runtime.
    expect("CRITICAL" in RETENTION_DAYS).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// runRetentionSweep
// -----------------------------------------------------------------------------

describe("runRetentionSweep", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("prunes INFO entries older than 365 days", async () => {
    await seedAudit(Severity.INFO, 400); // > 365d
    const result = await runRetentionSweep();
    expect(result.info).toBe(1);
    expect(await testDb.auditLog.count()).toBe(0);
  });

  it("preserves INFO entries younger than 365 days", async () => {
    await seedAudit(Severity.INFO, 100); // < 365d
    const result = await runRetentionSweep();
    expect(result.info).toBe(0);
    expect(await testDb.auditLog.count()).toBe(1);
  });

  it("prunes WARNING entries older than 1095 days", async () => {
    await seedAudit(Severity.WARNING, 1200); // > 1095d
    const result = await runRetentionSweep();
    expect(result.warning).toBe(1);
    expect(await testDb.auditLog.count()).toBe(0);
  });

  it("preserves WARNING entries younger than 1095 days", async () => {
    await seedAudit(Severity.WARNING, 800); // < 1095d
    const result = await runRetentionSweep();
    expect(result.warning).toBe(0);
    expect(await testDb.auditLog.count()).toBe(1);
  });

  it("never prunes CRITICAL entries, regardless of age", async () => {
    await seedAudit(Severity.CRITICAL, 9999); // ancient, but CRITICAL
    const result = await runRetentionSweep();
    expect(result.critical).toBe(0);
    expect(await testDb.auditLog.count()).toBe(1);
  });

  it("handles mixed entries — prunes some, preserves others, in a single sweep", async () => {
    await seedAudit(Severity.INFO, 400); // prune
    await seedAudit(Severity.INFO, 100); // keep
    await seedAudit(Severity.WARNING, 1200); // prune
    await seedAudit(Severity.WARNING, 800); // keep
    await seedAudit(Severity.CRITICAL, 9999); // keep
    const result = await runRetentionSweep();
    expect(result.info).toBe(1);
    expect(result.warning).toBe(1);
    expect(result.critical).toBe(0);
    expect(await testDb.auditLog.count()).toBe(3);
  });

  it("is idempotent — running twice does not double-delete and the second run returns 0", async () => {
    await seedAudit(Severity.INFO, 400);
    const first = await runRetentionSweep();
    expect(first.info).toBe(1);
    const second = await runRetentionSweep();
    expect(second.info).toBe(0);
    expect(await testDb.auditLog.count()).toBe(0);
  });

  it("returns 0 counts when the audit log is empty", async () => {
    const result = await runRetentionSweep();
    expect(result.info).toBe(0);
    expect(result.warning).toBe(0);
    expect(result.critical).toBe(0);
  });

  it("exposes cutoff dates matching now - RETENTION_DAYS for each severity", async () => {
    const before = Date.now();
    const result = await runRetentionSweep();
    const after = Date.now();
    const infoCutoffMs = result.cutoffs.info.getTime();
    const warningCutoffMs = result.cutoffs.warning.getTime();
    // Allow ±a few ms of slack for the time elapsed between before/after.
    expect(infoCutoffMs).toBeGreaterThanOrEqual(
      before - RETENTION_DAYS.INFO * DAY_MS,
    );
    expect(infoCutoffMs).toBeLessThanOrEqual(
      after - RETENTION_DAYS.INFO * DAY_MS,
    );
    expect(warningCutoffMs).toBeGreaterThanOrEqual(
      before - RETENTION_DAYS.WARNING * DAY_MS,
    );
    expect(warningCutoffMs).toBeLessThanOrEqual(
      after - RETENTION_DAYS.WARNING * DAY_MS,
    );
  });

  it("prunes multiple INFO entries in a single sweep", async () => {
    await seedAudit(Severity.INFO, 400);
    await seedAudit(Severity.INFO, 500);
    await seedAudit(Severity.INFO, 600);
    const result = await runRetentionSweep();
    expect(result.info).toBe(3);
    expect(await testDb.auditLog.count()).toBe(0);
  });
});
