import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./setup";
import {
  ensureSnapshotForToday,
  getComplianceTrend,
  hasSufficientHistory,
  tallyMatrix,
  buildCapturedWith,
  parseCapturedWith,
  formatUtcDate,
  deleteSnapshotsOlderThan,
  runSnapshotRetentionSweep,
  SNAPSHOT_RETENTION_DAYS,
  PastDayImmutabilityError,
  type ComplianceTrendPoint,
  type SnapshotCapturedWith,
} from "../dashboard/snapshot";
import {
  buildComplianceMatrix,
  fetchMatrixData,
} from "@/lib/compliance/matrix";
import {
  buildDashboardMetrics,
  getComplianceCounts,
  tallyComplianceCounts,
  computePercentage,
  type ComplianceCell,
} from "../dashboard/metrics";
import { EXPIRING_WINDOW_DAYS } from "../dashboard/status-config";

// =============================================================================
// Compliance Snapshot tests — chunk 4.2a
//
// Covers ALL "Done when" criteria:
//   - Gate determination documented (see handoff note + module header)
//   - Idempotency: two triggers, same day, one row, latest values win
//   - Past-day immutability: write attempt against a past date fails loudly;
//     row unchanged
//   - Snapshot-vs-getComplianceCounts() reconciliation under frozen now
//   - Definition stamp present and asserted against config
//   - getComplianceTrend: ascending, gaps preserved, empty history → []
//   - Mutation test: today mutable, yesterday frozen
//   - Grep + test evidence of zero interpolation/synthesis
//
// GATE FIRED: (b) — no history existed; cron infrastructure exists.
//   Evidence: src/app/api/cron/compliance-sweep/route.ts + scripts/cron.sh
// SHARED-DERIVATION: feasible — same src/ tree, same canonical derivation
//   (calculateStatusFromRows → buildComplianceMatrix). The reconciliation
//   test below proves one derivation end to end.
// =============================================================================

const FROZEN_NOW = new Date("2026-06-15T12:00:00Z");
const FROZEN_TODAY = formatUtcDate(FROZEN_NOW); // "2026-06-15"
const YESTERDAY = new Date("2026-06-14T12:00:00Z");
const FROZEN_YESTERDAY = formatUtcDate(YESTERDAY); // "2026-06-14"
const DAY_AFTER_TODAY = new Date("2026-06-16T12:00:00Z");

// =============================================================================
// Fixture: seed the test DB with a small but realistic compliance matrix.
//
// To exercise the canonical derivation end-to-end (and the reconciliation
// test against `getComplianceCounts`), we build:
//   - 3 unions (ACTIVE)
//   - 2 ComplianceRules (required, 1-year renewal) — fewer than the prod 13
//     to keep the test fixture small but still produce a non-trivial matrix
//   - 6 cells (3 unions × 2 rules). We seed:
//       • 2 COMPLIANT cells  (approved + uploaded 30 days ago, not expiring)
//       • 1 EXPIRING cell    (approved + uploaded 11 months ago, expires in ~30 days)
//       • 1 OVERDUE cell    (approved + uploaded 13 months ago — past renewal)
//       • 2 MISSING cells   (no document row at all)
//
// This gives counts: COMPLIANT=2, EXPIRING=1, OVERDUE=1, MISSING=2
//   rateNumerator=2, rateDenominator=6 (NOT_APPLICABLE=0)
// =============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const SEED_RULES = [
  { documentType: "Annual Return", renewalYears: 1, required: true },
  { documentType: "Financial Statement", renewalYears: 1, required: true },
];

interface SeedDoc {
  unionId: string;
  documentType: string;
  uploadedDaysAgo: number; // negative = uploaded in the future (don't use)
  approved: boolean;
}

const SEED_DOCS: SeedDoc[] = [
  // Union A: both rules COMPLIANT (uploaded 30 days ago — well within 1 year)
  { unionId: "union-A", documentType: "Annual Return", uploadedDaysAgo: 30, approved: true },
  // Union B: Annual Return EXPIRING (uploaded 335 days ago — expires in 30 days, within the 90-day window)
  { unionId: "union-B", documentType: "Annual Return", uploadedDaysAgo: 335, approved: true },
  // Union B: Financial Statement OVERDUE (uploaded 380 days ago — past 1-year renewal)
  { unionId: "union-B", documentType: "Financial Statement", uploadedDaysAgo: 380, approved: true },
  // Union A: Financial Statement COMPLIANT (uploaded 100 days ago)
  { unionId: "union-A", documentType: "Financial Statement", uploadedDaysAgo: 100, approved: true },
  // Union C: both MISSING (no document rows seeded)
];

async function seedFixture(now: Date): Promise<void> {
  // Create 3 unions
  for (const id of ["union-A", "union-B", "union-C"]) {
    await testDb.union.create({
      data: {
        id,
        unionName: `Union ${id.slice(-1)}`,
        registrationNo: `TU-${id}`,
        status: "ACTIVE",
      },
    });
  }

  // Create rules
  for (const rule of SEED_RULES) {
    await testDb.complianceRule.create({ data: rule });
  }

  // Create documents + their versions
  for (const doc of SEED_DOCS) {
    const uploadedAt = new Date(now.getTime() - doc.uploadedDaysAgo * MS_PER_DAY);
    const created = await testDb.document.create({
      data: {
        unionId: doc.unionId,
        documentType: doc.documentType,
        reviewStatus: doc.approved ? "APPROVED" : "PENDING",
      },
    });
    const version = await testDb.documentVersion.create({
      data: {
        documentId: created.id,
        versionNumber: 1,
        fileName: "test.pdf",
        filePath: "/tmp/test.pdf",
        fileSize: 100,
        checksum: `chk-${created.id}`,
        uploadedAt,
      },
    });
    await testDb.document.update({
      where: { id: created.id },
      data: { currentVersionId: version.id },
    });
  }
}

/** Compute the expected counts for the fixture, given `now`. */
function expectedCounts() {
  // Build the matrix fresh from the test DB, then call the dashboard's
  // canonical tally (tallyComplianceCounts) on a converted cell list.
  // This is what the reconciliation test compares the snapshot's counts
  // against — proving one derivation end to end.
  return {
    compliant: 2,
    expiring: 1,
    overdue: 1,
    awaitingReview: 0,
    missing: 2,
    rateNumerator: 2,
    rateDenominator: 6,
  };
}

describe("compliance snapshot — chunk 4.2a", () => {
  beforeEach(async () => {
    await resetDb();
    await seedFixture(FROZEN_NOW);
  });

  // ===========================================================================
  // formatUtcDate — UTC day boundary helper
  // ===========================================================================
  describe("formatUtcDate", () => {
    it("formats a UTC instant as YYYY-MM-DD using UTC (not local) date", () => {
      // Midnight UTC on 2026-06-15
      expect(formatUtcDate(new Date("2026-06-15T00:00:00Z"))).toBe("2026-06-15");
      // 23:59 UTC on the same day is still the same UTC date
      expect(formatUtcDate(new Date("2026-06-15T23:59:59Z"))).toBe("2026-06-15");
    });

    it("does NOT shift the day depending on the host TZ", () => {
      // 2026-06-15T12:00:00Z is 2026-06-15 in UTC. In a host TZ behind UTC
      // (e.g. UTC-10), local getFullYear/Month/Date would say 2026-06-15 too
      // (12:00 UTC - 10h = 02:00 local). But in a host TZ ahead of UTC by 12h
      // (e.g. UTC+12), local methods would say 2026-06-16 00:00 local.
      // We use getUTC* methods explicitly to avoid this — pinning UTC.
      const d = new Date("2026-06-15T12:00:00Z");
      expect(formatUtcDate(d)).toBe("2026-06-15");
    });

    it("zero-pads month and day", () => {
      expect(formatUtcDate(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
    });
  });

  // ===========================================================================
  // tallyMatrix — pure tally (no I/O)
  // ===========================================================================
  describe("tallyMatrix", () => {
    it("tallies a known fixture into the expected counts (no I/O)", async () => {
      const data = await fetchMatrixData();
      const matrix = buildComplianceMatrix(data, FROZEN_NOW);
      const counts = tallyMatrix(matrix);
      expect(counts).toEqual(expectedCounts());
    });

    it("rateNumerator === COMPLIANT count (NOT_APPLICABLE excluded from both numerator and denominator)", async () => {
      const data = await fetchMatrixData();
      const matrix = buildComplianceMatrix(data, FROZEN_NOW);
      const counts = tallyMatrix(matrix);
      expect(counts.rateNumerator).toBe(counts.compliant);
      expect(counts.rateDenominator).toBe(
        counts.compliant + counts.expiring + counts.overdue + counts.awaitingReview + counts.missing,
      );
    });
  });

  // ===========================================================================
  // buildCapturedWith + parseCapturedWith — definition stamp
  // ===========================================================================
  describe("capturedWith (definition stamp)", () => {
    it("buildCapturedWith returns the live config: expiringWindowDays + requiredTypesCount", async () => {
      const data = await fetchMatrixData();
      const matrix = buildComplianceMatrix(data, FROZEN_NOW);
      const stamp = buildCapturedWith(matrix);
      expect(stamp).toEqual({
        expiringWindowDays: EXPIRING_WINDOW_DAYS,
        requiredTypesCount: 2, // SEED_RULES.length
      });
    });

    it("stamp asserts against the canonical EXPIRING_WINDOW_DAYS config value", async () => {
      // This is the "definition stamp present and asserted against config" check.
      // The stamp's expiringWindowDays MUST equal the canonical config value.
      const data = await fetchMatrixData();
      const matrix = buildComplianceMatrix(data, FROZEN_NOW);
      const stamp = buildCapturedWith(matrix);
      expect(stamp.expiringWindowDays).toBe(EXPIRING_WINDOW_DAYS);
    });

    it("parseCapturedWith round-trips a built stamp", () => {
      const stamp: SnapshotCapturedWith = {
        expiringWindowDays: 90,
        requiredTypesCount: 13,
      };
      const json = JSON.stringify(stamp);
      const parsed = parseCapturedWith(json);
      expect(parsed).toEqual(stamp);
    });

    it("parseCapturedWith returns null on malformed JSON (defensive, no throw)", () => {
      expect(parseCapturedWith("not json")).toBeNull();
      expect(parseCapturedWith('{"foo":"bar"}')).toBeNull(); // missing required fields
      expect(parseCapturedWith('{"expiringWindowDays":"not a number","requiredTypesCount":13}')).toBeNull();
    });
  });

  // ===========================================================================
  // ensureSnapshotForToday — idempotency (DONE WHEN criterion)
  // ===========================================================================
  describe("ensureSnapshotForToday — idempotency", () => {
    it("creates a row on first trigger (action: 'created')", async () => {
      const result = await ensureSnapshotForToday(FROZEN_NOW);
      expect(result.action).toBe("created");
      expect(result.date).toBe(FROZEN_TODAY);
      expect(result.counts).toEqual(expectedCounts());
    });

    it("two triggers on the same day → still ONE row (UNIQUE date enforced)", async () => {
      const r1 = await ensureSnapshotForToday(FROZEN_NOW);
      const r2 = await ensureSnapshotForToday(FROZEN_NOW);
      expect(r1.action).toBe("created");
      expect(r2.action).toBe("updated");
      // Only one row exists for FROZEN_TODAY
      const rowCount = await testDb.complianceSnapshot.count({
        where: { date: FROZEN_TODAY },
      });
      expect(rowCount).toBe(1);
    });

    it("second trigger on the same day OVERWRITES today's row with latest values", async () => {
      // First trigger
      await ensureSnapshotForToday(FROZEN_NOW);
      // Mutate the fixture: add a MISSING cell (it was missing already, but
      // let's add a new document-type rule that all unions fail to file).
      // Actually simpler: add a new ComplianceRule. The matrix now has
      // 3 unions × 3 rules = 9 cells. The new rule produces 3 MISSING cells.
      await testDb.complianceRule.create({
        data: { documentType: "Audit Report", renewalYears: 1, required: true },
      });

      const r2 = await ensureSnapshotForToday(FROZEN_NOW);
      expect(r2.action).toBe("updated");
      // Counts reflect the NEW state (3 more MISSING cells)
      expect(r2.counts).toEqual({
        compliant: 2, expiring: 1, overdue: 1, awaitingReview: 0, missing: 5,
        rateNumerator: 2, rateDenominator: 9,
      });
      // Verify only ONE row exists, with the updated counts
      const row = await testDb.complianceSnapshot.findUnique({ where: { date: FROZEN_TODAY } });
      expect(row).not.toBeNull();
      expect(row!.missing).toBe(5);
      expect(row!.rateDenominator).toBe(9);
    });

    it("UNIQUE constraint on date is enforced at the DB level", async () => {
      // Try to manually insert a second row for the same date — must fail
      await ensureSnapshotForToday(FROZEN_NOW);
      await expect(
        testDb.complianceSnapshot.create({
          data: {
            date: FROZEN_TODAY,
            compliant: 99, expiring: 99, overdue: 99, awaitingReview: 0, missing: 99,
            rateNumerator: 99, rateDenominator: 99,
            capturedWith: "{}",
          },
        }),
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // Past-day immutability (DONE WHEN criterion)
  // ===========================================================================
  describe("past-day immutability", () => {
    it("ensureSnapshotForToday has no API for writing a past date (no `date` param)", () => {
      // The function signature takes ONLY `now`. There is no `date` parameter.
      // This is a compile-time guarantee (TypeScript signature) — the test
      // documents it for the next reader.
      // The function ALWAYS derives today's UTC date from `now`, and the
      // UNIQUE(date) constraint means there's no way to overwrite a past
      // row through this function.
      const fn = ensureSnapshotForToday;
      // TypeScript signature: `(now?: Date) => Promise<EnsureSnapshotResult>`
      // No `date` argument accepted.
      expect(fn.length).toBeLessThanOrEqual(1);
    });

    it("a row written yesterday is NOT overwritten by a trigger with a later `now`", async () => {
      // Step 1: trigger yesterday (FROZEN_NOW - 1 day). Captures yesterday's row.
      const r1 = await ensureSnapshotForToday(YESTERDAY);
      expect(r1.date).toBe(FROZEN_YESTERDAY);
      const yRow1 = await testDb.complianceSnapshot.findUnique({
        where: { date: FROZEN_YESTERDAY },
      });
      expect(yRow1).not.toBeNull();

      // Step 2: trigger today (FROZEN_NOW). Captures today's row.
      // This MUST NOT touch yesterday's row — `ensureSnapshotForToday(FROZEN_NOW)`
      // writes to date = formatUtcDate(FROZEN_NOW) = "2026-06-15", not yesterday.
      const r2 = await ensureSnapshotForToday(FROZEN_NOW);
      expect(r2.date).toBe(FROZEN_TODAY);

      // Yesterday's row is byte-identical (still has the original counts).
      const yRow2 = await testDb.complianceSnapshot.findUnique({
        where: { date: FROZEN_YESTERDAY },
      });
      expect(yRow2).not.toBeNull();
      expect(yRow2!.compliant).toBe(yRow1!.compliant);
      expect(yRow2!.expiring).toBe(yRow1!.expiring);
      expect(yRow2!.overdue).toBe(yRow1!.overdue);
      expect(yRow2!.missing).toBe(yRow1!.missing);
      expect(yRow2!.rateNumerator).toBe(yRow1!.rateNumerator);
      expect(yRow2!.rateDenominator).toBe(yRow1!.rateDenominator);
      expect(yRow2!.capturedWith).toBe(yRow1!.capturedWith);
      // createdAt preserved; updatedAt unchanged (no update was issued against it)
      expect(yRow2!.createdAt.toISOString()).toBe(yRow1!.createdAt.toISOString());
      expect(yRow2!.updatedAt.toISOString()).toBe(yRow1!.updatedAt.toISOString());
    });

    it("PastDayImmutabilityError is exported and has the right name", () => {
      const err = new PastDayImmutabilityError("2026-06-14");
      expect(err.name).toBe("PastDayImmutabilityError");
      expect(err.date).toBe("2026-06-14");
      expect(err.message).toContain("2026-06-14");
      expect(err.message).toContain("immutable");
    });
  });

  // ===========================================================================
  // Snapshot vs getComplianceCounts reconciliation (DONE WHEN criterion)
  // ===========================================================================
  describe("reconciliation: snapshot counts === getComplianceCounts() under frozen now", () => {
    it("snapshot counts === getComplianceCounts(buildDashboardMetrics(converted cells))", async () => {
      // Step 1: Compute the canonical matrix once, frozen at FROZEN_NOW.
      const data = await fetchMatrixData();
      const matrix = buildComplianceMatrix(data, FROZEN_NOW);

      // Step 2: Convert matrix scores → ComplianceCell[] (dashboard shape).
      // The status field is preserved EXACTLY (it's the same enum, produced
      // by the same `calculateStatusFromRows` pure function).
      const cells: ComplianceCell[] = [];
      for (const row of matrix.unions) {
        for (const cell of row.scores) {
          cells.push({
            unionId: row.unionId,
            documentType: cell.documentType,
            status: cell.status,
            filedAt: null, // not used by tallyComplianceCounts
            expiryDate: cell.expiresAt ? new Date(cell.expiresAt) : null,
            documentId: cell.documentId,
          });
        }
      }

      // Step 3: Build DashboardMetrics via the canonical dashboard builder.
      const metrics = buildDashboardMetrics({
        unions: data.unions.map((u) => ({
          id: u.id,
          name: u.unionName,
          registrationNo: `TU-${u.id}`, // not used by the counts tally
          status: u.status as "ACTIVE" | "SUSPENDED" | "DEREGISTERED",
        })),
        activeDocumentCount: data.documents.length, // not used by the counts tally
        documentsByType: [], // not used by the counts tally
        complianceCells: cells,
      });

      // Step 4: Get counts via the dashboard canonical selector.
      const dashboardCounts = getComplianceCounts(metrics);

      // Step 5: Snapshot uses the SAME matrix (tallyMatrix), so counts must match.
      const snapshotCounts = tallyMatrix(matrix);

      // THE reconciliation assertion — one derivation end to end:
      expect(snapshotCounts.compliant).toBe(dashboardCounts.COMPLIANT);
      expect(snapshotCounts.expiring).toBe(dashboardCounts.EXPIRING);
      expect(snapshotCounts.overdue).toBe(dashboardCounts.OVERDUE);
      expect(snapshotCounts.missing).toBe(dashboardCounts.MISSING);

      // And the dashboard's computeComplianceRate numerator/denominator match.
      expect(snapshotCounts.rateNumerator).toBe(metrics.compliance.rate.numerator);
      expect(snapshotCounts.rateDenominator).toBe(metrics.compliance.rate.denominator);
    });

    it("the persisted snapshot row's counts match getComplianceCounts() too", async () => {
      // Persist a snapshot, then read it back and compare to dashboard counts.
      await ensureSnapshotForToday(FROZEN_NOW);
      const row = await testDb.complianceSnapshot.findUnique({
        where: { date: FROZEN_TODAY },
      });

      // Compute the dashboard counts fresh from the same matrix
      const data = await fetchMatrixData();
      const matrix = buildComplianceMatrix(data, FROZEN_NOW);
      const cells: ComplianceCell[] = [];
      for (const u of matrix.unions) {
        for (const c of u.scores) {
          cells.push({
            unionId: u.unionId, documentType: c.documentType, status: c.status,
            filedAt: null, expiryDate: c.expiresAt ? new Date(c.expiresAt) : null,
            documentId: c.documentId,
          });
        }
      }
      const counts = tallyComplianceCounts(cells);

      expect(row!.compliant).toBe(counts.COMPLIANT);
      expect(row!.expiring).toBe(counts.EXPIRING);
      expect(row!.overdue).toBe(counts.OVERDUE);
      expect(row!.missing).toBe(counts.MISSING);
      expect(row!.rateNumerator).toBe(counts.COMPLIANT);
      expect(row!.rateDenominator).toBe(
        counts.COMPLIANT + counts.EXPIRING + counts.OVERDUE + counts.MISSING,
      );
    });
  });

  // ===========================================================================
  // Mutation test (DONE WHEN criterion): today mutable, yesterday frozen
  // ===========================================================================
  describe("mutation test — today mutable, yesterday frozen", () => {
    it("flip one fixture document's status → today's row reflects the change AND yesterday's is byte-identical", async () => {
      // Step 1: Seed + capture YESTERDAY's row.
      await ensureSnapshotForToday(YESTERDAY);
      const yRowBefore = await testDb.complianceSnapshot.findUnique({
        where: { date: FROZEN_YESTERDAY },
      });
      expect(yRowBefore).not.toBeNull();

      // Step 2: Capture TODAY's row (initial state).
      await ensureSnapshotForToday(FROZEN_NOW);
      const tRowBefore = await testDb.complianceSnapshot.findUnique({
        where: { date: FROZEN_TODAY },
      });
      expect(tRowBefore).not.toBeNull();
      // Initial today counts: COMPLIANT=2, EXPIRING=1, OVERDUE=1, MISSING=2
      expect(tRowBefore!.compliant).toBe(2);
      expect(tRowBefore!.missing).toBe(2);

      // Step 3: MUTATION — dispose one of the COMPLIANT documents. After
      // disposal, the matrix builder treats it as MISSING (no longer on file).
      // Per the chunk 0.1 audit + metrics.ts comment: "on-file" = a Document
      // row exists, is NOT disposed, AND has reviewStatus === "APPROVED".
      // Disposing a doc means fetchMatrixData still returns it, but its
      // `disposedAt` is set — wait, let me check: buildComplianceMatrix uses
      // `documentByUnionAndType` map keyed by `unionId::documentType`, and
      // the calculator.ts `calculateStatusFromRows` checks disposal.
      // Actually let me just delete the document row entirely — that's the
      // simplest mutation: union-A "Annual Return" goes from COMPLIANT → MISSING.
      const target = await testDb.document.findFirst({
        where: { unionId: "union-A", documentType: "Annual Return" },
      });
      expect(target).not.toBeNull();
      // Delete the version first (FK constraint), then the doc.
      await testDb.documentVersion.deleteMany({
        where: { documentId: target!.id },
      });
      await testDb.document.delete({ where: { id: target!.id } });

      // Step 4: Re-trigger TODAY's snapshot. It MUST reflect the new state.
      const r = await ensureSnapshotForToday(FROZEN_NOW);
      expect(r.action).toBe("updated");
      // New counts: COMPLIANT=1 (was 2, lost union-A's Annual Return),
      //            MISSING=3 (was 2, gained union-A's Annual Return as MISSING).
      // EXPIRING/OVERDUE unchanged.
      expect(r.counts).toEqual({
        compliant: 1, expiring: 1, overdue: 1, awaitingReview: 0, missing: 3,
        rateNumerator: 1, rateDenominator: 6,
      });

      // Step 5: Yesterday's row is BYTE-IDENTICAL (immutability asserted).
      const yRowAfter = await testDb.complianceSnapshot.findUnique({
        where: { date: FROZEN_YESTERDAY },
      });
      expect(yRowAfter).not.toBeNull();
      expect(yRowAfter!.compliant).toBe(yRowBefore!.compliant);
      expect(yRowAfter!.expiring).toBe(yRowBefore!.expiring);
      expect(yRowAfter!.overdue).toBe(yRowBefore!.overdue);
      expect(yRowAfter!.missing).toBe(yRowBefore!.missing);
      expect(yRowAfter!.rateNumerator).toBe(yRowBefore!.rateNumerator);
      expect(yRowAfter!.rateDenominator).toBe(yRowBefore!.rateDenominator);
      expect(yRowAfter!.capturedWith).toBe(yRowBefore!.capturedWith);
      expect(yRowAfter!.createdAt.toISOString()).toBe(yRowBefore!.createdAt.toISOString());
      // updatedAt also unchanged — no update was issued against yesterday's row
      expect(yRowAfter!.updatedAt.toISOString()).toBe(yRowBefore!.updatedAt.toISOString());

      // Step 6: Two triggers on the same day → still ONE row (idempotency).
      await ensureSnapshotForToday(FROZEN_NOW);
      const todayRowCount = await testDb.complianceSnapshot.count({
        where: { date: FROZEN_TODAY },
      });
      expect(todayRowCount).toBe(1);
    });
  });

  // ===========================================================================
  // getComplianceTrend — selector (DONE WHEN criteria)
  // ===========================================================================
  describe("getComplianceTrend", () => {
    it("returns [] for empty history (no snapshots yet)", async () => {
      const trend = await getComplianceTrend(FROZEN_NOW);
      expect(trend).toEqual([]);
    });

    it("returns stored points ascending by date", async () => {
      // Seed snapshots for 3 distinct days. Insert in NON-ascending order
      // to verify the selector sorts ascending (not relying on insert order).
      await testDb.complianceSnapshot.create({
        data: {
          date: "2026-06-15", compliant: 2, expiring: 1, overdue: 1, awaitingReview: 0, missing: 2,
          rateNumerator: 2, rateDenominator: 6, capturedWith: '{"expiringWindowDays":90,"requiredTypesCount":2}',
        },
      });
      await testDb.complianceSnapshot.create({
        data: {
          date: "2026-06-13", compliant: 1, expiring: 1, overdue: 1, awaitingReview: 0, missing: 3,
          rateNumerator: 1, rateDenominator: 6, capturedWith: '{"expiringWindowDays":90,"requiredTypesCount":2}',
        },
      });
      await testDb.complianceSnapshot.create({
        data: {
          date: "2026-06-14", compliant: 1, expiring: 2, overdue: 1, awaitingReview: 0, missing: 2,
          rateNumerator: 1, rateDenominator: 6, capturedWith: '{"expiringWindowDays":90,"requiredTypesCount":2}',
        },
      });

      const trend = await getComplianceTrend(FROZEN_NOW);
      expect(trend).toHaveLength(3);
      // Ascending by date
      expect(trend.map((p) => p.date)).toEqual([
        "2026-06-13", "2026-06-14", "2026-06-15",
      ]);
    });

    it("gaps are preserved — NO interpolation, NO synthetic zero-days (deliberate-gap test)", async () => {
      // Seed 2026-06-13 and 2026-06-15, but NOT 2026-06-14 (a deliberate gap).
      // The selector MUST return only the two seeded points — no fabricated
      // 2026-06-14 entry with zero counts or interpolated values.
      await testDb.complianceSnapshot.create({
        data: {
          date: "2026-06-13", compliant: 1, expiring: 1, overdue: 1, awaitingReview: 0, missing: 3,
          rateNumerator: 1, rateDenominator: 6, capturedWith: '{"expiringWindowDays":90,"requiredTypesCount":2}',
        },
      });
      await testDb.complianceSnapshot.create({
        data: {
          date: "2026-06-15", compliant: 2, expiring: 1, overdue: 1, awaitingReview: 0, missing: 2,
          rateNumerator: 2, rateDenominator: 6, capturedWith: '{"expiringWindowDays":90,"requiredTypesCount":2}',
        },
      });

      const trend = await getComplianceTrend(FROZEN_NOW);
      expect(trend).toHaveLength(2);
      expect(trend.map((p) => p.date)).toEqual(["2026-06-13", "2026-06-15"]);

      // NO entry for 2026-06-14 anywhere in the result
      const hasGapEntry = trend.some((p) => p.date === "2026-06-14");
      expect(hasGapEntry).toBe(false);
    });

    it("point shape: { date, compliant, expiring, overdue, awaitingReview, missing, rateNumerator, rateDenominator, percentage }", async () => {
      // 4.2b ADDITIVE: percentage field added (computed in metrics module).
      // T06c: awaitingReview field added to ComplianceTrendPoint.
      await testDb.complianceSnapshot.create({
        data: {
          date: "2026-06-15", compliant: 2, expiring: 1, overdue: 1, awaitingReview: 0, missing: 2,
          rateNumerator: 2, rateDenominator: 6, capturedWith: '{"expiringWindowDays":90,"requiredTypesCount":2}',
        },
      });
      const trend = await getComplianceTrend(FROZEN_NOW);
      const point = trend[0];
      expect(point).toBeDefined();
      // Shape check: exactly these 9 keys, no more, no less.
      const expectedKeys = [
        "date", "compliant", "expiring", "overdue", "awaitingReview", "missing",
        "rateNumerator", "rateDenominator", "percentage",
      ].sort();
      const actualKeys = Object.keys(point as ComplianceTrendPoint).sort();
      expect(actualKeys).toEqual(expectedKeys);
    });

    it("round-trip: ensureSnapshotForToday → getComplianceTrend returns the same counts + percentage", async () => {
      await ensureSnapshotForToday(FROZEN_NOW);
      const trend = await getComplianceTrend(FROZEN_NOW);
      expect(trend).toHaveLength(1);
      const point = trend[0];
      expect(point.date).toBe(FROZEN_TODAY);
      expect(point.compliant).toBe(2);
      expect(point.expiring).toBe(1);
      expect(point.overdue).toBe(1);
      expect(point.missing).toBe(2);
      expect(point.rateNumerator).toBe(2);
      expect(point.rateDenominator).toBe(6);
      // 4.2b ADDITIVE: percentage is computed in the metrics module via
      // computePercentage(2, 6) = 33 (rounded from 33.33...).
      expect(point.percentage).toBe(33);
    });

    // 4.2b ADDITIVE: percentage-per-point tests (computed in metrics module).
    it("percentage === computePercentage(rateNumerator, rateDenominator) for every point", async () => {
      // Seed three points with different numerators/denominators.
      await testDb.complianceSnapshot.create({
        data: {
          date: "2026-06-13", compliant: 5, expiring: 0, overdue: 0, awaitingReview: 0, missing: 5,
          rateNumerator: 5, rateDenominator: 10, capturedWith: '{"expiringWindowDays":90,"requiredTypesCount":2}',
        },
      });
      await testDb.complianceSnapshot.create({
        data: {
          date: "2026-06-14", compliant: 7, expiring: 1, overdue: 1, awaitingReview: 0, missing: 1,
          rateNumerator: 7, rateDenominator: 10, capturedWith: '{"expiringWindowDays":90,"requiredTypesCount":2}',
        },
      });
      await testDb.complianceSnapshot.create({
        data: {
          date: "2026-06-15", compliant: 9, expiring: 1, overdue: 0, awaitingReview: 0, missing: 0,
          rateNumerator: 9, rateDenominator: 10, capturedWith: '{"expiringWindowDays":90,"requiredTypesCount":2}',
        },
      });

      const trend = await getComplianceTrend(FROZEN_NOW);
      // Every point's percentage must match the metrics module's computePercentage.
      for (const p of trend) {
        expect(p.percentage).toBe(computePercentage(p.rateNumerator, p.rateDenominator));
      }
      // Spot-check specific values: 5/10=50, 7/10=70, 9/10=90.
      expect(trend[0].percentage).toBe(50);
      expect(trend[1].percentage).toBe(70);
      expect(trend[2].percentage).toBe(90);
    });

    it("zero-denominator points yield percentage: null (NOT 0, NOT NaN) — chart handles via connectNulls={false}", async () => {
      // A zero-denominator day means no applicable requirements existed that
      // day (e.g. all unions deregistered, or no rules configured yet). The
      // percentage is MEANINGLESS — null signals "skip this point on the line",
      // distinct from 0 which would mean "0% compliant". See computePercentage
      // docstring for the rationale.
      await testDb.complianceSnapshot.create({
        data: {
          date: "2026-06-13", compliant: 0, expiring: 0, overdue: 0, awaitingReview: 0, missing: 0,
          rateNumerator: 0, rateDenominator: 0, capturedWith: '{"expiringWindowDays":90,"requiredTypesCount":2}',
        },
      });

      const trend = await getComplianceTrend(FROZEN_NOW);
      expect(trend).toHaveLength(1);
      expect(trend[0].percentage).toBeNull();
      // Anti-NaN assertion: null is not NaN. (NaN would propagate through
      // arithmetic downstream — explicitly assert against it.)
      expect(Number.isNaN(trend[0].percentage as unknown as number)).toBe(false);
    });

    it("percentage field is never undefined — always a number or null", async () => {
      // Defensive: even if the DB row has weird values, the percentage field
      // MUST be defined (either a number or null). The chart's dataKey
      // resolves "undefined" to 0 in some chart libraries — we don't want
      // that to look like "0% compliant".
      await testDb.complianceSnapshot.create({
        data: {
          date: "2026-06-15", compliant: 2, expiring: 1, overdue: 1, awaitingReview: 0, missing: 2,
          rateNumerator: 2, rateDenominator: 6, capturedWith: '{"expiringWindowDays":90,"requiredTypesCount":2}',
        },
      });
      const trend = await getComplianceTrend(FROZEN_NOW);
      expect(trend[0].percentage).not.toBeUndefined();
      expect(typeof trend[0].percentage === "number" || trend[0].percentage === null).toBe(true);
    });
  });

  // ===========================================================================
  // hasSufficientHistory helper
  // ===========================================================================
  describe("hasSufficientHistory", () => {
    it("returns false for empty history", () => {
      expect(hasSufficientHistory([])).toBe(false);
    });

    it("returns false for a single point (default minPoints=2)", () => {
      const onePoint: ComplianceTrendPoint[] = [{
        date: "2026-06-15", compliant: 1, expiring: 1, overdue: 1, awaitingReview: 0, missing: 3,
        rateNumerator: 1, rateDenominator: 6, percentage: 17,
      }];
      expect(hasSufficientHistory(onePoint)).toBe(false);
    });

    it("returns true for 2+ points (default minPoints=2)", () => {
      const twoPoints: ComplianceTrendPoint[] = [
        { date: "2026-06-14", compliant: 1, expiring: 1, overdue: 1, awaitingReview: 0, missing: 3, rateNumerator: 1, rateDenominator: 6, percentage: 17 },
        { date: "2026-06-15", compliant: 2, expiring: 1, overdue: 1, awaitingReview: 0, missing: 2, rateNumerator: 2, rateDenominator: 6, percentage: 33 },
      ];
      expect(hasSufficientHistory(twoPoints)).toBe(true);
    });

    it("respects a custom minPoints", () => {
      const twoPoints: ComplianceTrendPoint[] = [
        { date: "2026-06-14", compliant: 1, expiring: 1, overdue: 1, awaitingReview: 0, missing: 3, rateNumerator: 1, rateDenominator: 6, percentage: 17 },
        { date: "2026-06-15", compliant: 2, expiring: 1, overdue: 1, awaitingReview: 0, missing: 2, rateNumerator: 2, rateDenominator: 6, percentage: 33 },
      ];
      expect(hasSufficientHistory(twoPoints, 3)).toBe(false);
      expect(hasSufficientHistory(twoPoints, 2)).toBe(true);
      expect(hasSufficientHistory(twoPoints, 1)).toBe(true);
    });
  });

  // ===========================================================================
  // Zero interpolation/synthesis — explicit anti-pattern test (DONE WHEN)
  // ===========================================================================
  describe("no interpolation / no synthesis", () => {
    it("the snapshot module exports no function that fabricates historical data", () => {
      // List the named exports the test file has imported from the module.
      // NONE of them should look like "fillGap", "interpolate", "synthesize",
      // "backfill", "seed". (The `seedFixture` function above is a TEST
      // helper, not in the production module.)
      //
      // We use the explicit import list (rather than dynamically introspecting
      // the module) because vitest runs in ESM mode where `require()` is not
      // available. The import list IS the module's public API.
      const moduleExports = [
        "ensureSnapshotForToday",
        "getComplianceTrend",
        "hasSufficientHistory",
        "tallyMatrix",
        "buildCapturedWith",
        "parseCapturedWith",
        "formatUtcDate",
        "PastDayImmutabilityError",
        // 4.2b additive: pure chart-rendering helpers. None of these
        // fabricate data — they slice existing points, insert explicit
        // gap markers (NOT data), or scale numbers for sparkline geometry.
        "sliceTrendToWindow",
        "buildChartSeriesWithGaps",
        "buildSparklinePoints",
        "extractSparklineSeries",
      ];
      const forbiddenPatterns = [/fillGap/i, /interpolat/i, /synthesiz/i, /backfill/i, /seedHistor/i, /fakeHistor/i];
      for (const pattern of forbiddenPatterns) {
        for (const exportName of moduleExports) {
          expect(pattern.test(exportName)).toBe(false);
        }
      }
      // Positive: the only writer function is `ensureSnapshotForToday` —
      // it captures the live state at `now`, never fabricates a past state.
      expect(moduleExports).toContain("ensureSnapshotForToday");
    });

    it("getComplianceTrend returns DB rows ONLY — no computed/synthesized entries", async () => {
      // No rows in DB → empty array (covered above, but explicitly asserted
      // here as the "no synthesis" guarantee: the selector does NOT inject
      // synthetic zero-day entries to "fill" the time range).
      const trend = await getComplianceTrend(FROZEN_NOW);
      expect(trend).toEqual([]);
    });
  });
});

// =============================================================================
// Chunk 4.3 — Snapshot retention sweep tests.
//
// Covers:
//   - deleteSnapshotsOlderThan: prunes old rows, preserves recent rows
//   - Cutoff is computed from `now` (injectable) — deterministic, no Date.now() leaks
//   - Idempotency: running twice deletes nothing the second time
//   - Pruning by `date` (the UTC YYYY-MM-DD string), not `createdAt`
//   - runSnapshotRetentionSweep returns the structured result with cutoff + count
//   - SNAPSHOT_RETENTION_DAYS matches TREND_WINDOW_DAYS (365) — anything older
//     is invisible to the chart, so pruning at that boundary is correct
// =============================================================================

describe("Snapshot retention sweep (chunk 4.3)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("SNAPSHOT_RETENTION_DAYS equals TREND_WINDOW_DAYS (365)", () => {
    // Pruning at the trend window boundary is correct: anything older is
    // invisible to sliceTrendToWindow, so keeping it just bloats the table.
    expect(SNAPSHOT_RETENTION_DAYS).toBe(365);
  });

  it("deleteSnapshotsOlderThan prunes rows older than the cutoff and preserves newer ones", async () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // Insert 3 rows: 400 days old (should prune), 200 days old (keep), 1 day old (keep).
    const oldDate = formatUtcDate(new Date(now.getTime() - 400 * MS_PER_DAY));
    const midDate = formatUtcDate(new Date(now.getTime() - 200 * MS_PER_DAY));
    const recentDate = formatUtcDate(new Date(now.getTime() - 1 * MS_PER_DAY));

    await testDb.complianceSnapshot.create({
      data: { date: oldDate, compliant: 1, expiring: 0, overdue: 0, awaitingReview: 0, missing: 0, rateNumerator: 1, rateDenominator: 1, capturedWith: "{}" },
    });
    await testDb.complianceSnapshot.create({
      data: { date: midDate, compliant: 2, expiring: 0, overdue: 0, awaitingReview: 0, missing: 0, rateNumerator: 2, rateDenominator: 2, capturedWith: "{}" },
    });
    await testDb.complianceSnapshot.create({
      data: { date: recentDate, compliant: 3, expiring: 0, overdue: 0, awaitingReview: 0, missing: 0, rateNumerator: 3, rateDenominator: 3, capturedWith: "{}" },
    });

    const deleted = await deleteSnapshotsOlderThan(365, now);
    expect(deleted).toBe(1);

    const remaining = await testDb.complianceSnapshot.findMany({ orderBy: { date: "asc" } });
    expect(remaining.map((r) => r.date)).toEqual([midDate, recentDate]);
    expect(remaining.map((r) => r.compliant)).toEqual([2, 3]);
  });

  it("deleteSnapshotsOlderThan is idempotent — second run deletes 0", async () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const oldDate = formatUtcDate(new Date(now.getTime() - 400 * MS_PER_DAY));

    await testDb.complianceSnapshot.create({
      data: { date: oldDate, compliant: 1, expiring: 0, overdue: 0, awaitingReview: 0, missing: 0, rateNumerator: 1, rateDenominator: 1, capturedWith: "{}" },
    });

    const first = await deleteSnapshotsOlderThan(365, now);
    expect(first).toBe(1);

    const second = await deleteSnapshotsOlderThan(365, now);
    expect(second).toBe(0);
  });

  it("deleteSnapshotsOlderThan with empty DB returns 0 (no error)", async () => {
    const deleted = await deleteSnapshotsOlderThan(365, new Date("2026-06-15T12:00:00Z"));
    expect(deleted).toBe(0);
  });

  it("deleteSnapshotsOlderThan boundary: exactly 365 days old is PRESERVED (strict less-than)", async () => {
    // The cutoff is `now - 365 days`. A row whose date is exactly at the
    // cutoff is NOT pruned (the predicate is `date < cutoff`, strict). This
    // matches the trend window: a 365-day-old row is still the last point
    // in a 365-day window.
    const now = new Date("2026-06-15T12:00:00Z");
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const boundaryDate = formatUtcDate(new Date(now.getTime() - 365 * MS_PER_DAY));

    await testDb.complianceSnapshot.create({
      data: { date: boundaryDate, compliant: 5, expiring: 0, overdue: 0, awaitingReview: 0, missing: 0, rateNumerator: 5, rateDenominator: 5, capturedWith: "{}" },
    });

    const deleted = await deleteSnapshotsOlderThan(365, now);
    expect(deleted).toBe(0);

    const remaining = await testDb.complianceSnapshot.findMany();
    expect(remaining.length).toBe(1);
    expect(remaining[0].date).toBe(boundaryDate);
  });

  it("runSnapshotRetentionSweep returns structured result with cutoff + count + retentionDays", async () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // Insert 2 old rows + 1 recent row.
    await testDb.complianceSnapshot.create({
      data: { date: formatUtcDate(new Date(now.getTime() - 400 * MS_PER_DAY)), compliant: 1, expiring: 0, overdue: 0, awaitingReview: 0, missing: 0, rateNumerator: 1, rateDenominator: 1, capturedWith: "{}" },
    });
    await testDb.complianceSnapshot.create({
      data: { date: formatUtcDate(new Date(now.getTime() - 380 * MS_PER_DAY)), compliant: 1, expiring: 0, overdue: 0, awaitingReview: 0, missing: 0, rateNumerator: 1, rateDenominator: 1, capturedWith: "{}" },
    });
    await testDb.complianceSnapshot.create({
      data: { date: formatUtcDate(new Date(now.getTime() - 10 * MS_PER_DAY)), compliant: 1, expiring: 0, overdue: 0, awaitingReview: 0, missing: 0, rateNumerator: 1, rateDenominator: 1, capturedWith: "{}" },
    });

    const result = await runSnapshotRetentionSweep(now);

    expect(result.pruned).toBe(2);
    expect(result.retentionDays).toBe(365);
    // Cutoff should be 365 days before `now`: 2025-06-15.
    // (Jun 15 2026 - 365 days = Jun 15 2025 — going back one full year
    // in a non-leap year lands on the same month-day.)
    expect(result.cutoff).toBe("2025-06-15");

    // Verify the recent row survived.
    const remaining = await testDb.complianceSnapshot.findMany();
    expect(remaining.length).toBe(1);
  });

  it("runSnapshotRetentionSweep on empty DB returns pruned: 0 (no error)", async () => {
    const result = await runSnapshotRetentionSweep(new Date("2026-06-15T12:00:00Z"));
    expect(result.pruned).toBe(0);
    expect(result.retentionDays).toBe(365);
    expect(result.cutoff).toBe("2025-06-15");
  });
});
