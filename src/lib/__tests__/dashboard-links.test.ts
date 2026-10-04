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

// =============================================================================
// URL routing contract — every NAV_STRUCTURE route is a valid ?view= value.
// This test locks in that the URL routing accepts every navigable view, so
// refresh + Back/Forward + sharing work for every destination.
// =============================================================================

import { getAllRoutes } from "../dashboard/nav-structure";

describe("dashboard-links — URL routing contract", () => {
  it("every NAV_STRUCTURE route is accepted by parseViewParam", () => {
    // This is the contract that makes refresh + sharing work for every view:
    // pasting /?view=<any-nav-route> must resolve to a valid view, not fall
    // through to the dashboard.
    const allRoutes = getAllRoutes();
    for (const route of allRoutes) {
      const parsed = parseViewParam(route);
      expect(parsed, `route "${route}" must be accepted by parseViewParam`).toBe(route);
    }
  });

  it("parseViewParam rejects unknown routes (degrades to null → dashboard)", () => {
    expect(parseViewParam("nonexistent")).toBeNull();
    expect(parseViewParam("")).toBeNull();
    expect(parseViewParam(null)).toBeNull();
  });

  it("account-security is accepted (reachable via user menu, not nav)", () => {
    // account-security isn't in NAV_STRUCTURE (it's reached via the user
    // menu dropdown), but it IS a valid ?view= value — so it needs to be
    // accepted for refresh + sharing to work when a user lands on it.
    expect(parseViewParam("account-security")).toBe("account-security");
  });
});

// =============================================================================
// Notification linkUrl helpers — canonical format + audience-aware parsing.
//
// These tests lock in the contract that:
//   1. staffLinkUrl / portalLinkUrl produce the canonical format
//   2. parseStaffLinkUrl / parsePortalLinkUrl are audience-aware (cross-audience
//      links are ignored, not silently landed on the Dashboard)
//   3. resolveLinkUrlForEmail produces absolute URLs for email rendering
//   4. inferLinkAudience correctly identifies staff vs portal links
//   5. Every notification creator in src/app/api uses the canonical helpers
//      (source-text scan — prevents drift)
// =============================================================================

import {
  staffLinkUrl,
  portalLinkUrl,
  parseLinkUrl,
  parseStaffLinkUrl,
  parsePortalLinkUrl,
  resolveLinkUrlForEmail,
  inferLinkAudience,
} from "../dashboard/vocabulary";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

describe("notification linkUrl helpers — canonical format", () => {
  it("staffLinkUrl produces /?view=X", () => {
    expect(staffLinkUrl("reviews")).toBe("/?view=reviews");
    expect(staffLinkUrl("compliance")).toBe("/?view=compliance");
    expect(staffLinkUrl("tasks")).toBe("/?view=tasks");
  });

  it("portalLinkUrl produces /portal?view=X", () => {
    expect(portalLinkUrl("contact")).toBe("/portal?view=contact");
    expect(portalLinkUrl("documents")).toBe("/portal?view=documents");
  });
});

describe("notification linkUrl helpers — audience-aware parsing", () => {
  it("parseStaffLinkUrl honors staff links (/?view=X)", () => {
    expect(parseStaffLinkUrl("/?view=reviews")).toBe("reviews");
    expect(parseStaffLinkUrl("/?view=compliance")).toBe("compliance");
  });

  it("parseStaffLinkUrl IGNORES portal links (/portal?view=X)", () => {
    // This is the key fix: a portal link in a staff notification must NOT
    // be honored by the staff app. Before audience-aware parsing, the
    // generic parseLinkUrl would extract "contact" → onNavigate("contact")
    // → staff app has no "contact" view → silent Dashboard fallthrough.
    expect(parseStaffLinkUrl("/portal?view=contact")).toBeNull();
    expect(parseStaffLinkUrl("/portal?view=documents")).toBeNull();
  });

  it("parseStaffLinkUrl returns null for absent/empty linkUrl", () => {
    expect(parseStaffLinkUrl(null)).toBeNull();
    expect(parseStaffLinkUrl(undefined)).toBeNull();
    expect(parseStaffLinkUrl("")).toBeNull();
  });

  it("parseStaffLinkUrl returns null for plain-path links (legacy)", () => {
    // Legacy /reviews (no ?view=) — should be null so the click is a no-op,
    // not a silent Dashboard fallthrough. (These should all be migrated
    // to /?view=reviews by the migration script, but the parser should
    // still handle them gracefully.)
    expect(parseStaffLinkUrl("/reviews")).toBeNull();
    expect(parseStaffLinkUrl("/compliance")).toBeNull();
  });

  it("parsePortalLinkUrl honors portal links (/portal?view=X)", () => {
    expect(parsePortalLinkUrl("/portal?view=contact")).toBe("contact");
    expect(parsePortalLinkUrl("/portal?view=documents")).toBe("documents");
  });

  it("parsePortalLinkUrl IGNORES staff links (/?view=X)", () => {
    // A staff link in a portal notification must NOT be honored by the portal.
    // The portal has no "tasks" view — onNavigate("tasks") would be a no-op
    // or worse.
    expect(parsePortalLinkUrl("/?view=tasks")).toBeNull();
    expect(parsePortalLinkUrl("/?view=compliance")).toBeNull();
  });

  it("parsePortalLinkUrl returns null for absent/empty linkUrl", () => {
    expect(parsePortalLinkUrl(null)).toBeNull();
    expect(parsePortalLinkUrl(undefined)).toBeNull();
    expect(parsePortalLinkUrl("")).toBeNull();
  });

  it("parseLinkUrl (generic) extracts ?view= from any link regardless of audience", () => {
    // The generic parser is kept for backward compat + debugging. It
    // extracts ?view= from both staff and portal links. Production code
    // should use the audience-aware variants.
    expect(parseLinkUrl("/?view=reviews")).toBe("reviews");
    expect(parseLinkUrl("/portal?view=contact")).toBe("contact");
  });

  it("parseLinkUrl (generic) returns null for absent/empty linkUrl", () => {
    expect(parseLinkUrl(null)).toBeNull();
    expect(parseLinkUrl("")).toBeNull();
    expect(parseLinkUrl("/reviews")).toBeNull(); // no ?view= param
  });
});

describe("notification linkUrl helpers — email absolute URLs", () => {
  it("resolveLinkUrlForEmail produces an absolute URL with the fallback base", () => {
    expect(resolveLinkUrlForEmail("/?view=reviews", "http://localhost:3000"))
      .toBe("http://localhost:3000/?view=reviews");
    expect(resolveLinkUrlForEmail("/portal?view=contact", "http://localhost:3000"))
      .toBe("http://localhost:3000/portal?view=contact");
  });

  it("resolveLinkUrlForEmail uses NEXT_PUBLIC_APP_URL when set", () => {
    const saved = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://urm.labour.gov.pg";
    try {
      expect(resolveLinkUrlForEmail("/?view=reviews", "http://localhost:3000"))
        .toBe("https://urm.labour.gov.pg/?view=reviews");
    } finally {
      // Restore — don't leak the env var to other tests.
      if (saved === undefined) {
        delete process.env.NEXT_PUBLIC_APP_URL;
      } else {
        process.env.NEXT_PUBLIC_APP_URL = saved;
      }
    }
  });

  it("resolveLinkUrlForEmail strips trailing slash from base URL", () => {
    expect(resolveLinkUrlForEmail("/?view=reviews", "http://localhost:3000/"))
      .toBe("http://localhost:3000/?view=reviews");
    expect(resolveLinkUrlForEmail("/?view=reviews", "http://localhost:3000///"))
      .toBe("http://localhost:3000/?view=reviews");
  });

  it("resolveLinkUrlForEmail returns null for absent linkUrl", () => {
    expect(resolveLinkUrlForEmail(null, "http://localhost:3000")).toBeNull();
    expect(resolveLinkUrlForEmail(undefined, "http://localhost:3000")).toBeNull();
  });
});

describe("notification linkUrl helpers — audience inference", () => {
  it("inferLinkAudience returns 'staff' for /?view=X links", () => {
    expect(inferLinkAudience("/?view=reviews")).toBe("staff");
    expect(inferLinkAudience("/?view=compliance")).toBe("staff");
  });

  it("inferLinkAudience returns 'portal' for /portal?view=X links", () => {
    expect(inferLinkAudience("/portal?view=contact")).toBe("portal");
    expect(inferLinkAudience("/portal?view=documents")).toBe("portal");
  });

  it("inferLinkAudience defaults to 'staff' for null/empty linkUrl", () => {
    expect(inferLinkAudience(null)).toBe("staff");
    expect(inferLinkAudience(undefined)).toBe("staff");
    expect(inferLinkAudience("")).toBe("staff");
  });
});

// =============================================================================
// Source-text contract test — every notification creator uses the canonical
// helpers (staffLinkUrl / portalLinkUrl), not ad-hoc string-building.
//
// This is the "drift alarm": if a future notification creator writes
// `linkUrl: "/reviews"` instead of `linkUrl: staffLinkUrl("reviews")`, this
// test fails. The canonical helpers are the single source of truth for
// notification linkUrl format.
// =============================================================================

describe("notification creators — canonical format contract (source-text scan)", () => {
  function walk(dir: string, files: string[] = []): string[] {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = resolve(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(full, files);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        files.push(full);
      }
    }
    return files;
  }

  it("every createNotification call site uses staffLinkUrl or portalLinkUrl for linkUrl (no ad-hoc strings)", () => {
    const apiRoot = resolve(__dirname, "../../app/api");
    const files = walk(apiRoot);
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      // Find lines that set linkUrl: "..." (with a string literal, not a
      // function call). The canonical pattern is linkUrl: staffLinkUrl(...)
      // or linkUrl: portalLinkUrl(...). A string literal like linkUrl: "/reviews"
      // is a violation.
      //
      // Regex: linkUrl: followed by optional whitespace + a quote character
      // (not a function call). This catches linkUrl: "/reviews" and
      // linkUrl: '/reviews' but NOT linkUrl: staffLinkUrl("reviews").
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/linkUrl\s*:\s*["']/);
        if (match) {
          // Check it's not inside a comment.
          if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
          violations.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations, "All notification linkUrl values must use staffLinkUrl() or portalLinkUrl(), not string literals").toEqual([]);
  });
});
