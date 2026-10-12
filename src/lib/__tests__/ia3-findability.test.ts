import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DOCUMENT_TYPE_CATEGORIES,
  groupDocumentTypesByCategory,
} from "@/lib/dashboard/vocabulary";
import { getUnionScope } from "@/lib/auth/union-scope";

// =============================================================================
// IA-3: Findability tests — breadcrumbs, global search scoping, document
// type categories.
//
// Tests:
//   1. Breadcrumbs are rendered on every authenticated page (AppShell always
//      renders the breadcrumb bar — static check).
//   2. Global search client-side scoping: the palette fetches /api/unions +
//      /api/tasks which scope server-side. Officers only see their own union.
//   3. Search API uses getUnionScope — an officer with null union gets 403.
//   4. Search API now searches document title (fileName) + type, not just
//      textContent.
//   5. Document types are grouped into 4 categories in the upload picker +
//      union Documents tab.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");

// =============================================================================
// 1. Breadcrumbs on every authenticated page
// =============================================================================

describe("IA-3: breadcrumbs on every authenticated page", () => {
  it("app-shell.tsx renders the breadcrumb bar unconditionally", () => {
    const file = join(SRC_ROOT, "src/components/app/app-shell.tsx");
    const content = readFileSync(file, "utf-8");
    // The breadcrumb bar must be rendered (not conditionally hidden).
    expect(content).toContain("<Breadcrumb>");
    expect(content).toContain("<BreadcrumbList>");
    // The buildBreadcrumbs function must exist.
    expect(content).toContain("function buildBreadcrumbs");
  });

  it("buildBreadcrumbs uses VIEW_TITLES for the account-security label", () => {
    const file = join(SRC_ROOT, "src/components/app/app-shell.tsx");
    const content = readFileSync(file, "utf-8");
    // IA-1: the account-security breadcrumb uses VIEW_TITLES (not a hardcoded
    // "Account Security" string).
    expect(content).toMatch(/VIEW_TITLES\["account-security"\]/);
  });

  it("buildBreadcrumbs derives group + destination labels from the nav structure", () => {
    const file = join(SRC_ROOT, "src/components/app/app-shell.tsx");
    const content = readFileSync(file, "utf-8");
    // Must use getNavForRole + findDestination (not hardcoded labels).
    expect(content).toContain("getNavForRole");
    expect(content).toContain("findDestination");
  });

  it("page.tsx wraps every authenticated view in AppShell", () => {
    const file = join(SRC_ROOT, "src/app/page.tsx");
    const content = readFileSync(file, "utf-8");
    // The authenticated branch must render <AppShell>.
    expect(content).toContain("<AppShell");
  });
});

// =============================================================================
// 2. Global search client-side scoping
// =============================================================================

describe("IA-3: global search client-side scoping", () => {
  it("global-search.tsx fetches /api/unions (server-scoped)", () => {
    const file = join(SRC_ROOT, "src/components/app/global-search.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain('"/api/unions"');
  });

  it("global-search.tsx fetches /api/tasks (server-scoped, registrar + officer only)", () => {
    const file = join(SRC_ROOT, "src/components/app/global-search.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain('"/api/tasks"');
    // Tasks are only fetched for REGISTRAR + OFFICER (Inspector doesn't see tasks).
    expect(content).toMatch(/REGISTRAR.*OFFICER|OFFICER.*REGISTRAR/);
  });

  it("global-search.tsx fetches /api/search for document content (debounced)", () => {
    const file = join(SRC_ROOT, "src/components/app/global-search.tsx");
    const content = readFileSync(file, "utf-8");
    // The fetch uses a template literal: `/api/search?q=${...}`
    expect(content).toContain("/api/search?q=");
  });

  it("global-search.tsx fetches /api/users (registrar only)", () => {
    const file = join(SRC_ROOT, "src/components/app/global-search.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain('"/api/users"');
  });

  it("app-shell.tsx has a visible header search button (not just Cmd+K)", () => {
    const file = join(SRC_ROOT, "src/components/app/app-shell.tsx");
    const content = readFileSync(file, "utf-8");
    // The desktop search button + mobile search button must exist.
    expect(content).toMatch(/setSearchOpen\(true\)/);
    expect(content).toContain("⌘K");
  });
});

// =============================================================================
// 3. Search API server-side scoping (including null-union officer)
// =============================================================================

describe("IA-3: search API server-side scoping", () => {
  it("getUnionScope returns { kind: 'none' } for an officer with null union", () => {
    const scope = getUnionScope({ role: "OFFICER", assignedUnionId: null });
    expect(scope).toEqual({ kind: "none" });
  });

  it("getUnionScope returns { kind: 'none' } for an officer with empty-string union", () => {
    const scope = getUnionScope({ role: "OFFICER", assignedUnionId: "" });
    expect(scope).toEqual({ kind: "none" });
  });

  it("getUnionScope returns { kind: 'none' } for an officer with whitespace union", () => {
    const scope = getUnionScope({ role: "OFFICER", assignedUnionId: "   " });
    expect(scope).toEqual({ kind: "none" });
  });

  it("getUnionScope returns { kind: 'union' } for an officer with a valid union", () => {
    const scope = getUnionScope({ role: "OFFICER", assignedUnionId: "abc123" });
    expect(scope).toEqual({ kind: "union", unionId: "abc123" });
  });

  it("getUnionScope returns { kind: 'all' } for registrar", () => {
    const scope = getUnionScope({ role: "REGISTRAR", assignedUnionId: null });
    expect(scope).toEqual({ kind: "all" });
  });

  it("getUnionScope returns { kind: 'all' } for inspector", () => {
    const scope = getUnionScope({ role: "INSPECTOR", assignedUnionId: null });
    expect(scope).toEqual({ kind: "all" });
  });

  it("search API route uses getUnionScope", () => {
    const file = join(SRC_ROOT, "src/app/api/search/route.ts");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("getUnionScope");
    // Must return 403 when scope.kind === "none"
    expect(content).toMatch(/scope\.kind === "none"[\s\S]*?403/);
  });

  it("search API route forces officer scoping (ignores ?union= param)", () => {
    const file = join(SRC_ROOT, "src/app/api/search/route.ts");
    const content = readFileSync(file, "utf-8");
    // The officer branch must set documentWhere.unionId = scope.unionId
    // (not honor the ?union= param).
    expect(content).toMatch(/scope\.kind === "union"[\s\S]*?documentWhere\.unionId = scope\.unionId/);
  });

  it("/api/unions route uses getUnionScope (officers see only their union)", () => {
    const file = join(SRC_ROOT, "src/app/api/unions/route.ts");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("getUnionScope");
    expect(content).toMatch(/scope\.kind === "none"[\s\S]*?403/);
  });
});

// =============================================================================
// 4. Search API searches document title (fileName) + type, not just textContent
// =============================================================================

describe("IA-3: search API searches title + type + content", () => {
  it("search route WHERE clause includes an OR across textContent, fileName, documentType", () => {
    const file = join(SRC_ROOT, "src/app/api/search/route.ts");
    const content = readFileSync(file, "utf-8");
    // IA-3: the where clause must use OR to search across all three fields.
    expect(content).toMatch(/OR:\s*\[/);
    expect(content).toContain("textContent");
    expect(content).toContain("fileName");
    expect(content).toContain("documentType");
  });

  it("search route builds synthetic snippets for documentType + fileName matches", () => {
    const file = join(SRC_ROOT, "src/app/api/search/route.ts");
    const content = readFileSync(file, "utf-8");
    // When the textContent has no match, the route checks documentType +
    // fileName for a synthetic snippet.
    expect(content).toContain("[Document type:");
    expect(content).toContain("[File:");
  });
});

// =============================================================================
// 5. Document type categories
// =============================================================================

describe("IA-3: document type categories", () => {
  it("DOCUMENT_TYPE_CATEGORIES defines 4 categories", () => {
    expect(DOCUMENT_TYPE_CATEGORIES).toHaveLength(4);
    const labels = DOCUMENT_TYPE_CATEGORIES.map((c) => c.label);
    expect(labels).toEqual(["Registration", "Annual Filings", "Governance", "Oversight"]);
  });

  it("the 4 categories cover all 13 canonical document types", () => {
    const allTypes = DOCUMENT_TYPE_CATEGORIES.flatMap((c) => c.documentTypes);
    expect(allTypes).toHaveLength(13);
    // No duplicates
    expect(new Set(allTypes).size).toBe(13);
  });

  it("Registration category has the 3 founding documents", () => {
    const reg = DOCUMENT_TYPE_CATEGORIES.find((c) => c.label === "Registration")!;
    expect(reg.documentTypes).toEqual([
      "Application for Registration",
      "Registration Certificate",
      "Constitution",
    ]);
  });

  it("Annual Filings category has 4 yearly-cycle documents", () => {
    const annual = DOCUMENT_TYPE_CATEGORIES.find((c) => c.label === "Annual Filings")!;
    expect(annual.documentTypes).toHaveLength(4);
    expect(annual.documentTypes).toContain("Financial Return");
    expect(annual.documentTypes).toContain("Financial Membership List");
  });

  it("Governance category has 3 leadership/election documents", () => {
    const gov = DOCUMENT_TYPE_CATEGORIES.find((c) => c.label === "Governance")!;
    expect(gov.documentTypes).toHaveLength(3);
    expect(gov.documentTypes).toContain("Election of Office Bearers");
    expect(gov.documentTypes).toContain("Secret Ballots");
  });

  it("Oversight category has 3 registrar-produced documents", () => {
    const oversight = DOCUMENT_TYPE_CATEGORIES.find((c) => c.label === "Oversight")!;
    expect(oversight.documentTypes).toHaveLength(3);
    expect(oversight.documentTypes).toContain("Inspection Reports");
    expect(oversight.documentTypes).toContain("Awards");
  });

  it("groupDocumentTypesByCategory groups a flat list + omits empty categories", () => {
    const input = ["Constitution", "Financial Return", "Awards", "Unknown Type"];
    const grouped = groupDocumentTypesByCategory(input);
    // Constitution → Registration
    expect(grouped.find((c) => c.label === "Registration")?.documentTypes).toEqual(["Constitution"]);
    // Financial Return → Annual Filings
    expect(grouped.find((c) => c.label === "Annual Filings")?.documentTypes).toEqual(["Financial Return"]);
    // Awards → Oversight
    expect(grouped.find((c) => c.label === "Oversight")?.documentTypes).toEqual(["Awards"]);
    // Unknown Type → Other
    expect(grouped.find((c) => c.label === "Other")?.documentTypes).toEqual(["Unknown Type"]);
    // Governance has zero matching types → omitted
    expect(grouped.find((c) => c.label === "Governance")).toBeUndefined();
  });

  it("groupDocumentTypesByCategory handles empty input", () => {
    const grouped = groupDocumentTypesByCategory([]);
    expect(grouped).toEqual([]);
  });

  it("groupDocumentTypesByCategory preserves all input types (no drops)", () => {
    const input = [
      "Application for Registration",
      "Registration Certificate",
      "Constitution",
      "Financial Return",
      "Financial Membership List",
      "Affiliations",
      "Welfare Fund",
      "Election of Office Bearers",
      "Secret Ballots",
      "General Secretary Appointments",
      "Inspection Reports",
      "Awards",
      "General Matters",
    ];
    const grouped = groupDocumentTypesByCategory(input);
    const allGrouped = grouped.flatMap((c) => c.documentTypes);
    expect(allGrouped.sort()).toEqual(input.sort());
  });
});

// =============================================================================
// 6. Upload picker uses grouped categories
// =============================================================================

describe("IA-3: upload picker uses grouped categories", () => {
  it("unions.tsx imports groupDocumentTypesByCategory", () => {
    const file = join(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("groupDocumentTypesByCategory");
  });

  it("unions.tsx UploadDialog uses SelectGroup + SelectLabel for categories", () => {
    const file = join(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("SelectGroup");
    expect(content).toContain("SelectLabel");
    expect(content).toMatch(/groupDocumentTypesByCategory\(documentTypes\)/);
  });

  it("unions.tsx Documents tab groups documents by category", () => {
    const file = join(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    // The documents tab must call groupDocumentTypesByCategory on the
    // union's document types + render category headings.
    expect(content).toMatch(/groupDocumentTypesByCategory\(allRequiredTypes\)/);
  });
});

// =============================================================================
// 7. Null-union officer gets nothing from search (integration check)
// =============================================================================

describe("IA-3: null-union officer gets nothing from search", () => {
  it("an officer with null union gets scope.kind='none' → search returns 403", () => {
    // This is a static check that the search route's 403 branch exists +
    // getUnionScope returns "none" for null. The runtime test is in
    // step8-officer-null-union-test.ts.
    const scope = getUnionScope({ role: "OFFICER", assignedUnionId: null });
    expect(scope.kind).toBe("none");

    const file = join(SRC_ROOT, "src/app/api/search/route.ts");
    const content = readFileSync(file, "utf-8");
    // The route must check scope.kind === "none" + return 403.
    expect(content).toMatch(/scope\.kind === "none"/);
    expect(content).toMatch(/Forbidden.*not assigned to a union/);
  });

  it("the GlobalSearch palette doesn't crash for an officer with null union", () => {
    // The palette fetches /api/unions which returns 403 for a null-union
    // officer. The palette's .then((r) => r.ok ? r.json() : null) handles
    // this gracefully — it just shows no results.
    const file = join(SRC_ROOT, "src/components/app/global-search.tsx");
    const content = readFileSync(file, "utf-8");
    // The fetch handler must check r.ok before parsing JSON.
    expect(content).toMatch(/r\.ok\s*\?\s*r\.json/);
  });
});
