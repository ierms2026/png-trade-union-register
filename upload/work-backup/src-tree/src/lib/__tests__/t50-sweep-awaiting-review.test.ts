import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./setup";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { collectSweepIssues } from "@/lib/compliance/sweep-issues";

// =============================================================================
// T50: The compliance sweep must NOT send renewal notices or create tasks
// for AWAITING_REVIEW documents.
//
// Before T50, matrix.ts computed an expiry date for AWAITING_REVIEW cells
// (from the upload date), and the sweep loop skipped cells only when
// `expiresAt` was null. So a PENDING document uploaded ~340 days ago on a
// 1-year renewal rule would land in the T_30_DAYS tier and trigger an
// "URGENT renewal" notification + potentially a Non-Compliance task —
// even though the Registrar hasn't approved it yet.
//
// This test seeds exactly that scenario and asserts that
// collectSweepIssues() (the real function the cron route uses) returns
// NO issues for the AWAITING_REVIEW cell. It also seeds an OVERDUE cell
// to prove the function still fires on real expiry.
// =============================================================================

describe("T50: sweep does not notify on AWAITING_REVIEW documents", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("an Awaiting Review document uploaded 340d ago on a 1y rule produces NO sweep issue", async () => {
    const now = new Date();
    const union = await testDb.union.create({
      data: { unionName: "T50 Sweep Union", registrationNo: "T50-SW", status: "ACTIVE" },
    });

    // Two required rules, 1-year renewal each
    for (const docType of ["Awaiting Doc", "Overdue Doc"]) {
      await testDb.complianceRule.create({
        data: { documentType: docType, required: true, renewalYears: 1 },
      });
    }

    // Awaiting Doc: PENDING, uploaded 340d ago → AWAITING_REVIEW
    //   (would expire in ~25d if the date were computed, landing in T_30_DAYS)
    // Overdue Doc: APPROVED, uploaded 400d ago → OVERDUE (should fire T_0_OVERDUE)
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

    // Run the REAL sweep issue-collection logic (the same function the cron
    // route handler calls).
    const data = await fetchMatrixData();
    const matrix = buildComplianceMatrix(data);
    const renewalByType = new Map(data.rules.map((r) => [r.documentType, r.renewalYears]));
    const issues = collectSweepIssues(matrix, renewalByType, now);

    // The Awaiting Review document must NOT appear in any issue tier.
    const awaitingIssues = issues.filter((i) => i.documentType === "Awaiting Doc");
    expect(awaitingIssues).toEqual([]);

    // The Overdue document SHOULD fire (proves the function isn't just
    // returning an empty array for everything).
    const overdueIssues = issues.filter((i) => i.documentType === "Overdue Doc");
    expect(overdueIssues.length).toBeGreaterThanOrEqual(1);
    // Overdue (400d ago on a 1y rule → ~35d past expiry) → T_30_OVERDUE tier
    expect(overdueIssues[0].tier).toBe("T_30_OVERDUE");
  });
});
