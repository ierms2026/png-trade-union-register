import { describe, it, expect } from "vitest";
import {
  type ComplianceCell,
  type DashboardMetrics,
  type UnionSummary,
  type DocumentTypeCount,
  type ComplianceCounts,
  tallyComplianceCounts,
  computeComplianceRate,
  tallyStatuses,
  computeRateFromCounts,
  getComplianceCounts,
  getComplianceRate,
  getActiveDocumentCount,
  getDocumentsByType,
  getUnionList,
  getExpiringWithin,
  getOverdueCells,
  getMissingCells,
  getUnionsWithNonCompliance,
  buildDashboardMetrics,
} from "../dashboard/metrics";
import { COMPLIANCE_STATUSES, type ComplianceStatus } from "../dashboard/status-config";

// =============================================================================
// Mock data — deterministic, does NOT hit the DB. The numbers below mirror
// the chunk 0.1 audit's live DB findings (17 COMPLIANT, 2 EXPIRING,
// 2 OVERDUE, 57 MISSING, 0 N/A → 78 cells = 6 × 13).
// =============================================================================

function makeMockCells(): ComplianceCell[] {
  // 17 compliant
  const compliant: ComplianceCell[] = Array.from({ length: 17 }, (_, i) => ({
    unionId: `union-${Math.floor(i / 3)}`,
    documentType: `doc-${i}`,
    status: "COMPLIANT" as const,
    filedAt: new Date("2024-01-15"),
    expiryDate: new Date("2025-01-15"),
  }));

  // 2 expiring (within 90 days)
  const expiring: ComplianceCell[] = [
    {
      unionId: "union-0",
      documentType: "exp-doc-1",
      status: "EXPIRING" as const,
      filedAt: new Date("2025-08-01"),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    },
    {
      unionId: "union-1",
      documentType: "exp-doc-2",
      status: "EXPIRING" as const,
      filedAt: new Date("2025-08-01"),
      expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
    },
  ];

  // 2 overdue
  const overdue: ComplianceCell[] = [
    {
      unionId: "union-0",
      documentType: "overdue-doc-1",
      status: "OVERDUE" as const,
      filedAt: new Date("2023-01-01"),
      expiryDate: new Date("2024-01-01"),
    },
    {
      unionId: "union-2",
      documentType: "overdue-doc-2",
      status: "OVERDUE" as const,
      filedAt: new Date("2023-06-01"),
      expiryDate: new Date("2024-06-01"),
    },
  ];

  // 57 missing
  const missing: ComplianceCell[] = Array.from({ length: 57 }, (_, i) => ({
    unionId: `union-${i % 6}`,
    documentType: `missing-doc-${i}`,
    status: "MISSING" as const,
    filedAt: null,
    expiryDate: null,
  }));

  return [...compliant, ...expiring, ...overdue, ...missing];
}

function makeMockMetrics(): DashboardMetrics {
  const unions: UnionSummary[] = Array.from({ length: 6 }, (_, i) => ({
    id: `union-${i}`,
    name: `Union ${i + 1}`,
    registrationNo: `TU-2024-${String(i + 1).padStart(3, "0")}`,
    status: i === 5 ? "SUSPENDED" : "ACTIVE",
  }));

  const byType: DocumentTypeCount[] = [
    { documentType: "Registration Certificate", count: 5 },
    { documentType: "Constitution", count: 5 },
    { documentType: "Financial Return", count: 4 },
    { documentType: "Election of Office Bearers", count: 2 },
    { documentType: "Awards", count: 2 },
    { documentType: "Financial Membership List", count: 1 },
    { documentType: "Affiliations", count: 1 },
    { documentType: "Secret Ballots", count: 1 },
  ];

  return buildDashboardMetrics({
    unions,
    activeDocumentCount: 21,
    documentsByType: byType,
    complianceCells: makeMockCells(),
  });
}

describe("metrics", () => {
  describe("tallyComplianceCounts", () => {
    it("tallies 17/2/2/57/0 from mock data (matching audit findings)", () => {
      const cells = makeMockCells();
      const counts = tallyComplianceCounts(cells);
      expect(counts.COMPLIANT).toBe(17);
      expect(counts.EXPIRING).toBe(2);
      expect(counts.OVERDUE).toBe(2);
      expect(counts.MISSING).toBe(57);
      expect(counts.NOT_APPLICABLE).toBe(0);
    });

    it("sum of applicable statuses = 78 (6 unions × 13 rules)", () => {
      const counts = tallyComplianceCounts(makeMockCells());
      const applicable =
        counts.COMPLIANT + counts.EXPIRING + counts.OVERDUE + counts.MISSING;
      expect(applicable).toBe(78);
    });
  });

  describe("computeComplianceRate", () => {
    it("computes numerator = 17, denominator = 78, percentage = 22", () => {
      const cells = makeMockCells();
      const rate = computeComplianceRate(cells);
      expect(rate.numerator).toBe(17);
      expect(rate.denominator).toBe(78);
      expect(rate.percentage).toBe(Math.round((17 / 78) * 100));
    });

    it("returns 0 percentage when denominator is 0", () => {
      const emptyCells: ComplianceCell[] = [];
      const rate = computeComplianceRate(emptyCells);
      expect(rate.numerator).toBe(0);
      expect(rate.denominator).toBe(0);
      expect(rate.percentage).toBe(0);
    });

    it("returns 100 when all applicable cells are COMPLIANT", () => {
      const allCompliant: ComplianceCell[] = Array.from({ length: 10 }, (_, i) => ({
        unionId: `u-${i}`,
        documentType: `d-${i}`,
        status: "COMPLIANT" as const,
        filedAt: new Date(),
        expiryDate: new Date(),
      }));
      const rate = computeComplianceRate(allCompliant);
      expect(rate.numerator).toBe(10);
      expect(rate.denominator).toBe(10);
      expect(rate.percentage).toBe(100);
    });
  });

  describe("buildDashboardMetrics + selectors", () => {
    const metrics = makeMockMetrics();

    it("buildDashboardMetrics produces a well-formed object", () => {
      expect(metrics.unions.count).toBe(6);
      expect(metrics.unions.list).toHaveLength(6);
      expect(metrics.documents.activeCount).toBe(21);
      expect(metrics.documents.byType).toHaveLength(8);
      expect(metrics.compliance.cells).toHaveLength(78);
    });

    it("getComplianceCounts returns the counts object", () => {
      const counts = getComplianceCounts(metrics);
      expect(counts.COMPLIANT).toBe(17);
      expect(counts.MISSING).toBe(57);
    });

    it("getComplianceRate returns numerator, denominator, percentage", () => {
      const rate = getComplianceRate(metrics);
      expect(rate.numerator).toBe(17);
      expect(rate.denominator).toBe(78);
      expect(rate.percentage).toBe(Math.round((17 / 78) * 100));
    });

    it("getActiveDocumentCount returns 21 (non-disposed, per audit)", () => {
      expect(getActiveDocumentCount(metrics)).toBe(21);
    });

    it("getDocumentsByType returns the 8-type breakdown", () => {
      const byType = getDocumentsByType(metrics);
      expect(byType).toHaveLength(8);
      expect(byType[0].documentType).toBe("Registration Certificate");
      expect(byType[0].count).toBe(5);
    });

    it("getUnionList returns 6 unions", () => {
      const unions = getUnionList(metrics);
      expect(unions).toHaveLength(6);
      expect(unions[0].name).toBe("Union 1");
    });
  });

  describe("cell selectors", () => {
    const cells = makeMockCells();

    it("getExpiringWithin(90) returns 2 cells", () => {
      const expiring = getExpiringWithin(cells, 90);
      expect(expiring).toHaveLength(2);
      expect(expiring.every((c) => c.status === "EXPIRING")).toBe(true);
    });

    it("getExpiringWithin(15) returns 0 cells (both expire in 30/60 days)", () => {
      const expiring = getExpiringWithin(cells, 15);
      expect(expiring).toHaveLength(0);
    });

    it("getOverdueCells returns 2 cells", () => {
      const overdue = getOverdueCells(cells);
      expect(overdue).toHaveLength(2);
    });

    it("getMissingCells returns 57 cells", () => {
      const missing = getMissingCells(cells);
      expect(missing).toHaveLength(57);
    });
  });

  describe("getUnionsWithNonCompliance", () => {
    it("returns unions that have OVERDUE or MISSING cells", () => {
      const metrics = makeMockMetrics();
      const nonCompliant = getUnionsWithNonCompliance(metrics);
      // All 6 unions have at least one MISSING cell (57 missing spread across 6)
      expect(nonCompliant.length).toBeGreaterThan(0);
      expect(nonCompliant.every((u) => u.id.startsWith("union-"))).toBe(true);
    });
  });

  describe("snapshot: canonical metrics shape", () => {
    it("renders consistent numbers matching the 0.1 audit", () => {
      const metrics = makeMockMetrics();

      // These assertions encode the audit's findings:
      // 23 total docs vs 21 active (disposed = 2)
      expect(metrics.documents.activeCount).toBe(21);

      // Compliance: 17 + 2 + 2 + 57 = 78 (6 × 13)
      const counts = getComplianceCounts(metrics);
      expect(counts.COMPLIANT).toBe(17);
      expect(counts.EXPIRING).toBe(2);
      expect(counts.OVERDUE).toBe(2);
      expect(counts.MISSING).toBe(57);
      expect(
        counts.COMPLIANT + counts.EXPIRING + counts.OVERDUE + counts.MISSING,
      ).toBe(78);

      // Rate: 17/78 ≈ 22%
      const rate = getComplianceRate(metrics);
      expect(rate.numerator).toBe(17);
      expect(rate.denominator).toBe(78);
      expect(rate.percentage).toBe(Math.round((17 / 78) * 100));
    });
  });
});

// =============================================================================
// T06a: tallyStatuses + computeRateFromCounts — AWAITING_REVIEW support.
//
// These tests verify the new helpers that accept any { status }[] shape
// (not just ComplianceCell[]) and correctly count AWAITING_REVIEW in both
// the tally and the rate denominator.
//
// The fixture iterates the canonical COMPLIANCE_STATUSES list so that
// adding a new status in the future breaks these tests (forces a conscious
// update rather than silent omission).
// =============================================================================

describe("tallyStatuses + computeRateFromCounts (T06a)", () => {
  // Build a fixture that contains every ComplianceStatus value at least once.
  // We iterate the canonical COMPLIANCE_STATUSES list so this test
  // automatically breaks if a new status is added without updating
  // the helpers.
  function makeFixtureWithAllStatuses(): Array<{ status: ComplianceStatus }> {
    // One cell per status, plus an extra COMPLIANT + AWAITING_REVIEW
    // to make the counts non-trivial.
    const cells: Array<{ status: ComplianceStatus }> = [];
    for (const status of COMPLIANCE_STATUSES) {
      cells.push({ status });
    }
    // Add extras to make the test more interesting:
    cells.push({ status: "COMPLIANT" });       // total COMPLIANT = 2
    cells.push({ status: "AWAITING_REVIEW" }); // total AWAITING_REVIEW = 2
    cells.push({ status: "MISSING" });         // total MISSING = 2
    return cells;
  }

  it("tallyStatuses counts every ComplianceStatus in the canonical list", () => {
    const cells = makeFixtureWithAllStatuses();
    const counts = tallyStatuses(cells);

    // Every status in COMPLIANCE_STATUSES should have count >= 1.
    for (const status of COMPLIANCE_STATUSES) {
      expect(counts[status], `counts[${status}] should be >= 1`).toBeGreaterThanOrEqual(1);
    }

    // Specific counts from the fixture:
    // 1 each from the loop + extras: COMPLIANT=2, AWAITING_REVIEW=2, MISSING=2,
    // everything else = 1.
    expect(counts.COMPLIANT).toBe(2);
    expect(counts.EXPIRING).toBe(1);
    expect(counts.OVERDUE).toBe(1);
    expect(counts.AWAITING_REVIEW).toBe(2);
    expect(counts.MISSING).toBe(2);
    expect(counts.NOT_APPLICABLE).toBe(1);
  });

  it("the six counts sum to the number of input cells", () => {
    const cells = makeFixtureWithAllStatuses();
    const counts = tallyStatuses(cells);
    const sum =
      counts.COMPLIANT +
      counts.EXPIRING +
      counts.OVERDUE +
      counts.AWAITING_REVIEW +
      counts.MISSING +
      counts.NOT_APPLICABLE;
    expect(sum).toBe(cells.length);
  });

  it("AWAITING_REVIEW is counted (not silently dropped)", () => {
    const cells: Array<{ status: ComplianceStatus }> = [
      { status: "AWAITING_REVIEW" },
      { status: "AWAITING_REVIEW" },
      { status: "AWAITING_REVIEW" },
    ];
    const counts = tallyStatuses(cells);
    expect(counts.AWAITING_REVIEW).toBe(3);
    // All other counts should be 0.
    for (const status of COMPLIANCE_STATUSES) {
      if (status !== "AWAITING_REVIEW") {
        expect(counts[status], `counts[${status}] should be 0`).toBe(0);
      }
    }
  });

  it("computeRateFromCounts includes AWAITING_REVIEW in the denominator (not in numerator)", () => {
    // Fixture: 2 COMPLIANT, 1 EXPIRING, 1 OVERDUE, 2 AWAITING_REVIEW, 2 MISSING, 1 N/A
    // Rule: numerator = COMPLIANT = 2
    //       denominator = COMPLIANT + EXPIRING + OVERDUE + AWAITING_REVIEW + MISSING
    //                   = 2 + 1 + 1 + 2 + 2 = 8 (NOT_APPLICABLE excluded)
    //       percentage = round(2/8 * 100) = 25
    const counts: ComplianceCounts = {
      COMPLIANT: 2,
      EXPIRING: 1,
      OVERDUE: 1,
      AWAITING_REVIEW: 2,
      MISSING: 2,
      NOT_APPLICABLE: 1,
    };
    const rate = computeRateFromCounts(counts);
    expect(rate.numerator).toBe(2);
    expect(rate.denominator).toBe(8);
    expect(rate.percentage).toBe(25);
  });

  it("computeRateFromCounts excludes NOT_APPLICABLE from both numerator and denominator", () => {
    const counts: ComplianceCounts = {
      COMPLIANT: 3,
      EXPIRING: 0,
      OVERDUE: 0,
      AWAITING_REVIEW: 0,
      MISSING: 0,
      NOT_APPLICABLE: 99,
    };
    const rate = computeRateFromCounts(counts);
    // numerator = 3, denominator = 3 (N/A excluded), percentage = 100
    expect(rate.numerator).toBe(3);
    expect(rate.denominator).toBe(3);
    expect(rate.percentage).toBe(100);
  });

  it("computeRateFromCounts returns 0 percentage when denominator is 0", () => {
    const counts: ComplianceCounts = {
      COMPLIANT: 0,
      EXPIRING: 0,
      OVERDUE: 0,
      AWAITING_REVIEW: 0,
      MISSING: 0,
      NOT_APPLICABLE: 5,
    };
    const rate = computeRateFromCounts(counts);
    expect(rate.numerator).toBe(0);
    expect(rate.denominator).toBe(0);
    expect(rate.percentage).toBe(0);
  });

  it("tallyStatuses works with any { status } shape (not just ComplianceCell)", () => {
    // Simulate ComplianceScoreCell from the matrix builder — has `status`
    // but different field names than ComplianceCell.
    const cells = [
      { status: "COMPLIANT" as ComplianceStatus, documentType: "Constitution", documentId: "abc" },
      { status: "AWAITING_REVIEW" as ComplianceStatus, documentType: "Annual Return", documentId: "def" },
      { status: "MISSING" as ComplianceStatus, documentType: "Financial Return", documentId: null },
    ];
    const counts = tallyStatuses(cells);
    expect(counts.COMPLIANT).toBe(1);
    expect(counts.AWAITING_REVIEW).toBe(1);
    expect(counts.MISSING).toBe(1);
  });

  it("iterating COMPLIANCE_STATUSES covers exactly 6 statuses (breaks if a status is added)", () => {
    // This test is a tripwire: if someone adds a 7th status to
    // COMPLIANCE_STATUSES without updating the helpers/tests, this fails.
    expect(COMPLIANCE_STATUSES).toHaveLength(6);
  });
});
