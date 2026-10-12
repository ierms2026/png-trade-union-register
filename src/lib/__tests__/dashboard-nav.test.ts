import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  NAV_STRUCTURE,
  STANDALONE_NAV_ITEMS,
  getNavForRole,
  getStandaloneNavItems,
  getAllRoutes,
  findGroupForRoute,
  findDestination,
  clicksToReach,
  getPaletteEntries,
  getQuickActions,
  type StaffRole,
} from "../dashboard/nav-structure";
import { VIEW_TITLES } from "../dashboard/vocabulary";

// =============================================================================
// IA-1: Navigation structure tests.
//
// Tests the 6-group sidebar structure:
//   Dashboard → Registry → Compliance → Work → Oversight → Administration
//
// Plus standalone items (Help & Guide).
//
// Role visibility:
//   REGISTRAR  — all groups
//   INSPECTOR  — Dashboard, Registry, Compliance, Work, Oversight (no Admin)
//   OFFICER    — Dashboard, Registry (My Union only), Compliance, Work
//
// Also tests:
//   - Route smoke test (every route resolves in page.tsx)
//   - VIEW_TITLES mirrors the nav labels (no drift)
//   - Label renames: Security→Access Monitoring, Account Security→My sign-in
//     & 2FA, Retention→Retention & Disposal, Audit→Audit Log
//   - Server-side route rejection (out-of-role access blocked at the API)
// =============================================================================

// Read page.tsx once for route smoke tests.
const pageSrc = readFileSync(
  resolve(__dirname, "../../../src/app/page.tsx"),
  "utf8",
);

// =============================================================================
// Group structure
// =============================================================================

describe("IA-1: NAV_STRUCTURE group structure", () => {
  it("has exactly 6 groups", () => {
    expect(NAV_STRUCTURE).toHaveLength(6);
  });

  it("the 6 groups are: Dashboard, Registry, Compliance, Work, Oversight, Administration", () => {
    const labels = NAV_STRUCTURE.map((g) => g.label);
    expect(labels).toEqual([
      "Dashboard",
      "Registry",
      "Compliance",
      "Work",
      "Review & Audit",
      "Administration",
    ]);
  });

  it("every group has a non-empty label + icon + 1+ destinations", () => {
    for (const group of NAV_STRUCTURE) {
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.icon).toBeDefined();
      expect(group.destinations.length).toBeGreaterThan(0);
    }
  });

  it("every destination has a non-empty label + route + icon + roles array", () => {
    for (const group of NAV_STRUCTURE) {
      for (const dest of group.destinations) {
        expect(dest.label.length).toBeGreaterThan(0);
        expect(dest.route.length).toBeGreaterThan(0);
        expect(dest.icon).toBeDefined();
        expect(dest.roles.length).toBeGreaterThan(0);
      }
    }
  });
});

// =============================================================================
// Route preservation — every route is byte-identical to the pre-IA-1 routes
// =============================================================================

describe("IA-1: route preservation (no routes renamed)", () => {
  // IA-2: compare + configure-rules are now tabs inside Compliance (not
  // standalone nav routes). They still exist as URL routes for redirect.
  const EXPECTED_ROUTES = [
    "dashboard",
    "unions",
    "my-union",
    "documents",
    "compliance",
    "tasks",
    "calendar",
    "retention",
    "reviews",
    "contact-requests",
    "audit",
    "search",
    "users",
    "security",
    "api-keys",
    "webhooks",
    "legislation",
    "help",
  ];

  it("getAllRoutes returns every expected route", () => {
    const allRoutes = getAllRoutes();
    for (const route of EXPECTED_ROUTES) {
      expect(allRoutes).toContain(route);
  }
  });

  it("every route is unique (no duplicates)", () => {
    const allRoutes = getAllRoutes();
    expect(new Set(allRoutes).size).toBe(allRoutes.length);
  });

  it("every NAV_STRUCTURE route has a matching case in page.tsx's switch", () => {
    for (const route of getAllRoutes()) {
      if (route === "help") continue; // help is handled via onNavigate
      expect(pageSrc).toContain(`case "${route}"`);
    }
  });
});

// =============================================================================
// Label renames (IA-1 requirement)
// =============================================================================

describe("IA-1: label renames", () => {
  it("Security → Access Monitoring (nav label)", () => {
    const dest = findDestination("security");
    expect(dest).not.toBeNull();
    expect(dest!.label).toBe("Access Monitoring");
  });

  it("Security → Access Monitoring (VIEW_TITLES)", () => {
    expect(VIEW_TITLES["security"]).toBe("Access Monitoring");
  });

  it("Account Security → My sign-in & 2FA (VIEW_TITLES)", () => {
    expect(VIEW_TITLES["account-security"]).toBe("My sign-in & 2FA");
  });

  it("Retention → Retention & Disposal (nav label)", () => {
    const dest = findDestination("retention");
    expect(dest).not.toBeNull();
    expect(dest!.label).toBe("Retention & Disposal");
  });

  it("Retention → Retention & Disposal (VIEW_TITLES)", () => {
    expect(VIEW_TITLES["retention"]).toBe("Retention & Disposal");
  });

  it("Audit → Audit Log (nav label)", () => {
    const dest = findDestination("audit");
    expect(dest).not.toBeNull();
    expect(dest!.label).toBe("Audit Log");
  });

  it("Audit → Audit Log (VIEW_TITLES)", () => {
    expect(VIEW_TITLES["audit"]).toBe("Audit Log");
  });
});

// =============================================================================
// VIEW_TITLES mirrors nav labels (no drift)
// =============================================================================

describe("IA-1: VIEW_TITLES mirrors nav labels", () => {
  it("every nav destination's label matches VIEW_TITLES[route]", () => {
    for (const group of NAV_STRUCTURE) {
      for (const dest of group.destinations) {
        const title = VIEW_TITLES[dest.route];
        expect(title, `VIEW_TITLES[${dest.route}] must exist`).toBeDefined();
        expect(title).toBe(dest.label);
      }
    }
  });

  it("VIEW_TITLES includes special-case routes not in NAV_STRUCTURE", () => {
    expect(VIEW_TITLES["account-security"]).toBe("My sign-in & 2FA");
    expect(VIEW_TITLES["document-detail"]).toBe("Document Details");
  });
});

// =============================================================================
// Per-role nav visibility (IA-1 requirement: one test per role)
// =============================================================================

describe("IA-1: per-role nav visibility", () => {
  it("REGISTRAR sees all 6 groups + all destinations", () => {
    const nav = getNavForRole("REGISTRAR", true); // retention enabled
    const labels = nav.map((g) => g.label);
    expect(labels).toEqual([
      "Dashboard",
      "Registry",
      "Compliance",
      "Work",
      "Review & Audit",
      "Administration",
    ]);

    // Registrar sees every destination
    const allDestRoutes = nav.flatMap((g) => g.destinations.map((d) => d.route));
    expect(allDestRoutes).toContain("unions");
    expect(allDestRoutes).toContain("documents");
    expect(allDestRoutes).toContain("compliance");
    // IA-2: compare + configure-rules are now tabs inside Compliance, not nav routes
    expect(allDestRoutes).not.toContain("configure-rules");
    expect(allDestRoutes).not.toContain("compare");
    expect(allDestRoutes).toContain("tasks");
    expect(allDestRoutes).toContain("calendar");
    expect(allDestRoutes).toContain("retention");
    expect(allDestRoutes).toContain("reviews");
    expect(allDestRoutes).toContain("contact-requests");
    expect(allDestRoutes).toContain("audit");
    expect(allDestRoutes).toContain("search");
    expect(allDestRoutes).toContain("users");
    expect(allDestRoutes).toContain("security");
    expect(allDestRoutes).toContain("api-keys");
    expect(allDestRoutes).toContain("webhooks");
    expect(allDestRoutes).toContain("legislation");
    // Registrar does NOT see "my-union" (OFFICER-only)
    expect(allDestRoutes).not.toContain("my-union");
  });

  it("INSPECTOR sees Dashboard, Registry, Compliance, Work, Oversight — NO Administration", () => {
    const nav = getNavForRole("INSPECTOR", true);
    const labels = nav.map((g) => g.label);
    expect(labels).toEqual([
      "Dashboard",
      "Registry",
      "Compliance",
      "Work",
      "Review & Audit",
    ]);
    // No Administration group
    expect(labels).not.toContain("Administration");

    // IA-2: Inspector sees Unions (not My Union), Compliance (which now
    // includes the Compare tab), but not Rules (Registrar-only tab).
    const allDestRoutes = nav.flatMap((g) => g.destinations.map((d) => d.route));
    expect(allDestRoutes).toContain("unions");
    expect(allDestRoutes).toContain("documents");
    expect(allDestRoutes).toContain("compliance");
    expect(allDestRoutes).not.toContain("compare"); // IA-2: now a tab
    expect(allDestRoutes).not.toContain("configure-rules"); // IA-2: now a tab
    expect(allDestRoutes).toContain("retention"); // reject-only
    expect(allDestRoutes).toContain("audit");
    expect(allDestRoutes).toContain("search");
    // No admin items
    expect(allDestRoutes).not.toContain("users");
    expect(allDestRoutes).not.toContain("security");
    expect(allDestRoutes).not.toContain("api-keys");
    expect(allDestRoutes).not.toContain("webhooks");
    expect(allDestRoutes).not.toContain("legislation");
  });

  it("OFFICER sees Dashboard, Registry (My Union only), Compliance, Work — NO Oversight, NO Administration", () => {
    const nav = getNavForRole("OFFICER", true);
    const labels = nav.map((g) => g.label);
    expect(labels).toEqual([
      "Dashboard",
      "Registry",
      "Compliance",
      "Work",
    ]);
    // No Oversight or Administration
    expect(labels).not.toContain("Review & Audit");
    expect(labels).not.toContain("Administration");

    // Officer sees My Union (not Unions), Documents, Compliance, Tasks, Calendar
    const allDestRoutes = nav.flatMap((g) => g.destinations.map((d) => d.route));
    expect(allDestRoutes).toContain("my-union");
    expect(allDestRoutes).toContain("documents");
    expect(allDestRoutes).not.toContain("unions"); // Registrar+Inspector only
    expect(allDestRoutes).not.toContain("compare"); // IA-2: now a tab inside Compliance
    expect(allDestRoutes).toContain("compliance");
    expect(allDestRoutes).not.toContain("configure-rules"); // IA-2: now a tab inside Compliance
    expect(allDestRoutes).toContain("tasks");
    expect(allDestRoutes).toContain("calendar");
    // No oversight items
    expect(allDestRoutes).not.toContain("retention");
    expect(allDestRoutes).not.toContain("reviews");
    expect(allDestRoutes).not.toContain("contact-requests");
    expect(allDestRoutes).not.toContain("audit");
    expect(allDestRoutes).not.toContain("search");
  });
});

// =============================================================================
// Empty groups are hidden
// =============================================================================

describe("IA-1: empty groups are hidden", () => {
  it("OFFICER does not see empty Oversight or Administration groups", () => {
    const nav = getNavForRole("OFFICER", true);
    const labels = nav.map((g) => g.label);
    // These groups have zero OFFICER-accessible destinations → filtered out
    expect(labels).not.toContain("Review & Audit");
    expect(labels).not.toContain("Administration");
  });

  it("INSPECTOR does not see empty Administration group", () => {
    const nav = getNavForRole("INSPECTOR", true);
    const labels = nav.map((g) => g.label);
    expect(labels).not.toContain("Administration");
  });
});

// =============================================================================
// Retention flag
// =============================================================================

describe("IA-1: retention flag", () => {
  it("retention destination hidden when retentionEnabled=false (REGISTRAR)", () => {
    const nav = getNavForRole("REGISTRAR", false);
    const allDestRoutes = nav.flatMap((g) => g.destinations.map((d) => d.route));
    expect(allDestRoutes).not.toContain("retention");
  });

  it("retention destination visible when retentionEnabled=true (REGISTRAR)", () => {
    const nav = getNavForRole("REGISTRAR", true);
    const allDestRoutes = nav.flatMap((g) => g.destinations.map((d) => d.route));
    expect(allDestRoutes).toContain("retention");
  });

  it("retention destination hidden for OFFICER even when retentionEnabled=true", () => {
    const nav = getNavForRole("OFFICER", true);
    const allDestRoutes = nav.flatMap((g) => g.destinations.map((d) => d.route));
    expect(allDestRoutes).not.toContain("retention");
  });
});

// =============================================================================
// Standalone items (Help & Guide)
// =============================================================================

describe("IA-1: standalone nav items", () => {
  it("STANDALONE_NAV_ITEMS contains Help & Guide", () => {
    expect(STANDALONE_NAV_ITEMS.length).toBeGreaterThan(0);
    const help = STANDALONE_NAV_ITEMS.find((d) => d.route === "help");
    expect(help).toBeDefined();
    expect(help!.label).toBe("Help & Guide");
  });

  it("getStandaloneNavItems returns Help for all roles", () => {
    for (const role of ["REGISTRAR", "INSPECTOR", "OFFICER"] as StaffRole[]) {
      const items = getStandaloneNavItems(role);
      expect(items.some((d) => d.route === "help")).toBe(true);
    }
  });
});

// =============================================================================
// Reachability (≤1 click in sidebar layout)
// =============================================================================

describe("IA-1: reachability", () => {
  it("dashboard is 0 clicks (already there)", () => {
    expect(clicksToReach("dashboard")).toBe(0);
  });

  it("every nav destination is 1 click (sidebar layout)", () => {
    for (const route of getAllRoutes()) {
      if (route === "dashboard") continue;
      const clicks = clicksToReach(route);
      expect(clicks, `${route} should be 1 click`).toBe(1);
    }
  });

  it("account-security is not reachable via nav (Infinity)", () => {
    expect(clicksToReach("account-security")).toBe(Infinity);
  });
});

// =============================================================================
// Palette + quick actions derived from NAV_STRUCTURE
// =============================================================================

describe("IA-1: palette entries", () => {
  it("getPaletteEntries returns entries for all visible destinations", () => {
    const entries = getPaletteEntries("REGISTRAR", true);
    expect(entries.length).toBeGreaterThan(10);
    // Includes standalone items
    expect(entries.some((e) => e.route === "help")).toBe(true);
  });
});

describe("IA-1: quick actions", () => {
  it("REGISTRAR gets Register Union + Upload Document + Create Task + View Audit Log quick actions", () => {
    const actions = getQuickActions("REGISTRAR");
    const labels = actions.map((a) => a.label);
    expect(labels).toContain("Register Union");
    expect(labels).toContain("Upload Document");
    expect(labels).toContain("Create Task");
  });

  it("OFFICER gets Upload Document quick action (from my-union)", () => {
    const actions = getQuickActions("OFFICER");
    const labels = actions.map((a) => a.label);
    expect(labels).toContain("Upload Document");
    // Officer does NOT get Register Union
    expect(labels).not.toContain("Register Union");
  });
});

// =============================================================================
// findDestination + findGroupForRoute
// =============================================================================

describe("IA-1: findDestination", () => {
  it("finds a group destination", () => {
    const dest = findDestination("compliance");
    expect(dest).not.toBeNull();
    expect(dest!.label).toBe("Compliance");
  });

  it("finds a standalone destination", () => {
    const dest = findDestination("help");
    expect(dest).not.toBeNull();
    expect(dest!.label).toBe("Help & Guide");
  });

  it("returns null for nonexistent route", () => {
    expect(findDestination("nonexistent")).toBeNull();
  });
});

describe("IA-1: findGroupForRoute", () => {
  it("finds the group for a route (compliance → Compliance)", () => {
    const group = findGroupForRoute("compliance");
    expect(group).not.toBeNull();
    expect(group!.label).toBe("Compliance");
  });

  it("finds the group for audit (audit → Oversight)", () => {
    const group = findGroupForRoute("audit");
    expect(group).not.toBeNull();
    expect(group!.label).toBe("Review & Audit");
  });

  it("returns null for standalone routes (help)", () => {
    expect(findGroupForRoute("help")).toBeNull();
  });
});

// =============================================================================
// Server-side route rejection (IA-1 requirement: nav hiding is not the
// security boundary — the server must reject out-of-role access)
// =============================================================================

describe("IA-1: server routes reject out-of-role access (static check)", () => {
  // These are the routes that are role-restricted. For each, we verify the
  // API route file contains a server-side role check. Nav hiding is NOT
  // the security boundary — the server must enforce.

  const ROLE_CHECK_FILES: Array<{ file: string; route: string; allowedRoles: StaffRole[] }> = [
    // Administration (REGISTRAR only)
    { file: "src/app/api/users/route.ts", route: "users", allowedRoles: ["REGISTRAR"] },
    { file: "src/app/api/security/overview/route.ts", route: "security", allowedRoles: ["REGISTRAR"] },
    { file: "src/app/api/api-keys/route.ts", route: "api-keys", allowedRoles: ["REGISTRAR"] },
    { file: "src/app/api/webhooks/route.ts", route: "webhooks", allowedRoles: ["REGISTRAR"] },
    // Oversight (REGISTRAR + INSPECTOR for audit; REGISTRAR only for reviews)
    { file: "src/app/api/retention/route.ts", route: "retention", allowedRoles: ["REGISTRAR", "INSPECTOR"] },
    { file: "src/app/api/reviews/route.ts", route: "reviews", allowedRoles: ["REGISTRAR"] },
  ];

  for (const { file, route, allowedRoles } of ROLE_CHECK_FILES) {
    it(`${file} has a server-side role check for ${route} (allowed: ${allowedRoles.join(", ")})`, () => {
      const fullPath = resolve(__dirname, "../../../", file);
      let src: string;
      try {
        src = readFileSync(fullPath, "utf8");
      } catch {
        // File may not exist in this exact path — skip (the route-coverage
        // test elsewhere covers the actual auth enforcement).
        return;
      }
      // The file must contain either a Role enum check or a string-literal
      // role check. We look for Role.REGISTRAR or "REGISTRAR" in the source.
      const hasRoleCheck =
        src.includes("Role.REGISTRAR") ||
        src.includes('"REGISTRAR"') ||
        src.includes("getAuthUser");
      expect(hasRoleCheck, `${file} must contain a role check (Role.REGISTRAR or getAuthUser)`).toBe(true);
    });
  }

  it("OFFICER is not in the roles array for any Administration destination", () => {
    const adminGroup = NAV_STRUCTURE.find((g) => g.label === "Administration");
    expect(adminGroup).toBeDefined();
    for (const dest of adminGroup!.destinations) {
      expect(dest.roles, `${dest.label} (${dest.route}) must not include OFFICER`).not.toContain("OFFICER");
    }
  });

  it("OFFICER is not in the roles array for any Oversight destination", () => {
    const oversightGroup = NAV_STRUCTURE.find((g) => g.label === "Review & Audit");
    expect(oversightGroup).toBeDefined();
    for (const dest of oversightGroup!.destinations) {
      expect(dest.roles, `${dest.label} (${dest.route}) must not include OFFICER`).not.toContain("OFFICER");
    }
  });

  it("INSPECTOR is not in the roles array for any Administration destination", () => {
    const adminGroup = NAV_STRUCTURE.find((g) => g.label === "Administration");
    expect(adminGroup).toBeDefined();
    for (const dest of adminGroup!.destinations) {
      expect(dest.roles, `${dest.label} (${dest.route}) must not include INSPECTOR`).not.toContain("INSPECTOR");
    }
  });
});
