import { describe, it, expect } from "vitest";
import {
  complianceFilterUrl,
  complianceUnfilteredUrl,
  unionsListUrl,
  parseStatusParam,
  parseViewParam,
  PARAM_VIEW,
  PARAM_STATUS,
} from "../dashboard/dashboard-links";
import { STATUS_CONFIG, APPLICABLE_STATUSES, type ComplianceStatus } from "../dashboard/status-config";

// =============================================================================
// Dashboard Links tests — chunk 4.1
//
// Verifies:
// - URL builders produce correct hrefs (fixture-tested, not eyeballed)
// - Param parsing validates against status config
// - Invalid/absent params degrade to unfiltered (never an error)
// - No hardcoded status strings (all from config)
// =============================================================================

describe("dashboard-links — URL builders", () => {
  it("complianceFilterUrl('OVERDUE') returns '/?view=compliance&status=OVERDUE'", () => {
    const url = complianceFilterUrl("OVERDUE");
    expect(url).toBe(`/?${PARAM_VIEW}=compliance&${PARAM_STATUS}=OVERDUE`);
  });

  it("complianceFilterUrl('EXPIRING') returns correct URL", () => {
    const url = complianceFilterUrl("EXPIRING");
    expect(url).toBe(`/?${PARAM_VIEW}=compliance&${PARAM_STATUS}=EXPIRING`);
  });

  it("complianceFilterUrl('COMPLIANT') returns correct URL", () => {
    const url = complianceFilterUrl("COMPLIANT");
    expect(url).toBe(`/?${PARAM_VIEW}=compliance&${PARAM_STATUS}=COMPLIANT`);
  });

  it("complianceFilterUrl('MISSING') returns correct URL", () => {
    const url = complianceFilterUrl("MISSING");
    expect(url).toBe(`/?${PARAM_VIEW}=compliance&${PARAM_STATUS}=MISSING`);
  });

  it("complianceFilterUrl throws for NOT_APPLICABLE", () => {
    expect(() => complianceFilterUrl("NOT_APPLICABLE")).toThrow("NOT_APPLICABLE");
  });

  it("complianceUnfilteredUrl returns '/?view=compliance'", () => {
    expect(complianceUnfilteredUrl()).toBe(`/?${PARAM_VIEW}=compliance`);
  });

  it("unionsListUrl returns '/?view=unions'", () => {
    expect(unionsListUrl()).toBe(`/?${PARAM_VIEW}=unions`);
  });

  it("every applicable status produces a valid URL", () => {
    for (const status of APPLICABLE_STATUSES) {
      const url = complianceFilterUrl(status);
      expect(url).toContain(PARAM_VIEW);
      expect(url).toContain(PARAM_STATUS);
      expect(url).toContain(status);
    }
  });
});

describe("dashboard-links — parseStatusParam", () => {
  it("returns 'COMPLIANT' for 'COMPLIANT'", () => {
    expect(parseStatusParam("COMPLIANT")).toBe("COMPLIANT");
  });

  it("returns 'EXPIRING' for 'EXPIRING'", () => {
    expect(parseStatusParam("EXPIRING")).toBe("EXPIRING");
  });

  it("returns 'OVERDUE' for 'OVERDUE'", () => {
    expect(parseStatusParam("OVERDUE")).toBe("OVERDUE");
  });

  it("returns 'MISSING' for 'MISSING'", () => {
    expect(parseStatusParam("MISSING")).toBe("MISSING");
  });

  it("returns null for absent param (null)", () => {
    expect(parseStatusParam(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseStatusParam("")).toBeNull();
  });

  it("returns null for invalid value 'INVALID'", () => {
    expect(parseStatusParam("INVALID")).toBeNull();
  });

  it("returns null for 'NOT_APPLICABLE' (not filterable)", () => {
    expect(parseStatusParam("NOT_APPLICABLE")).toBeNull();
  });

  it("normalizes lowercase to uppercase: 'overdue' → 'OVERDUE'", () => {
    expect(parseStatusParam("overdue")).toBe("OVERDUE");
  });

  it("normalizes mixed case: 'Expiring' → 'EXPIRING'", () => {
    expect(parseStatusParam("Expiring")).toBe("EXPIRING");
  });
});

describe("dashboard-links — parseViewParam", () => {
  it("returns 'compliance' for 'compliance'", () => {
    expect(parseViewParam("compliance")).toBe("compliance");
  });

  it("returns 'unions' for 'unions'", () => {
    expect(parseViewParam("unions")).toBe("unions");
  });

  it("returns 'dashboard' for 'dashboard'", () => {
    expect(parseViewParam("dashboard")).toBe("dashboard");
  });

  it("returns null for absent param", () => {
    expect(parseViewParam(null)).toBeNull();
  });

  it("returns null for invalid value", () => {
    expect(parseViewParam("invalid")).toBeNull();
  });
});

describe("dashboard-links — KPI href assertions", () => {
  // Simulate what the dashboard component does: build hrefs for each KPI
  it("Total Unions KPI href = unionsListUrl()", () => {
    const href = unionsListUrl();
    expect(href).toBe("/?view=unions");
  });

  it("Documents KPI href = complianceUnfilteredUrl() (no documents list exists)", () => {
    const href = complianceUnfilteredUrl();
    expect(href).toBe("/?view=compliance");
  });

  it("each status KPI href = complianceFilterUrl(status)", () => {
    const statuses: ComplianceStatus[] = ["COMPLIANT", "EXPIRING", "OVERDUE", "MISSING"];
    for (const status of statuses) {
      const href = complianceFilterUrl(status);
      expect(href).toBe(`/?view=compliance&status=${status}`);
      // Verify it contains the status value (not a hardcoded label)
      expect(href).toContain(status);
    }
  });

  it("KPI hrefs contain no hardcoded status labels (e.g. 'Compliant', 'Missing')", () => {
    const statuses: ComplianceStatus[] = ["COMPLIANT", "EXPIRING", "OVERDUE", "MISSING"];
    for (const status of statuses) {
      const href = complianceFilterUrl(status);
      // The URL contains the uppercase enum value, not the human-readable label
      expect(href).not.toContain(STATUS_CONFIG[status].label);
    }
  });
});

describe("dashboard-links — deep-link degradation", () => {
  it("invalid status param degrades to null (unfiltered)", () => {
    const result = parseStatusParam("BOGUS");
    expect(result).toBeNull();
  });

  it("absent status param degrades to null (unfiltered)", () => {
    const result = parseStatusParam(null);
    expect(result).toBeNull();
  });

  it("invalid view param degrades to null (default dashboard)", () => {
    const result = parseViewParam("nonexistent");
    expect(result).toBeNull();
  });

  it("absent view param degrades to null (default dashboard)", () => {
    const result = parseViewParam(null);
    expect(result).toBeNull();
  });
});
