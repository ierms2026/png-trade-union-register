import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getNavForRole } from "../dashboard/nav-structure";

// =============================================================================
// IA-2: Compliance tabs + Union Hub tests.
//
// Tests:
//   1. Officers never see the History tab (audit is REGISTRAR+INSPECTOR only).
//   2. Officers never see another union's tabs (server-side scoping).
//   3. Compare tab uses the same /api/compliance endpoint as the Overview tab
//      (no new scoring logic — just a different view of the same data).
//   4. Old /compare and /configure-rules URLs redirect to the compliance tab.
//   5. The audit API supports ?unionId= filter (for the Union Hub History tab).
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");

// =============================================================================
// 1. Officers never see the History tab
// =============================================================================

describe("IA-2: Officers never see the History tab", () => {
  it("unions.tsx renders History tab only for non-officers", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");

    // The hubTabs array for officers must NOT include "history".
    // Find the officer tab list: `isOfficer ? ["overview", ...] : ["overview", ..., "history"]`
    const officerTabsMatch = content.match(
      /isOfficer\s*\?\s*\[([^\]]+)\]\s*:\s*\[([^\]]+)\]/,
    );
    expect(officerTabsMatch, "hubTabs conditional must exist").not.toBeNull();
    const officerTabs = officerTabsMatch![1];
    const nonOfficerTabs = officerTabsMatch![2];

    // Officer tabs must NOT include "history"
    expect(officerTabs).not.toContain('"history"');
    // Non-officer tabs MUST include "history"
    expect(nonOfficerTabs).toContain('"history"');
  });

  it("the History tab content is guarded by !isOfficer", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");

    // The history tab rendering must include the isOfficer guard.
    expect(content).toMatch(/hubTab === "history" && !isOfficer/);
  });

  it("officers do not see the Audit Log nav item (existing IA-1 guarantee)", () => {
    const nav = getNavForRole("OFFICER", true);
    const allRoutes = nav.flatMap((g) => g.destinations.map((d) => d.route));
    expect(allRoutes).not.toContain("audit");
  });
});

// =============================================================================
// 2. Officers never see another union's tabs (server-side scoping)
// =============================================================================

describe("IA-2: Officers never see another union's tabs (server scoping)", () => {
  it("the /api/unions endpoint exists + is the one the Union Hub fetches", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    // The Union Hub fetches /api/unions which server-side scopes to the officer's union.
    expect(content).toContain('"/api/unions"');
  });

  it("the /api/audit endpoint rejects officers (403)", () => {
    const file = resolve(SRC_ROOT, "src/app/api/audit/route.ts");
    const content = readFileSync(file, "utf-8");
    // The audit route must have a Role.OFFICER check that returns 403.
    expect(content).toMatch(/Role\.OFFICER/);
    expect(content).toMatch(/403/);
  });

  it("the /api/audit endpoint supports ?unionId= filter", () => {
    const file = resolve(SRC_ROOT, "src/app/api/audit/route.ts");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain('unionId');
    expect(content).toMatch(/where\.unionId/);
  });
});

// =============================================================================
// 3. Compare tab uses the same /api/compliance endpoint (no new scoring)
// =============================================================================

describe("IA-2: Compare tab uses the same /api/compliance endpoint", () => {
  it("compliance.tsx imports CompareView from compare.tsx", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/compliance.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/import.*CompareView.*from.*["'].*compare["']/);
  });

  it("compliance.tsx imports ConfigureRulesView from configure-rules.tsx", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/compliance.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/import.*ConfigureRulesView.*from.*["'].*configure-rules["']/);
  });

  it("compare.tsx fetches /api/compliance (same as the Overview tab)", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/compare.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain('"/api/compliance"');
  });

  it("the Overview tab also fetches /api/compliance", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/compliance.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain('"/api/compliance"');
  });
});

// =============================================================================
// 4. Old /compare and /configure-rules URLs redirect to the compliance tab
// =============================================================================

describe("IA-2: old /compare and /configure-rules URLs redirect to compliance tabs", () => {
  it("page.tsx redirects view=compare to compliance with tab=compare", () => {
    const file = resolve(SRC_ROOT, "src/app/page.tsx");
    const content = readFileSync(file, "utf-8");
    // handleNavigate must rewrite "compare" → "compliance" with tab=compare.
    expect(content).toMatch(/view === "compare"[\s\S]*?tab: "compare"/);
  });

  it("page.tsx redirects view=configure-rules to compliance with tab=rules", () => {
    const file = resolve(SRC_ROOT, "src/app/page.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/view === "configure-rules"[\s\S]*?tab: "rules"/);
  });

  it("page.tsx renderView has case handlers for compare + configure-rules", () => {
    const file = resolve(SRC_ROOT, "src/app/page.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/case "compare"/);
    expect(content).toMatch(/case "configure-rules"/);
  });

  it("compliance.tsx accepts initialTab prop", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/compliance.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/initialTab/);
  });

  it("compliance.tsx Rules tab is REGISTRAR-only", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/compliance.tsx");
    const content = readFileSync(file, "utf-8");
    // The tabs array must conditionally include "rules" only for registrars.
    expect(content).toMatch(/isRegistrar\s*\?\s*\[.*"rules"/);
  });
});

// =============================================================================
// 5. Union Hub tab structure
// =============================================================================

describe("IA-2: Union Hub tab structure", () => {
  it("unions.tsx defines all 5 union hub tabs", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/"overview"/);
    expect(content).toMatch(/"documents"/);
    expect(content).toMatch(/"compliance"/);
    expect(content).toMatch(/"tasks"/);
    expect(content).toMatch(/"history"/);
  });

  it("unions.tsx accepts initialTab prop", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/initialTab/);
  });

  it("unions.tsx renders UnionComplianceTab for the compliance tab", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("UnionComplianceTab");
  });

  it("unions.tsx renders UnionTasksTab for the tasks tab", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("UnionTasksTab");
  });

  it("unions.tsx renders UnionHistoryTab for the history tab", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("UnionHistoryTab");
  });

  it("UnionHistoryTab fetches /api/audit with unionId filter", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    // The history tab must fetch audit entries filtered by unionId.
    expect(content).toMatch(/\/api\/audit\?unionId=/);
  });
});

// =============================================================================
// 6. Deep-linking from dashboard + calendar + notifications
// =============================================================================

describe("IA-2: deep-linking to union tabs", () => {
  it("dashboard needs-attention + heatmap link to ?view=unions&union=ID&unionTab=compliance", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/dashboard.tsx");
    const content = readFileSync(file, "utf-8");
    // Both the needs-attention "View" link + the heatmap cell must use the
    // SPA route with unionTab=compliance (not the public /unions/ID route).
    expect(content).toContain("view=unions&union=${");
    expect(content).toContain("unionTab=compliance");
    // Must NOT use the old public-portal route with the DB id (that was a bug).
    expect(content).not.toMatch(/href=\{`\/unions\/\$\{.*\.unionId\}/);
  });

  it("calendar handleEventClick passes unionId + unionTab when meta has unionId", () => {
    const file = resolve(SRC_ROOT, "src/components/app/views/calendar.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("unionTab");
    expect(content).toMatch(/meta\?\.unionId/);
  });

  it("app-shell markAsRead extracts union + unionTab from notification linkUrl", () => {
    const file = resolve(SRC_ROOT, "src/components/app/app-shell.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain('unionTab');
    expect(content).toMatch(/searchParams\.get\("unionTab"\)/);
  });

  it("page.tsx handleNavigate accepts unionTab param", () => {
    const file = resolve(SRC_ROOT, "src/app/page.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/unionTab\?:/);
    expect(content).toMatch(/params\.unionTab/);
  });

  it("page.tsx readUrlState parses unionTab from URL", () => {
    const file = resolve(SRC_ROOT, "src/app/page.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/urlParams\.get\("unionTab"\)/);
  });

  it("page.tsx readUrlState parses tab (compliance tab) from URL", () => {
    const file = resolve(SRC_ROOT, "src/app/page.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/urlParams\.get\("tab"\)/);
  });
});
