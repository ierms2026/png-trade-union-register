import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  NAV_STRUCTURE,
  STANDALONE_NAV_ITEMS,
  getNavForRole,
  getStandaloneNavItems,
} from "../dashboard/nav-structure";

// =============================================================================
// IA rendered-nav tests (static source-text + config assertions).
//
// These tests verify the nav structure that the SidebarNav component renders.
// They check the config (NAV_STRUCTURE) + the source of app-shell.tsx to
// confirm the sidebar renders group headings + destination buttons with the
// correct labels per role.
// =============================================================================

const projectRoot = resolve(__dirname, "../../..");
const appShellSrc = readFileSync(
  resolve(projectRoot, "src/components/app/app-shell.tsx"),
  "utf-8",
);

describe("IA: nav structure per role", () => {
  describe("REGISTRAR", () => {
    const nav = getNavForRole("REGISTRAR", true);
    const allItems = nav.flatMap((g) => g.destinations.map((d) => d.label));
    const standalone = getStandaloneNavItems("REGISTRAR").map((d) => d.label);
    const everything = [...allItems, ...standalone];

    it("sees all 6 groups + Help & Guide", () => {
      const groups = nav.map((g) => g.label);
      expect(groups).toEqual([
        "Dashboard",
        "Registry",
        "Compliance",
        "Work",
        "Review & Audit",
        "Administration",
      ]);
      expect(standalone).toContain("Help & Guide");
    });

    it("sees Retention & Disposal under Review & Audit", () => {
      const reviewAudit = nav.find((g) => g.label === "Review & Audit");
      expect(reviewAudit).toBeDefined();
      expect(reviewAudit!.destinations.map((d) => d.label)).toContain("Retention & Disposal");
    });

    it("sees Access Monitoring (not 'Security')", () => {
      expect(everything).toContain("Access Monitoring");
      expect(everything).not.toContain("Security");
    });

    it("sees the expected items", () => {
      expect(everything).toEqual([
        "Dashboard",
        "Unions", "Documents",
        "Compliance",
        "Tasks", "Calendar",
        "Retention & Disposal", "Review Queue", "Contact Updates", "Audit Log", "Search",
        "Users", "Access Monitoring", "API Keys", "Webhooks", "Resources",
        "Help & Guide",
      ]);
    });

    it("has 17 total items with retention enabled", () => {
      expect(everything).toHaveLength(17);
    });
  });

  describe("INSPECTOR", () => {
    const nav = getNavForRole("INSPECTOR", true);
    const allItems = nav.flatMap((g) => g.destinations.map((d) => d.label));
    const standalone = getStandaloneNavItems("INSPECTOR").map((d) => d.label);
    const everything = [...allItems, ...standalone];

    it("sees 5 groups (no Administration) + Help & Guide", () => {
      const groups = nav.map((g) => g.label);
      expect(groups).toEqual([
        "Dashboard",
        "Registry",
        "Compliance",
        "Work",
        "Review & Audit",
      ]);
      expect(groups).not.toContain("Administration");
      expect(standalone).toContain("Help & Guide");
    });

    it("sees Retention & Disposal under Review & Audit (reject-only — server enforces)", () => {
      const reviewAudit = nav.find((g) => g.label === "Review & Audit");
      expect(reviewAudit).toBeDefined();
      expect(reviewAudit!.destinations.map((d) => d.label)).toContain("Retention & Disposal");
    });

    it("does NOT see Review Queue or Contact Updates (Registrar-only)", () => {
      expect(everything).not.toContain("Review Queue");
      expect(everything).not.toContain("Contact Updates");
    });

    it("does NOT see any Administration items", () => {
      expect(everything).not.toContain("Users");
      expect(everything).not.toContain("Access Monitoring");
      expect(everything).not.toContain("API Keys");
      expect(everything).not.toContain("Webhooks");
      expect(everything).not.toContain("Resources");
    });

    it("has 10 total items with retention enabled", () => {
      expect(everything).toHaveLength(10);
    });
  });

  describe("OFFICER (Union Official)", () => {
    const nav = getNavForRole("OFFICER", true);
    const allItems = nav.flatMap((g) => g.destinations.map((d) => d.label));
    const standalone = getStandaloneNavItems("OFFICER").map((d) => d.label);
    const everything = [...allItems, ...standalone];

    it("sees 4 groups (no Review & Audit, no Administration) + Help & Guide", () => {
      const groups = nav.map((g) => g.label);
      expect(groups).toEqual([
        "Dashboard",
        "Registry",
        "Compliance",
        "Work",
      ]);
      expect(groups).not.toContain("Review & Audit");
      expect(groups).not.toContain("Administration");
      expect(standalone).toContain("Help & Guide");
    });

    it("sees My Union (not Unions)", () => {
      expect(everything).toContain("My Union");
      expect(everything).not.toContain("Unions");
    });

    it("does NOT see Retention & Disposal", () => {
      expect(everything).not.toContain("Retention & Disposal");
    });

    it("has exactly 7 items", () => {
      expect(everything).toEqual([
        "Dashboard",
        "My Union", "Documents",
        "Compliance",
        "Tasks", "Calendar",
        "Help & Guide",
      ]);
      expect(everything).toHaveLength(7);
    });
  });
});

describe("IA: SidebarNav renders group headings + destination buttons", () => {
  it("app-shell.tsx contains a nav with aria-label='Main navigation'", () => {
    expect(appShellSrc).toContain('aria-label="Main navigation"');
  });

  it("SidebarNav renders group headings as h3", () => {
    expect(appShellSrc).toMatch(/<h3[^>]*>/);
    expect(appShellSrc).toMatch(/\{group\.label\}/);
  });

  it("SidebarNav renders destination buttons with the label text", () => {
    expect(appShellSrc).toMatch(/\{.*\.label\}.*<\/span>/);
  });
});

describe("IA: nonsense view falls through to Dashboard", () => {
  it("page.tsx default case renders DashboardView", () => {
    const pageSrc = readFileSync(
      resolve(projectRoot, "src/app/page.tsx"),
      "utf-8",
    );
    // The switch has a default case that renders DashboardView
    expect(pageSrc).toMatch(/default:\s*return\s*\(\s*<DashboardView/);
  });
});

describe("IA: pre-IA-1 items still present", () => {
  it("Review Queue exists (REGISTRAR only, Review & Audit group)", () => {
    const dest = NAV_STRUCTURE
      .flatMap((g) => g.destinations.map((d) => ({ group: g.label, ...d })))
      .find((d) => d.route === "reviews");
    expect(dest).toBeDefined();
    expect(dest!.group).toBe("Review & Audit");
    expect(dest!.roles).toEqual(["REGISTRAR"]);
    expect(dest!.label).toBe("Review Queue");
  });

  it("Contact Updates exists (REGISTRAR only, Review & Audit group)", () => {
    const dest = NAV_STRUCTURE
      .flatMap((g) => g.destinations.map((d) => ({ group: g.label, ...d })))
      .find((d) => d.route === "contact-requests");
    expect(dest).toBeDefined();
    expect(dest!.group).toBe("Review & Audit");
    expect(dest!.roles).toEqual(["REGISTRAR"]);
  });

  it("Webhooks exists (REGISTRAR only, Administration group)", () => {
    const dest = NAV_STRUCTURE
      .flatMap((g) => g.destinations.map((d) => ({ group: g.label, ...d })))
      .find((d) => d.route === "webhooks");
    expect(dest).toBeDefined();
    expect(dest!.group).toBe("Administration");
    expect(dest!.roles).toEqual(["REGISTRAR"]);
  });

  it("Resources exists (REGISTRAR only, Administration group)", () => {
    const dest = NAV_STRUCTURE
      .flatMap((g) => g.destinations.map((d) => ({ group: g.label, ...d })))
      .find((d) => d.route === "legislation");
    expect(dest).toBeDefined();
    expect(dest!.group).toBe("Administration");
    expect(dest!.roles).toEqual(["REGISTRAR"]);
    expect(dest!.label).toBe("Resources");
  });

  it("Help & Guide exists (standalone, all roles)", () => {
    const dest = STANDALONE_NAV_ITEMS.find((d) => d.route === "help");
    expect(dest).toBeDefined();
    expect(dest!.label).toBe("Help & Guide");
    expect(dest!.roles).toEqual(["REGISTRAR", "INSPECTOR", "OFFICER"]);
  });

  it("Search exists (REGISTRAR+INSPECTOR, Review & Audit group)", () => {
    const dest = NAV_STRUCTURE
      .flatMap((g) => g.destinations.map((d) => ({ group: g.label, ...d })))
      .find((d) => d.route === "search");
    expect(dest).toBeDefined();
    expect(dest!.group).toBe("Review & Audit");
    expect(dest!.roles).toEqual(["REGISTRAR", "INSPECTOR"]);
  });
});

describe("IA: Union Official Documents screen shows only their own union", () => {
  it("/api/unions uses getUnionScope (server-side scoping)", () => {
    const routeSrc = readFileSync(
      resolve(projectRoot, "src/app/api/unions/route.ts"),
      "utf-8",
    );
    expect(routeSrc).toContain("getUnionScope");
    // Officer with scope.kind="union" gets where: { id: scope.unionId }
    expect(routeSrc).toMatch(/scope\.kind === "union"[\s\S]*?id:\s*scope\.unionId/);
  });

  it("the UnionsView component renders unions from /api/unions (server-scoped)", () => {
    const unionsSrc = readFileSync(
      resolve(projectRoot, "src/components/app/views/unions.tsx"),
      "utf-8",
    );
    expect(unionsSrc).toContain('"/api/unions"');
  });
});
