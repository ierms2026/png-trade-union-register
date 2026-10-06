import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./setup";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { collectDigestIssues } from "@/lib/compliance/digest-issues";

// =============================================================================
// T60: Digest issue collection — Awaiting Review documents must not appear.
//
// The digest route's loop was extracted into collectDigestIssues() (the real
// function the cron route uses). This test seeds:
//   - An Awaiting Review document uploaded 340d ago on a 1y rule (would land
//     in expiring30 if the date were computed)
//   - An Overdue document (approved, uploaded 400d ago — should land in overdue)
//
// Asserts the Awaiting Review doc appears in NONE of the three buckets, and
// the Overdue doc DOES appear in the overdue bucket.
// =============================================================================

describe("T60: collectDigestIssues excludes Awaiting Review", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("an Awaiting Review document uploaded 340d ago appears in no bucket; an Overdue doc does", async () => {
    const now = new Date();
    const union = await testDb.union.create({
      data: { unionName: "T60 Digest Union", registrationNo: "T60-DG", status: "ACTIVE" },
    });

    // Two required rules, 1-year renewal each
    for (const docType of ["Awaiting Doc", "Overdue Doc"]) {
      await testDb.complianceRule.create({
        data: { documentType: docType, required: true, renewalYears: 1 },
      });
    }

    // Awaiting Doc: PENDING, uploaded 340d ago → AWAITING_REVIEW
    //   (would expire in ~25d if the date were computed, landing in expiring30)
    // Overdue Doc: APPROVED, uploaded 400d ago → OVERDUE (should land in overdue)
    const docs = [
      { type: "Awaiting Doc", daysAgo: 340, approved: false },
      { type: "Overdue Doc", daysAgo: 400, approved: true },
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

    // Run the REAL digest issue-collection logic
    const data = await fetchMatrixData();
    const matrix = buildComplianceMatrix(data);
    const renewalByType = new Map(data.rules.map((r) => [r.documentType, r.renewalYears]));
    const { overdue, expiring30, expiring90 } = collectDigestIssues(matrix, renewalByType, now);

    // The Awaiting Review document must NOT appear in any bucket
    const allItems = [...overdue, ...expiring30, ...expiring90];
    const awaitingItems = allItems.filter((i) => i.documentType === "Awaiting Doc");
    expect(awaitingItems).toEqual([]);

    // The Overdue document SHOULD appear in the overdue bucket
    const overdueOverdueDocs = overdue.filter((i) => i.documentType === "Overdue Doc");
    expect(overdueOverdueDocs.length).toBe(1);
    // And NOT in the expiring buckets
    expect(expiring30.filter((i) => i.documentType === "Overdue Doc")).toEqual([]);
    expect(expiring90.filter((i) => i.documentType === "Overdue Doc")).toEqual([]);
  });
});
