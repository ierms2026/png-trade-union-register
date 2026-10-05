import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./setup";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";

// =============================================================================
// T50: AWAITING_REVIEW cells must have expiresAt === null.
//
// The matrix builder's comment (matrix.ts ~L158-161) says AWAITING_REVIEW
// cells get expiresAt: null, but the code only excludes NOT_APPLICABLE and
// MISSING. This test seeds a document that will compute to AWAITING_REVIEW
// (PENDING reviewStatus) and asserts the cell's expiresAt is null.
//
// It also seeds COMPLIANT, EXPIRING and OVERDUE cells and asserts those
// DO keep their expiry dates (so the fix doesn't over-exclude).
// =============================================================================

describe("T50: AWAITING_REVIEW cells have expiresAt === null", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("AWAITING_REVIEW cell has expiresAt === null; COMPLIANT/EXPIRING/OVERDUE keep dates", async () => {
    const now = new Date();
    const union = await testDb.union.create({
      data: { unionName: "T50 Union", registrationNo: "T50-001", status: "ACTIVE" },
    });

    // 4 required rules, each 1-year renewal
    for (const docType of ["Compliant Type", "Expiring Type", "Overdue Type", "Awaiting Type"]) {
      await testDb.complianceRule.create({
        data: { documentType: docType, required: true, renewalYears: 1 },
      });
    }

    // Seed documents:
    //   Compliant Type: APPROVED, uploaded 30d ago → COMPLIANT, expires ~335d from now
    //   Expiring Type:  APPROVED, uploaded 335d ago → EXPIRING (within 90d of expiry)
    //   Overdue Type:   APPROVED, uploaded 400d ago → OVERDUE (past expiry)
    //   Awaiting Type:  PENDING,  uploaded 340d ago → AWAITING_REVIEW (would have
    //                   expired in ~25d if the date were computed, but it must be null)
    const docs = [
      { type: "Compliant Type", daysAgo: 30, approved: true },
      { type: "Expiring Type", daysAgo: 335, approved: true },
      { type: "Overdue Type", daysAgo: 400, approved: true },
      { type: "Awaiting Type", daysAgo: 340, approved: false },
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

    const data = await fetchMatrixData();
    const matrix = buildComplianceMatrix(data);

    // Find the 4 cells by documentType
    const row = matrix.unions[0];
    const cellByType = new Map(row.scores.map((c) => [c.documentType, c]));

    const compliant = cellByType.get("Compliant Type")!;
    const expiring = cellByType.get("Expiring Type")!;
    const overdue = cellByType.get("Overdue Type")!;
    const awaiting = cellByType.get("Awaiting Type")!;

    // Sanity: the statuses are what we expect
    expect(compliant.status).toBe("COMPLIANT");
    expect(expiring.status).toBe("EXPIRING");
    expect(overdue.status).toBe("OVERDUE");
    expect(awaiting.status).toBe("AWAITING_REVIEW");

    // The fix: AWAITING_REVIEW must have null expiresAt
    expect(awaiting.expiresAt).toBeNull();

    // The fix must NOT break the active statuses — they keep their dates
    expect(compliant.expiresAt).not.toBeNull();
    expect(expiring.expiresAt).not.toBeNull();
    expect(overdue.expiresAt).not.toBeNull();
  });
});
