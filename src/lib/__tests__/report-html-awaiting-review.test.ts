import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./setup";
import { buildComplianceReportHtml } from "../compliance/report-html";
import { COMPLIANCE_STATUSES } from "../dashboard/status-config";

// =============================================================================
// T06b: report-html.ts — AWAITING_REVIEW support test.
//
// Seeds the test DB with documents covering all 6 ComplianceStatus values,
// then calls buildComplianceReportHtml and asserts:
//   - stats.awaitingReview is present and counted
//   - stats includes all 6 statuses
//   - the 6 counts sum to totalCells
//   - overallRate follows the rule: COMPLIANT / (COMPLIANT + EXPIRING + OVERDUE
//     + AWAITING_REVIEW + MISSING), NOT_APPLICABLE excluded
// =============================================================================

describe("T06b: report-html AWAITING_REVIEW support", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("report stats include AWAITING_REVIEW count and correct rate when all 6 statuses are present", async () => {
    // Seed: 1 union, 6 compliance rules (one per status we want to produce).
    // We need to create documents with specific reviewStatus + uploadedAt
    // combinations that the calculator will map to each ComplianceStatus.
    //
    // The calculator (calculateStatus) works like this:
    //   1. !rule.required → NOT_APPLICABLE
    //   2. !document || disposedAt → MISSING
    //   3. reviewStatus !== APPROVED → AWAITING_REVIEW
    //   4. expiryDate < now → OVERDUE
    //   5. expiryDate ≤ now + 90d → EXPIRING
    //   6. else → COMPLIANT
    //
    // To produce all 6 statuses with 1 union + 6 rules:
    //   - Rule "Type A" required=true, renewalYears=1 → doc APPROVED, uploaded 30d ago → COMPLIANT
    //   - Rule "Type B" required=true, renewalYears=1 → doc APPROVED, uploaded 335d ago → EXPIRING
    //   - Rule "Type C" required=true, renewalYears=1 → doc APPROVED, uploaded 400d ago → OVERDUE
    //   - Rule "Type D" required=true, renewalYears=1 → doc PENDING → AWAITING_REVIEW
    //   - Rule "Type E" required=true, renewalYears=1 → no doc → MISSING
    //   - Rule "Type F" required=false → NOT_APPLICABLE (no doc needed)

    const now = new Date();
    const union = await testDb.union.create({
      data: { unionName: "Test Union", registrationNo: "TU-001", status: "ACTIVE" },
    });

    // Create rules
    for (const docType of ["Type A", "Type B", "Type C", "Type D", "Type E"]) {
      await testDb.complianceRule.create({
        data: { documentType: docType, required: true, renewalYears: 1 },
      });
    }
    await testDb.complianceRule.create({
      data: { documentType: "Type F", required: false, renewalYears: 1 },
    });

    // Create documents with specific uploadedAt + reviewStatus
    const docs = [
      { type: "Type A", daysAgo: 30, approved: true },   // COMPLIANT
      { type: "Type B", daysAgo: 335, approved: true },  // EXPIRING (within 90d of expiry)
      { type: "Type C", daysAgo: 400, approved: true },  // OVERDUE (past expiry)
      { type: "Type D", daysAgo: 10, approved: false },  // AWAITING_REVIEW (PENDING)
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
      // Set currentVersionId so the matrix builder can find the latest version
      await testDb.document.update({
        where: { id: created.id },
        data: { currentVersionId: version.id },
      });
    }
    // Type E: no document → MISSING
    // Type F: required=false → NOT_APPLICABLE

    // Build the report
    const result = await buildComplianceReportHtml({});

    // Assert all 6 statuses are present in stats
    expect(result.stats).toHaveProperty("awaitingReview");
    expect(result.stats.compliant).toBe(1);
    expect(result.stats.expiring).toBe(1);
    expect(result.stats.overdue).toBe(1);
    expect(result.stats.awaitingReview).toBe(1);
    expect(result.stats.missing).toBe(1);
    expect(result.stats.notApplicable).toBe(1);

    // The 6 counts sum to the total number of matrix cells (6 rules × 1 union = 6)
    const allCount =
      result.stats.compliant +
      result.stats.expiring +
      result.stats.overdue +
      result.stats.awaitingReview +
      result.stats.missing +
      result.stats.notApplicable;
    expect(allCount).toBe(6);

    // totalCells is the applicable count (excludes NOT_APPLICABLE per the rule)
    expect(result.stats.totalCells).toBe(5);

    // Rate: COMPLIANT / (COMPLIANT + EXPIRING + OVERDUE + AWAITING_REVIEW + MISSING)
    // = 1 / (1 + 1 + 1 + 1 + 1) = 1/5 = 20%
    expect(result.stats.overallRate).toBe(20);
  });

  it("report HTML contains Awaiting Review in the legend when AWAITING_REVIEW cells exist", async () => {
    // Minimal seed: 1 union, 1 rule, 1 PENDING doc → AWAITING_REVIEW
    const now = new Date();
    const union = await testDb.union.create({
      data: { unionName: "Test Union 2", registrationNo: "TU-002", status: "ACTIVE" },
    });
    await testDb.complianceRule.create({
      data: { documentType: "Pending Doc", required: true, renewalYears: 1 },
    });
    const doc = await testDb.document.create({
      data: { unionId: union.id, documentType: "Pending Doc", reviewStatus: "PENDING" },
    });
    const version = await testDb.documentVersion.create({
      data: {
        documentId: doc.id,
        versionNumber: 1,
        fileName: "test.pdf",
        filePath: "/tmp/test.pdf",
        fileSize: 100,
        checksum: "abc123",
        uploadedAt: now,
      },
    });
    await testDb.document.update({
      where: { id: doc.id },
      data: { currentVersionId: version.id },
    });

    const result = await buildComplianceReportHtml({});
    expect(result.stats.awaitingReview).toBe(1);
    // The HTML should contain "Awaiting Review" somewhere (legend or tooltip)
    expect(result.html).toContain("Awaiting Review");
  });

  it("iterating COMPLIANCE_STATUSES covers exactly 6 statuses (tripwire for future additions)", () => {
    expect(COMPLIANCE_STATUSES).toHaveLength(6);
  });
});
