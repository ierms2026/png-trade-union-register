import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "./setup";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { collectSweepIssues } from "@/lib/compliance/sweep-issues";
import { collectDigestIssues } from "@/lib/compliance/digest-issues";

// =============================================================================
// T71: The renewal period starts at approval (D15, simple variant).
//
// Before T71, expiry was computed from latestVersion.uploadedAt (the upload
// date). After T71, expiry is computed from Document.reviewedAt (the approval
// date) for APPROVED documents, falling back to uploadedAt if reviewedAt is
// null. PENDING and REJECTED documents still get no expiry date.
//
// The seed has 0 APPROVED documents, so all tests use constructed data
// (following the t50-* pattern). Dates are relative to `now` so the tests
// don't go stale.
// =============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

describe("T71: renewal period starts at approval date", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("approved with reviewedAt 30d ago, uploadedAt 100d ago, 1y rule → expiry ~335d from now (COMPLIANT)", async () => {
    const now = new Date();
    const union = await testDb.union.create({
      data: { unionName: "T71 Union A", registrationNo: "T71-A", status: "ACTIVE" },
    });
    await testDb.complianceRule.create({
      data: { documentType: "Constitution", required: true, renewalYears: 1 },
    });

    // Uploaded 100d ago, but approved only 30d ago.
    // Before T71: expiry = uploadedAt + 1y = 265d from now → COMPLIANT
    // After T71:  expiry = reviewedAt + 1y = 335d from now → COMPLIANT
    // Both are COMPLIANT, but the expiry DATE differs. This test verifies
    // the date is based on reviewedAt, not uploadedAt.
    const uploadedAt = new Date(now.getTime() - 100 * DAY_MS);
    const reviewedAt = new Date(now.getTime() - 30 * DAY_MS);
    const doc = await testDb.document.create({
      data: {
        unionId: union.id,
        documentType: "Constitution",
        reviewStatus: "APPROVED",
        reviewedAt,
      },
    });
    const version = await testDb.documentVersion.create({
      data: {
        documentId: doc.id,
        versionNumber: 1,
        fileName: "test.pdf",
        filePath: "/tmp/test.pdf",
        fileSize: 100,
        checksum: "abc123",
        uploadedAt,
      },
    });
    await testDb.document.update({
      where: { id: doc.id },
      data: { currentVersionId: version.id },
    });

    const data = await fetchMatrixData();
    const matrix = buildComplianceMatrix(data);
    const cell = matrix.unions[0].scores[0];

    expect(cell.status).toBe("COMPLIANT");
    // Expiry should be reviewedAt + 1 year (not uploadedAt + 1 year)
    const expectedExpiry = new Date(reviewedAt.getTime());
    expectedExpiry.setFullYear(expectedExpiry.getFullYear() + 1);
    expect(new Date(cell.expiresAt!).getTime()).toBe(expectedExpiry.getTime());
  });

  it("approved with reviewedAt equal to uploadedAt → same as before", async () => {
    const now = new Date();
    const union = await testDb.union.create({
      data: { unionName: "T71 Union B", registrationNo: "T71-B", status: "ACTIVE" },
    });
    await testDb.complianceRule.create({
      data: { documentType: "Constitution", required: true, renewalYears: 1 },
    });

    // Both dates the same (30d ago) → expiry = 335d from now → COMPLIANT
    const sameDate = new Date(now.getTime() - 30 * DAY_MS);
    const doc = await testDb.document.create({
      data: {
        unionId: union.id,
        documentType: "Constitution",
        reviewStatus: "APPROVED",
        reviewedAt: sameDate,
      },
    });
    const version = await testDb.documentVersion.create({
      data: {
        documentId: doc.id,
        versionNumber: 1,
        fileName: "test.pdf",
        filePath: "/tmp/test.pdf",
        fileSize: 100,
        checksum: "abc123",
        uploadedAt: sameDate,
      },
    });
    await testDb.document.update({
      where: { id: doc.id },
      data: { currentVersionId: version.id },
    });

    const data = await fetchMatrixData();
    const matrix = buildComplianceMatrix(data);
    const cell = matrix.unions[0].scores[0];

    expect(cell.status).toBe("COMPLIANT");
    const expectedExpiry = new Date(sameDate.getTime());
    expectedExpiry.setFullYear(expectedExpiry.getFullYear() + 1);
    expect(new Date(cell.expiresAt!).getTime()).toBe(expectedExpiry.getTime());
  });

  it("approved with reviewedAt null → falls back to uploadedAt", async () => {
    const now = new Date();
    const union = await testDb.union.create({
      data: { unionName: "T71 Union C", registrationNo: "T71-C", status: "ACTIVE" },
    });
    await testDb.complianceRule.create({
      data: { documentType: "Constitution", required: true, renewalYears: 1 },
    });

    // Uploaded 30d ago, reviewedAt null → fallback to uploadedAt
    const uploadedAt = new Date(now.getTime() - 30 * DAY_MS);
    const doc = await testDb.document.create({
      data: {
        unionId: union.id,
        documentType: "Constitution",
        reviewStatus: "APPROVED",
        reviewedAt: null,
      },
    });
    const version = await testDb.documentVersion.create({
      data: {
        documentId: doc.id,
        versionNumber: 1,
        fileName: "test.pdf",
        filePath: "/tmp/test.pdf",
        fileSize: 100,
        checksum: "abc123",
        uploadedAt,
      },
    });
    await testDb.document.update({
      where: { id: doc.id },
      data: { currentVersionId: version.id },
    });

    const data = await fetchMatrixData();
    const matrix = buildComplianceMatrix(data);
    const cell = matrix.unions[0].scores[0];

    expect(cell.status).toBe("COMPLIANT");
    // Expiry should be uploadedAt + 1 year (fallback)
    const expectedExpiry = new Date(uploadedAt.getTime());
    expectedExpiry.setFullYear(expectedExpiry.getFullYear() + 1);
    expect(new Date(cell.expiresAt!).getTime()).toBe(expectedExpiry.getTime());
  });

  it("pending and rejected → no expiry date (unchanged)", async () => {
    const now = new Date();
    const union = await testDb.union.create({
      data: { unionName: "T71 Union D", registrationNo: "T71-D", status: "ACTIVE" },
    });
    for (const docType of ["Pending", "Rejected"]) {
      await testDb.complianceRule.create({
        data: { documentType: docType, required: true, renewalYears: 1 },
      });
    }

    const uploadedAt = new Date(now.getTime() - 30 * DAY_MS);
    for (const [docType, status] of [["Pending", "PENDING"], ["Rejected", "REJECTED"]] as const) {
      const doc = await testDb.document.create({
        data: {
          unionId: union.id,
          documentType: docType,
          reviewStatus: status,
        },
      });
      const version = await testDb.documentVersion.create({
        data: {
          documentId: doc.id,
          versionNumber: 1,
          fileName: "test.pdf",
          filePath: "/tmp/test.pdf",
          fileSize: 100,
          checksum: "abc123",
          uploadedAt,
        },
      });
      await testDb.document.update({
        where: { id: doc.id },
        data: { currentVersionId: version.id },
      });
    }

    const data = await fetchMatrixData();
    const matrix = buildComplianceMatrix(data);
    const cellByType = new Map(matrix.unions[0].scores.map((c) => [c.documentType, c]));

    expect(cellByType.get("Pending")!.status).toBe("AWAITING_REVIEW");
    expect(cellByType.get("Pending")!.expiresAt).toBeNull();
    expect(cellByType.get("Rejected")!.status).toBe("AWAITING_REVIEW");
    expect(cellByType.get("Rejected")!.expiresAt).toBeNull();
  });

  it("EXPIRING and OVERDUE boundaries use the new expiry date (from reviewedAt)", async () => {
    const now = new Date();
    const union = await testDb.union.create({
      data: { unionName: "T71 Union E", registrationNo: "T71-E", status: "ACTIVE" },
    });
    for (const docType of ["Expiring", "Overdue"]) {
      await testDb.complianceRule.create({
        data: { documentType: docType, required: true, renewalYears: 1 },
      });
    }

    // Expiring: reviewedAt 340d ago → expiry in ~25d (within 90d window) → EXPIRING
    // Overdue: reviewedAt 400d ago → expiry ~35d ago (past) → OVERDUE
    // Both uploaded 100d earlier than reviewedAt to prove the date comes from
    // reviewedAt, not uploadedAt.
    const docs = [
      { type: "Expiring", reviewedDaysAgo: 340, uploadedDaysAgo: 440 },
      { type: "Overdue", reviewedDaysAgo: 400, uploadedDaysAgo: 500 },
    ];

    for (const d of docs) {
      const reviewedAt = new Date(now.getTime() - d.reviewedDaysAgo * DAY_MS);
      const uploadedAt = new Date(now.getTime() - d.uploadedDaysAgo * DAY_MS);
      const doc = await testDb.document.create({
        data: {
          unionId: union.id,
          documentType: d.type,
          reviewStatus: "APPROVED",
          reviewedAt,
        },
      });
      const version = await testDb.documentVersion.create({
        data: {
          documentId: doc.id,
          versionNumber: 1,
          fileName: "test.pdf",
          filePath: "/tmp/test.pdf",
          fileSize: 100,
          checksum: "abc123",
          uploadedAt,
        },
      });
      await testDb.document.update({
        where: { id: doc.id },
        data: { currentVersionId: version.id },
      });
    }

    const data = await fetchMatrixData();
    const matrix = buildComplianceMatrix(data);
    const cellByType = new Map(matrix.unions[0].scores.map((c) => [c.documentType, c]));

    // Expiring: reviewedAt 340d ago + 1y = expiry 25d from now → EXPIRING
    expect(cellByType.get("Expiring")!.status).toBe("EXPIRING");
    expect(cellByType.get("Expiring")!.expiresAt).not.toBeNull();

    // Overdue: reviewedAt 400d ago + 1y = expiry 35d ago → OVERDUE
    expect(cellByType.get("Overdue")!.status).toBe("OVERDUE");
    expect(cellByType.get("Overdue")!.expiresAt).not.toBeNull();
  });

  it("sweep + digest: document uploaded long ago but approved recently produces no notices", async () => {
    const now = new Date();
    const union = await testDb.union.create({
      data: { unionName: "T71 Union F", registrationNo: "T71-F", status: "ACTIVE" },
    });
    await testDb.complianceRule.create({
      data: { documentType: "RecentlyApproved", required: true, renewalYears: 1 },
    });

    // Uploaded 340 days ago, but approved only 30 days ago.
    // Before T71: expiry = uploadedAt + 1y = 25 days from now → would fire T_30_DAYS
    // After T71:  expiry = reviewedAt + 1y = 335 days from now → no notice
    const uploadedAt = new Date(now.getTime() - 340 * DAY_MS);
    const reviewedAt = new Date(now.getTime() - 30 * DAY_MS);
    const doc = await testDb.document.create({
      data: {
        unionId: union.id,
        documentType: "RecentlyApproved",
        reviewStatus: "APPROVED",
        reviewedAt,
      },
    });
    const version = await testDb.documentVersion.create({
      data: {
        documentId: doc.id,
        versionNumber: 1,
        fileName: "test.pdf",
        filePath: "/tmp/test.pdf",
        fileSize: 100,
        checksum: "abc123",
        uploadedAt,
      },
    });
    await testDb.document.update({
      where: { id: doc.id },
      data: { currentVersionId: version.id },
    });

    const data = await fetchMatrixData();
    const matrix = buildComplianceMatrix(data);
    const renewalByType = new Map(data.rules.map((r) => [r.documentType, r.renewalYears]));

    // Sweep: no issues for this document
    const sweepIssues = collectSweepIssues(matrix, renewalByType, now);
    expect(sweepIssues.filter((i) => i.documentType === "RecentlyApproved")).toEqual([]);

    // Digest: no issues for this document in any bucket
    const { overdue, expiring30, expiring90 } = collectDigestIssues(matrix, renewalByType, now);
    const allDigest = [...overdue, ...expiring30, ...expiring90];
    expect(allDigest.filter((i) => i.documentType === "RecentlyApproved")).toEqual([]);
  });
});
