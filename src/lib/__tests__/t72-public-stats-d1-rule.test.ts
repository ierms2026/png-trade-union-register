import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./setup";
import { computePublicStats } from "@/lib/compliance/public-stats";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { tallyStatuses, computeRateFromCounts } from "@/lib/dashboard/metrics";

// =============================================================================
// T72: Public stats route follows the D1 rule.
//
// Before T72, the route had its own switch + arithmetic that left
// AWAITING_REVIEW out of the denominator, so the public rate was overstated
// whenever any document was awaiting review.
//
// This test seeds one union with documents covering all 6 statuses (following
// the report-html-awaiting-review.test.ts pattern), calls the REAL
// computePublicStats() (the same function the route uses), and asserts:
//   1. The rate follows the D1 rule: 1 COMPLIANT / 5 applicable = 20%
//   2. The public rate equals the staff dashboard stats rate (consistency)
// =============================================================================

describe("T72: public stats follows D1 rule", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rate includes AWAITING_REVIEW in the denominator (1/5 = 20%)", async () => {
    const now = new Date();
    const union = await testDb.union.create({
      data: { unionName: "T72 Union", registrationNo: "T72-001", status: "ACTIVE" },
    });

    // 6 rules: 5 required (1-year renewal), 1 not required
    for (const docType of ["Compliant", "Expiring", "Overdue", "Awaiting", "Missing"]) {
      await testDb.complianceRule.create({
        data: { documentType: docType, required: true, renewalYears: 1 },
      });
    }
    await testDb.complianceRule.create({
      data: { documentType: "NotApplicable", required: false, renewalYears: 1 },
    });

    // Seed documents to produce all 6 statuses:
    //   Compliant  — APPROVED, uploaded 30d ago  → COMPLIANT
    //   Expiring   — APPROVED, uploaded 335d ago → EXPIRING
    //   Overdue    — APPROVED, uploaded 400d ago → OVERDUE
    //   Awaiting   — PENDING, uploaded 10d ago   → AWAITING_REVIEW
    //   Missing    — no document                 → MISSING
    //   NotApplicable — rule.required=false      → NOT_APPLICABLE
    const docs = [
      { type: "Compliant", daysAgo: 30, approved: true },
      { type: "Expiring", daysAgo: 335, approved: true },
      { type: "Overdue", daysAgo: 400, approved: true },
      { type: "Awaiting", daysAgo: 10, approved: false },
    ];

    for (const doc of docs) {
      const uploadedAt = new Date(now.getTime() - doc.daysAgo * 24 * 60 * 60 * 1000);
      const created = await testDb.document.create({
        data: {
          unionId: union.id,
          documentType: doc.type,
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
          checksum: "abc123",
          uploadedAt,
        },
      });
      await testDb.document.update({
        where: { id: created.id },
        data: { currentVersionId: version.id },
      });
    }

    // Call the REAL public stats computation
    const stats = await computePublicStats();

    // D1 rule: numerator = COMPLIANT = 1
    //          denominator = COMPLIANT + EXPIRING + OVERDUE + AWAITING_REVIEW + MISSING
    //                       = 1 + 1 + 1 + 1 + 1 = 5
    //          rate = 1/5 = 20%
    expect(stats.overallComplianceRate).toBe(20);

    // Before T72, the old code would have returned 25% (1/4 — AWAITING_REVIEW
    // was dropped from the denominator). This test catches that regression.
  });

  it("public rate equals the staff dashboard stats rate for the same data", async () => {
    const now = new Date();
    const union = await testDb.union.create({
      data: { unionName: "T72 Consistency Union", registrationNo: "T72-C", status: "ACTIVE" },
    });

    for (const docType of ["Compliant", "Expiring", "Overdue", "Awaiting", "Missing"]) {
      await testDb.complianceRule.create({
        data: { documentType: docType, required: true, renewalYears: 1 },
      });
    }
    await testDb.complianceRule.create({
      data: { documentType: "NotApplicable", required: false, renewalYears: 1 },
    });

    const docs = [
      { type: "Compliant", daysAgo: 30, approved: true },
      { type: "Expiring", daysAgo: 335, approved: true },
      { type: "Overdue", daysAgo: 400, approved: true },
      { type: "Awaiting", daysAgo: 10, approved: false },
    ];

    for (const doc of docs) {
      const uploadedAt = new Date(now.getTime() - doc.daysAgo * 24 * 60 * 60 * 1000);
      const created = await testDb.document.create({
        data: {
          unionId: union.id,
          documentType: doc.type,
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
          checksum: "abc123",
          uploadedAt,
        },
      });
      await testDb.document.update({
        where: { id: created.id },
        data: { currentVersionId: version.id },
      });
    }

    // Public rate (from computePublicStats)
    const publicStats = await computePublicStats();

    // Staff dashboard rate (same computation as /api/dashboard/stats — no
    // Officer scoping since we're testing as Registrar/unscoped)
    const data = await fetchMatrixData();
    const matrix = buildComplianceMatrix(data);
    const allCells = matrix.unions.flatMap((row) => row.scores);
    const counts = tallyStatuses(allCells);
    const staffRate = computeRateFromCounts(counts);

    expect(publicStats.overallComplianceRate).toBe(staffRate.percentage);
  });
});
