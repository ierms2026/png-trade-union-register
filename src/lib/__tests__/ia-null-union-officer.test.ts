import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getUnionScope } from "@/lib/auth/union-scope";

// =============================================================================
// IA: Null-union officer safety tests.
//
// An officer with assignedUnionId = null gets scope.kind = "none" from
// getUnionScope. Every scoped endpoint must return 403 (or empty data for
// /api/tasks which has a different scoping pattern). The UI must show a
// friendly "no union assigned" screen, not an error.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");

describe("IA: null-union officer scope", () => {
  it("getUnionScope returns { kind: 'none' } for officer with null union", () => {
    expect(getUnionScope({ role: "OFFICER", assignedUnionId: null })).toEqual({ kind: "none" });
  });

  it("getUnionScope returns { kind: 'none' } for officer with empty string union", () => {
    expect(getUnionScope({ role: "OFFICER", assignedUnionId: "" })).toEqual({ kind: "none" });
  });

  it("getUnionScope returns { kind: 'none' } for officer with whitespace union", () => {
    expect(getUnionScope({ role: "OFFICER", assignedUnionId: "   " })).toEqual({ kind: "none" });
  });
});

describe("IA: scoped endpoints use getUnionScope (null-union officer gets 403)", () => {
  const endpoints = [
    "src/app/api/unions/route.ts",
    "src/app/api/compliance/route.ts",
    "src/app/api/dashboard/stats/route.ts",
    "src/app/api/search/route.ts",
    "src/app/api/export/compliance-report/route.ts",
    "src/app/api/export/stats/route.ts",
  ];

  for (const file of endpoints) {
    it(`${file} uses getUnionScope + returns 403 for scope.kind="none"`, () => {
      const src = readFileSync(resolve(SRC_ROOT, file), "utf-8");
      expect(src).toContain("getUnionScope");
      expect(src).toMatch(/scope\.kind === "none"[\s\S]*?403/);
    });
  }
});

describe("IA: /api/tasks returns empty (not 403) for null-union officer", () => {
  it("the tasks route uses a different scoping pattern (OR with assigneeId=self)", () => {
    const src = readFileSync(
      resolve(SRC_ROOT, "src/app/api/tasks/route.ts"),
      "utf-8",
    );
    // The tasks route doesn't use getUnionScope — it uses OR: [{ unionId }, { assigneeId: self }]
    // A null-union officer gets OR: [{ assigneeId: self }] which returns only
    // tasks assigned to them (none, since they have no assigned tasks). This is
    // safe — no other union's data is leaked.
    expect(src).toContain("assigneeId");
    expect(src).toMatch(/OR:\s*\[/);
  });
});

describe("IA: DashboardView shows friendly 'no union assigned' screen", () => {
  it("dashboard.tsx has the null-union officer check", () => {
    const src = readFileSync(
      resolve(SRC_ROOT, "src/components/app/views/dashboard.tsx"),
      "utf-8",
    );
    expect(src).toContain('user.role === "OFFICER" && !user.assignedUnionId');
    expect(src).toContain("No union assigned");
    expect(src).toContain("contact the Industrial Registrar");
  });

  it("the friendly screen includes a Help & Guide button", () => {
    const src = readFileSync(
      resolve(SRC_ROOT, "src/components/app/views/dashboard.tsx"),
      "utf-8",
    );
    expect(src).toContain('onNavigate("help")');
    expect(src).toContain("View Help");
  });

  it("the user prop type includes assignedUnionId", () => {
    const src = readFileSync(
      resolve(SRC_ROOT, "src/components/app/views/dashboard.tsx"),
      "utf-8",
    );
    expect(src).toMatch(/assignedUnionId\?:\s*string \| null/);
  });
});

describe("IA: /demo production mode shows no password", () => {
  it("the demo page source does NOT contain the literal credential string", () => {
    const src = readFileSync(
      resolve(SRC_ROOT, "src/app/demo/page.tsx"),
      "utf-8",
    );
    expect(src).not.toContain("Test!");
  });

  it("the demo page checks NODE_ENV === 'production'", () => {
    const src = readFileSync(
      resolve(SRC_ROOT, "src/app/demo/page.tsx"),
      "utf-8",
    );
    expect(src).toContain("NODE_ENV");
    expect(src).toContain('"production"');
    expect(src).toMatch(/isProduction/);
  });

  it("the demo page has a production-mode 'not available' message", () => {
    const src = readFileSync(
      resolve(SRC_ROOT, "src/app/demo/page.tsx"),
      "utf-8",
    );
    expect(src).toContain("not available in production");
  });
});

describe("IA: no invented document names in source or docs", () => {
  const inventedNames = [
    "meeting minutes",
    "bylaws",
    "annual return",
    "financial statement",
  ];

  // Files to check (excluding test fixtures which may use old names in
  // comments describing what was fixed)
  const checkFiles = [
    "src/app/demo/page.tsx",
    "src/components/app/views/help-guide.tsx",
    "src/components/app/views/unions.tsx",
    "src/components/app/views/compliance.tsx",
    "src/components/app/views/dashboard.tsx",
    "src/lib/dashboard/vocabulary.ts",
    "src/lib/dashboard/content-definitions.ts",
    "src/lib/file-validation.ts",
    "src/app/api/search/route.ts",
    "src/app/api/compliance/rules/preview/route.ts",
    "docs/CONTENT.md",
    "STAKEHOLDER-TEST-SCRIPT.md",
  ];

  for (const name of inventedNames) {
    it(`"${name}" does not appear in user-facing source or docs`, () => {
      let found = false;
      for (const file of checkFiles) {
        try {
          const src = readFileSync(resolve(SRC_ROOT, file), "utf-8");
          if (src.toLowerCase().includes(name)) {
            console.error(`  FOUND in ${file}: "${name}"`);
            found = true;
          }
        } catch {
          // file may not exist
        }
      }
      expect(found).toBe(false);
    });
  }
});
