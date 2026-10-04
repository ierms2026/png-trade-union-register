import { describe, it, expect } from "vitest";
import {
  navigateToComplianceFilter,
  FILTERABLE_STATUSES,
  type ComplianceFilterNavigation,
} from "../dashboard/status-filter";
import type { ComplianceStatus } from "../dashboard/status-config";

describe("navigateToComplianceFilter", () => {
  it("returns view='compliance' and filter=status for COMPLIANT", () => {
    const result = navigateToComplianceFilter("COMPLIANT");
    expect(result.view).toBe("compliance");
    expect(result.filter).toBe("COMPLIANT");
  });

  it("returns view='compliance' and filter=status for EXPIRING", () => {
    const result = navigateToComplianceFilter("EXPIRING");
    expect(result.view).toBe("compliance");
    expect(result.filter).toBe("EXPIRING");
  });

  it("returns view='compliance' and filter=status for OVERDUE", () => {
    const result = navigateToComplianceFilter("OVERDUE");
    expect(result.view).toBe("compliance");
    expect(result.filter).toBe("OVERDUE");
  });

  it("returns view='compliance' and filter=status for MISSING", () => {
    const result = navigateToComplianceFilter("MISSING");
    expect(result.view).toBe("compliance");
    expect(result.filter).toBe("MISSING");
  });

  it("throws for NOT_APPLICABLE (not filterable)", () => {
    expect(() => navigateToComplianceFilter("NOT_APPLICABLE")).toThrow(
      "NOT_APPLICABLE",
    );
  });

  it("works for every FILTERABLE_STATUSES entry", () => {
    for (const status of FILTERABLE_STATUSES) {
      const result = navigateToComplianceFilter(status);
      expect(result.view).toBe("compliance");
      expect(result.filter).toBe(status);
    }
  });

  it("FILTERABLE_STATUSES excludes NOT_APPLICABLE, includes AWAITING_REVIEW", () => {
    expect(FILTERABLE_STATUSES).not.toContain("NOT_APPLICABLE");
    expect(FILTERABLE_STATUSES).toContain("AWAITING_REVIEW");
    expect(FILTERABLE_STATUSES).toHaveLength(5);
  });

  it("return type is ComplianceFilterNavigation", () => {
    const result = navigateToComplianceFilter("COMPLIANT");
    // Type assertion — ensures the shape matches the interface
    const typed: ComplianceFilterNavigation = result;
    expect(typed.view).toBe("compliance");
    expect(typed.filter).toBe("COMPLIANT");
  });
});
