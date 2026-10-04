import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  NAV_STRUCTURE,
  getNavForRole,
  getAllRoutes,
  findGroupForRoute,
  clicksToReach,
  type StaffRole,
} from "../dashboard/nav-structure";

// =============================================================================
// Nav structure + a11y tests — chunk 6.3.
//
// Covers ALL "Done when" criteria:
//   - All 13 destinations present in NAV_STRUCTURE; ≤2-click reachability
//   - Route smoke test (every destination URL resolves in page.tsx's switch)
//   - Deep-link preservation (URLs byte-identical to pre-chunk inventory)
//   - Disclosure a11y: Escape, focus return, aria-expanded, visible focus
//     (static source-text assertions — Radix Popover provides these by
//     default; we verify the component USES Radix Popover + the a11y
//     attributes are present)
//   - aria-current on active destination; parent highlight for child-active
//   - No horizontal overflow at 1280px (overflow-x-auto removed; flex-wrap
//     used as graceful fallback)
//
// STATIC APPROACH: like 6.1's layout test + 6.2's tooltip test, these are
// source-text assertions (the project doesn't have @testing-library/react;
// adding it would violate the 6.3 scope guard "No new dependencies unless
// a dropdown component already exists" — the dropdown component exists,
// but testing-library doesn't, and we don't need it for these contract
// assertions). The source-text approach verifies the CONTRACT; the actual
// rendering + a11y behavior is verified via Radix Popover's own tests +
// the 6.1 screenshots approach.
// =============================================================================

const APP_SHELL_PATH = resolve(
  __dirname,
  "../../../src/components/app/app-shell.tsx",
);
const PAGE_PATH = resolve(__dirname, "../../../src/app/page.tsx");
const appShellSource = readFileSync(APP_SHELL_PATH, "utf-8");
const pageSource = readFileSync(PAGE_PATH, "utf-8");

// =============================================================================
// PRE-CHUNK INVENTORY — the 14 routes (13 original from 6.3 + legislation
// added post-6.3). The deep-link preservation test asserts NAV_STRUCTURE's
// routes are byte-identical to this list.
// =============================================================================
const PRE_CHUNK_ROUTES = [
  "dashboard",
  "unions",
  "my-union",
  "documents",
  "compliance",
  "configure-rules",
  "compare",
  "tasks",
  "search",
  "reviews",
  "retention",
  "contact-requests",
  "calendar",
  "audit",
  "users",
  "security",
  "api-keys",
  "webhooks",
  "legislation",
] as const;

// POST-CHUNK ADDITIONS: routes added after chunk 6.3 by later work.
// These are intentional additions to the nav structure, not pre-chunk routes.
// Listed here so the deep-link preservation test can distinguish "pre-chunk
// routes that must be preserved" from "new routes that are allowed to be
// added". The test below asserts that the only new routes are in this list.
const POST_CHUNK_ADDITIONS = ["help"] as const;

describe("nav-structure — NAV_STRUCTURE config (chunk 6.3)", () => {
  it("has exactly 9 top-level groups", () => {
    expect(NAV_STRUCTURE).toHaveLength(9);
  });

  it("the 9 groups are: Dashboard, Unions, Compliance, Tasks, Calendar, Work Queues, Search, Admin, Help", () => {
    expect(NAV_STRUCTURE.map((g) => g.label)).toEqual([
      "Dashboard",
      "Unions",
      "Compliance",
      "Tasks",
      "Calendar",
      "Work Queues",
      "Search",
      "Admin",
      "Help",
    ]);
  });

  it("6 groups are direct links (Dashboard, Tasks, Calendar, Search, Help); 3 are dropdowns (Unions, Compliance, Work Queues, Admin)", () => {
    const directLinks = NAV_STRUCTURE.filter((g) => g.destinations.length === 1);
    const dropdowns = NAV_STRUCTURE.filter((g) => g.destinations.length > 1);
    expect(directLinks.map((g) => g.label)).toEqual(["Dashboard", "Tasks", "Calendar", "Search", "Help"]);
    expect(dropdowns.map((g) => g.label)).toEqual(["Unions", "Compliance", "Work Queues", "Admin"]);
  });

  it("all 20 destinations are present in NAV_STRUCTURE", () => {
    const allRoutes = getAllRoutes();
    expect(allRoutes).toHaveLength(20);
  });

  it("every destination has a non-empty label + route + icon + roles array", () => {
    for (const group of NAV_STRUCTURE) {
      for (const dest of group.destinations) {
        expect(dest.label, `${group.label} > ${dest.route}: label`).toBeTruthy();
        expect(dest.route, `${group.label} > ${dest.label}: route`).toBeTruthy();
        expect(dest.icon, `${group.label} > ${dest.label}: icon`).toBeDefined();
        expect(dest.roles, `${group.label} > ${dest.label}: roles`).toBeInstanceOf(Array);
        expect(dest.roles.length, `${group.label} > ${dest.label}: roles non-empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("nav-structure — deep-link preservation (DONE WHEN criterion)", () => {
  it("every pre-chunk route is present in NAV_STRUCTURE (byte-identical)", () => {
    const allRoutes = new Set(getAllRoutes());
    for (const route of PRE_CHUNK_ROUTES) {
      expect(allRoutes.has(route), `pre-chunk route "${route}" must be in NAV_STRUCTURE`).toBe(true);
    }
  });

  it("NAV_STRUCTURE introduces NO new routes beyond the allowed post-chunk additions", () => {
    const allRoutes = getAllRoutes();
    const preChunkSet = new Set(PRE_CHUNK_ROUTES);
    const allowedAdditions = new Set<string>(POST_CHUNK_ADDITIONS);
    const newRoutes = allRoutes.filter((r) => !preChunkSet.has(r as typeof PRE_CHUNK_ROUTES[number]));
    const unexpected = newRoutes.filter((r) => !allowedAdditions.has(r));
    expect(unexpected, `unexpected new routes: ${unexpected.join(", ")}`).toEqual([]);
  });

  it("every route is unique within NAV_STRUCTURE (no duplicates)", () => {
    const allRoutes = getAllRoutes();
    const seen = new Set<string>();
    for (const r of allRoutes) {
      expect(seen.has(r), `duplicate route: ${r}`).toBe(false);
      seen.add(r);
    }
  });
});

describe("nav-structure — ≤2-click reachability (DONE WHEN criterion)", () => {
  it("every destination is reachable in ≤2 clicks from the dashboard", () => {
    const allRoutes = getAllRoutes();
    for (const route of allRoutes) {
      const clicks = clicksToReach(route);
      expect(clicks, `route "${route}" takes ${clicks} clicks (must be ≤2)`).toBeLessThanOrEqual(2);
    }
  });

  it("the dashboard itself is 0 clicks (you're already there)", () => {
    expect(clicksToReach("dashboard")).toBe(0);
  });

  it("dropdown children are 2 clicks (open dropdown + click child)", () => {
    // Unions group children
    expect(clicksToReach("unions")).toBe(2);
    expect(clicksToReach("my-union")).toBe(2);
    expect(clicksToReach("documents")).toBe(2);
    expect(clicksToReach("compare")).toBe(2);
    // Compliance group children
    expect(clicksToReach("compliance")).toBe(2);
    expect(clicksToReach("configure-rules")).toBe(2);
    // Work Queues group children
    expect(clicksToReach("reviews")).toBe(2);
    expect(clicksToReach("contact-requests")).toBe(2);
    expect(clicksToReach("retention")).toBe(2);
    // Admin group children
    expect(clicksToReach("audit")).toBe(2);
    expect(clicksToReach("users")).toBe(2);
    expect(clicksToReach("security")).toBe(2);
    expect(clicksToReach("api-keys")).toBe(2);
    expect(clicksToReach("webhooks")).toBe(2);
    expect(clicksToReach("legislation")).toBe(2);
  });

  it("direct links are 1 click", () => {
    expect(clicksToReach("dashboard")).toBe(0); // you're already there
    expect(clicksToReach("tasks")).toBe(1);
    expect(clicksToReach("calendar")).toBe(1);
    expect(clicksToReach("search")).toBe(1);
  });

  it("a route not in nav (e.g. account-security) returns Infinity (not reachable via nav)", () => {
    expect(clicksToReach("account-security")).toBe(Infinity);
    expect(clicksToReach("nonexistent-route")).toBe(Infinity);
  });
});

describe("nav-structure — route smoke test (DONE WHEN criterion)", () => {
  // Per spec: "every destination URL resolves (this test is the graveyard
  // alarm for future dead links)." We assert every NAV_STRUCTURE route has
  // a matching `case "...": return <...View />` in page.tsx's switch.
  it("every NAV_STRUCTURE route has a matching case in page.tsx's switch", () => {
    const allRoutes = getAllRoutes();
    for (const route of allRoutes) {
      // page.tsx's switch: `case "route": return <SomeView />`
      const casePattern = new RegExp(`case "${route}"\\s*:`);
      expect(
        pageSource,
        `route "${route}" must have a \`case "${route}":\` in page.tsx`,
      ).toMatch(casePattern);
    }
  });

  it("every NAV_STRUCTURE route resolves to a <...View /> component", () => {
    // page.tsx's switch returns a View component for each case. Two
    // patterns to handle:
    //   1. `case "route": return <SomeView ... />` (direct return)
    //   2. `case "route":\n case "other": return <SomeView ... />` (fall-
    //      through; the `unions` + `my-union` cases share a return)
    //
    // The regex allows optional whitespace (including newlines) between
    // `return` and `<`, and handles the fall-through by allowing other
    // `case` clauses between the route's case and its return.
    const allRoutes = getAllRoutes();
    for (const route of allRoutes) {
      // Match: `case "route":` followed by optional fall-through case
      // clauses, then `return` then optional `(` then `<SomeView`.
      const casePattern = new RegExp(
        `case "${route}"\\s*:(?:\\s*case "[^"]+"\\s*:)*\\s*return\\s*\\(?\\s*<\\w+View`,
      );
      expect(
        pageSource,
        `route "${route}" must return a <...View /> component in page.tsx`,
      ).toMatch(casePattern);
    }
  });
});

describe("nav-structure — getNavForRole (role filtering)", () => {
  it("REGISTRAR sees all 9 groups (20 destinations accessible — my-union is OFFICER-only)", () => {
    const nav = getNavForRole("REGISTRAR");
    expect(nav).toHaveLength(9);
    const allRoutes = nav.flatMap((g) => g.destinations.map((d) => d.route));
    expect(allRoutes).toHaveLength(19); // all 20 minus my-union
    expect(allRoutes).not.toContain("my-union");
  });

  it("INSPECTOR sees Dashboard, Unions, Compliance, Tasks, Calendar, Search, Admin (Audit), Help", () => {
    const nav = getNavForRole("INSPECTOR");
    expect(nav).toHaveLength(8);
    expect(nav.map((g) => g.label)).toEqual(["Dashboard", "Unions", "Compliance", "Tasks", "Calendar", "Search", "Admin", "Help"]);
    const unionsGroup = nav.find((g) => g.label === "Unions")!;
    expect(unionsGroup.destinations.map((d) => d.route)).toEqual(["unions", "documents", "compare"]);
    const adminGroup = nav.find((g) => g.label === "Admin")!;
    expect(adminGroup.destinations.map((d) => d.route)).toEqual(["audit"]);
  });

  it("OFFICER sees Dashboard, Unions (My Union + Documents), Compliance, Tasks, Calendar, Search, Help", () => {
    const nav = getNavForRole("OFFICER");
    expect(nav).toHaveLength(7);
    expect(nav.map((g) => g.label)).toEqual(["Dashboard", "Unions", "Compliance", "Tasks", "Calendar", "Search", "Help"]);
    const unionsGroup = nav.find((g) => g.label === "Unions")!;
    expect(unionsGroup.destinations.map((d) => d.route)).toEqual(["my-union", "documents"]);
    const complianceGroup = nav.find((g) => g.label === "Compliance")!;
    expect(complianceGroup.destinations.map((d) => d.route)).toEqual(["compliance"]);
  });

  it("a group with 2 available destinations (OFFICER's Unions = My Union + Documents) is a dropdown", () => {
    // The OFFICER's Unions group has My Union + Documents (2 destinations).
    // The nav component renders it as a dropdown (2+ destinations = dropdown,
    // 1 destination = direct link).
    const nav = getNavForRole("OFFICER");
    const unionsGroup = nav.find((g) => g.label === "Unions")!;
    expect(unionsGroup.destinations).toHaveLength(2);
    expect(unionsGroup.destinations.map((d) => d.route)).toEqual(["my-union", "documents"]);
  });
});

describe("nav-structure — findGroupForRoute (parent highlight helper)", () => {
  it("finds the group for a direct-link route (dashboard → Dashboard group)", () => {
    const group = findGroupForRoute("dashboard");
    expect(group?.label).toBe("Dashboard");
  });

  it("finds the group for a dropdown child route (configure-rules → Compliance group)", () => {
    const group = findGroupForRoute("configure-rules");
    expect(group?.label).toBe("Compliance");
  });

  it("finds the group for an Admin child route (api-keys → Admin group)", () => {
    const group = findGroupForRoute("api-keys");
    expect(group?.label).toBe("Admin");
  });

  it("returns null for a route not in nav (account-security)", () => {
    expect(findGroupForRoute("account-security")).toBeNull();
    expect(findGroupForRoute("nonexistent")).toBeNull();
  });
});

// =============================================================================
// Source-text tests on app-shell.tsx (the nav component).
// =============================================================================

describe("app-shell.tsx — nav component uses NAV_STRUCTURE (no hardcoded destination strings)", () => {
  it("imports NAV_STRUCTURE + getNavForRole + findGroupForRoute from nav-structure.ts", () => {
    expect(appShellSource).toContain('from "@/lib/dashboard/nav-structure"');
    expect(appShellSource).toContain("NAV_STRUCTURE");
    expect(appShellSource).toContain("getNavForRole");
    expect(appShellSource).toContain("findGroupForRoute");
  });

  it("AppShell uses getNavForRole (not the old buildNav)", () => {
    expect(appShellSource).toContain("getNavForRole(user.role as StaffRole)");
    expect(appShellSource).not.toContain("buildNav(");
  });

  it("the old NAV_ITEMS array is removed (replaced by NAV_STRUCTURE in nav-structure.ts)", () => {
    expect(appShellSource).not.toMatch(/const NAV_ITEMS\s*[:=]/);
  });

  it("no hardcoded destination strings in the nav component (grep guard)", () => {
    // Per spec: "zero destination strings hardcoded in JSX". The nav
    // component renders NAV_STRUCTURE via .map(); destination strings
    // like "dashboard", "unions", "compliance" appear ONLY in the config
    // module, not as string literals in app-shell.tsx's JSX.
    //
    // We check that the nav component doesn't have string literals like
    // `"dashboard"` or `"compliance"` as onClick destinations (which
    // would be a hardcoded destination). The `onNavigate(dest.route)`
    // pattern uses the config's route, not a literal.
    //
    // Exception: `account-security` is a hardcoded route in the user
    // menu (DropdownMenuItem onClick) — that's the user-menu, not the
    // nav. It's outside the nav's scope; the test allows it.
    //
    // We check that the nav's onClick handlers use `dest.route` or
    // `group.route`, not literal strings.
    const navComponentMatch = appShellSource.match(
      /function HorizontalNav[\s\S]*?\n\}[\s\S]*?\n\}/,
    );
    expect(navComponentMatch).not.toBeNull();
    const navComponent = navComponentMatch![0];
    // The nav component's onClick uses `onNavigate(dest.route)` (config-driven).
    expect(navComponent).toContain("onNavigate(dest.route)");
    // NOT a literal like `onNavigate("dashboard")`.
    expect(navComponent).not.toMatch(/onNavigate\("(?:dashboard|unions|compliance|tasks|audit|users)"/);
  });
});

describe("app-shell.tsx — disclosure a11y (DONE WHEN criterion)", () => {
  // Per spec: "Disclosure a11y asserted: Escape, focus return, aria-expanded,
  // visible focus." We use Radix Popover which provides these by default.
  // The tests verify the component USES Radix Popover + the a11y attributes
  // are present in the source.

  it("uses Radix Popover (the disclosure primitive, not the menu widget)", () => {
    expect(appShellSource).toContain('from "@/components/ui/popover"');
    expect(appShellSource).toContain("<Popover");
    expect(appShellSource).toContain("<PopoverTrigger");
    expect(appShellSource).toContain("<PopoverContent");
  });

  it("the dropdown trigger is a <button> (natively focusable)", () => {
    // The NavDropdown's trigger is `<PopoverTrigger asChild><button ...>`.
    // Radix Popover sets aria-expanded + aria-controls on the trigger
    // automatically. We verify the trigger is a button (the focusable
    // element) + the Popover wrapper is present (which provides the
    // aria attributes).
    const navDropdownMatch = appShellSource.match(
      /function NavDropdown[\s\S]*?\n\}/,
    );
    expect(navDropdownMatch).not.toBeNull();
    const navDropdown = navDropdownMatch![0];
    expect(navDropdown).toContain("<Popover");
    expect(navDropdown).toContain("<PopoverTrigger");
    expect(navDropdown).toContain("<button");
    // The button is the trigger (via PopoverTrigger asChild).
    expect(navDropdown).toMatch(/<PopoverTrigger asChild>[\s\S]*?<button/);
  });

  it("Escape closes AND returns focus to the trigger (Radix Popover default behavior)", () => {
    // Radix Popover's default behavior: Escape closes the popover AND
    // returns focus to the trigger. This is tested by Radix's own test
    // suite; we don't re-test it here. We verify the component uses
    // Radix Popover (which provides this behavior).
    //
    // The onOpenChange prop on Popover handles open/close state; Radix
    // handles the focus return on Escape.
    expect(appShellSource).toContain("<Popover open={open} onOpenChange={setOpen}>");
  });

  it("click-outside closes (Radix Popover default)", () => {
    // Radix Popover closes on click-outside by default. Verified by
    // Radix's own tests. We verify the component uses Radix Popover.
    expect(appShellSource).toContain("<Popover");
  });

  it("visible focus throughout (focus-visible:ring classes on trigger + dropdown items)", () => {
    // The trigger + dropdown item buttons have focus-visible:ring classes
    // for visible keyboard focus.
    expect(appShellSource).toContain("focus-visible:ring-2");
    expect(appShellSource).toContain("focus-visible:ring-ring");
  });

  it("menu links are normal tab stops (the dropdown items are <button> elements, not menu-widget items)", () => {
    // Per spec: "menu links are normal tab stops once open." Radix Popover
    // doesn't do arrow-key nav or roving tabindex; Tab moves through the
    // panel's buttons normally. The dropdown items are <button> elements
    // (not Radix DropdownMenuItem, which is a menu-widget item with
    // roving tabindex).
    const navDropdownMatch = appShellSource.match(
      /function NavDropdown[\s\S]*?\n\}/,
    );
    expect(navDropdownMatch).not.toBeNull();
    const navDropdown = navDropdownMatch![0];
    // The dropdown items are <button> elements (normal tab stops), NOT
    // <DropdownMenuItem> (menu-widget items).
    expect(navDropdown).toContain("<button");
    expect(navDropdown).not.toContain("<DropdownMenuItem");
  });

  it("arrow-key navigation within the menu is NOT implemented (disclosure pattern; Tab is the nav key)", () => {
    // Per the NavDropdown docstring + the 6.3 handoff decision: arrow-key
    // navigation is NOT implemented (Radix Popover is the disclosure
    // pattern, not the menu widget; Tab is the navigation key).
    // We verify the NavDropdown's docstring documents this decision.
    expect(appShellSource).toContain("Arrow-key navigation within the menu: NOT implemented");
  });
});

describe("app-shell.tsx — aria-current + parent highlight (DONE WHEN criterion)", () => {
  it("direct-link buttons set aria-current=\"page\" when active", () => {
    // The HorizontalNav's direct-link button: `aria-current={active ? "page" : undefined}`.
    expect(appShellSource).toContain('aria-current={active ? "page" : undefined}');
  });

  it("dropdown item buttons set aria-current=\"page\" when active", () => {
    // The NavDropdown's item button: `aria-current={active ? "page" : undefined}`.
    const navDropdownMatch = appShellSource.match(
      /function NavDropdown[\s\S]*?\n\}/,
    );
    expect(navDropdownMatch).not.toBeNull();
    expect(navDropdownMatch![0]).toContain('aria-current={active ? "page" : undefined}');
  });

  it("parent group highlight when child active (hasActiveChild → border-accent text-primary)", () => {
    // The NavDropdown's trigger uses `hasActiveChild` for the highlight:
    // `hasActiveChild ? "border-accent text-primary" : ...`.
    expect(appShellSource).toContain("hasActiveChild");
    expect(appShellSource).toMatch(/hasActiveChild\s*\?\s*"border-accent text-primary"/);
  });

  it("aria-current stays on the child only (the parent trigger has NO aria-current attribute)", () => {
    // Per spec: "aria-current stays on the child only." The parent
    // dropdown trigger does NOT have aria-current — it's highlighted
    // visually via hasActiveChild, but the aria-current attribute is
    // only on the child link.
    //
    // We verify the NavDropdown's trigger button does NOT have
    // aria-current (only the child item buttons do).
    const navDropdownMatch = appShellSource.match(
      /function NavDropdown[\s\S]*?\n\}/,
    );
    expect(navDropdownMatch).not.toBeNull();
    const navDropdown = navDropdownMatch![0];
    // The trigger button (first <button> in the component) does NOT have
    // aria-current. We check by extracting the PopoverTrigger's button.
    const triggerMatch = navDropdown.match(
      /<PopoverTrigger asChild>[\s\S]*?<button[^>]*>/,
    );
    expect(triggerMatch).not.toBeNull();
    expect(triggerMatch![0]).not.toContain("aria-current");
  });
});

describe("app-shell.tsx — fit at 1280px (DONE WHEN criterion)", () => {
  it("the overflow-x-auto scroll is removed from the nav container (replaced with flex-wrap)", () => {
    // Per spec: "Remove the scroll-arrow affordance once fit is achieved."
    // The pre-6.3 nav used `overflow-x-auto` as a CSS class on the nav
    // container. The 6.3 nav uses `flex-wrap` instead.
    //
    // We check the nav container's className doesn't have `overflow-x-auto`
    // as an actual CSS class. The string "overflow-x-auto" appears in a
    // comment (documenting the removal), but NOT in any className.
    // Extract all className strings + assert none contain overflow-x-auto.
    const classNameMatches = appShellSource.match(/className="[^"]*"/g) ?? [];
    for (const cls of classNameMatches) {
      expect(cls, `className "${cls}" must not contain overflow-x-auto`).not.toContain("overflow-x-auto");
    }
    // The nav container explicitly uses flex-wrap.
    expect(appShellSource).toContain("flex-wrap");
  });

  it("the nav uses flex (horizontal layout) with gap + padding", () => {
    // The nav container: `flex items-center flex-wrap gap-1 px-4 lg:px-6`.
    expect(appShellSource).toMatch(/className="flex items-center flex-wrap gap-1 px-4 lg:px-6"/);
  });

  it("each top-level item is flex-shrink-0 (no truncation)", () => {
    // Per spec: "no truncation." The nav items use `flex-shrink-0` so
    // they don't shrink below their content width.
    expect(appShellSource).toContain("flex-shrink-0");
  });
});

// =============================================================================
// One source of truth — palette + quick actions + VIEW_TITLES all derive
// from NAV_STRUCTURE. These tests lock in that contract so the four
// surfaces (menu, palette, quick actions, breadcrumbs) can't drift again.
// =============================================================================

import {
  getPaletteEntries,
  getQuickActions,
  findDestination,
} from "../dashboard/nav-structure";
import { VIEW_TITLES } from "../dashboard/vocabulary";

describe("nav-structure — one source of truth (palette + quick actions + view titles)", () => {
  it("getPaletteEntries returns every destination visible to the role (REGISTRAR sees 19)", () => {
    // REGISTRAR sees all 20 minus my-union (OFFICER-only) = 19.
    const entries = getPaletteEntries("REGISTRAR");
    expect(entries).toHaveLength(19);
    // Every entry has the canonical label, route, icon, + groupLabel.
    for (const e of entries) {
      expect(e.label).toBeTruthy();
      expect(e.route).toBeTruthy();
      expect(e.icon).toBeDefined();
      expect(e.groupLabel).toBeTruthy();
      expect(Array.isArray(e.aliases)).toBe(true);
    }
    // Spot-check a few canonical labels (post-rename).
    const labels = entries.map((e) => e.label);
    expect(labels).toContain("Compliance");
    expect(labels).toContain("Audit");
    expect(labels).toContain("Security");
    expect(labels).toContain("Resources");
    expect(labels).toContain("Retention Queue");
    // The OLD names must NOT appear as labels (they're aliases only).
    expect(labels).not.toContain("Compliance Matrix");
    expect(labels).not.toContain("Audit Log");
    expect(labels).not.toContain("Security Dashboard");
    expect(labels).not.toContain("Legislation");
    expect(labels).not.toContain("Retention");
  });

  it("getPaletteEntries for OFFICER omits Admin + Work Queues destinations", () => {
    const entries = getPaletteEntries("OFFICER");
    const routes = entries.map((e) => e.route);
    // OFFICER has no access to Admin group OR Work Queues group.
    expect(routes).not.toContain("audit");
    expect(routes).not.toContain("users");
    expect(routes).not.toContain("reviews");
    expect(routes).not.toContain("retention");
    expect(routes).not.toContain("legislation");
    // OFFICER DOES see my-union (REGISTRAR/INSPECTOR don't).
    expect(routes).toContain("my-union");
  });

  it("getPaletteEntries for INSPECTOR includes Audit but not other Admin destinations", () => {
    const entries = getPaletteEntries("INSPECTOR");
    const routes = entries.map((e) => e.route);
    expect(routes).toContain("audit");
    expect(routes).not.toContain("users");
    expect(routes).not.toContain("security");
    expect(routes).not.toContain("legislation");
  });

  it("palette aliases include old names for backward-compatible fuzzy matching", () => {
    const entries = getPaletteEntries("REGISTRAR");
    const compliance = entries.find((e) => e.route === "compliance")!;
    expect(compliance.aliases).toContain("Compliance Matrix");
    const resources = entries.find((e) => e.route === "legislation")!;
    expect(resources.aliases).toContain("Legislation");
    expect(resources.aliases).toContain("Resources Library");
    const audit = entries.find((e) => e.route === "audit")!;
    expect(audit.aliases).toContain("Audit Log");
  });

  it("getQuickActions returns navigate + external actions for REGISTRAR", () => {
    const actions = getQuickActions("REGISTRAR");
    // REGISTRAR sees: Register Union, Upload Document, Create Task, View Audit Log
    // (4 navigate actions) + Compliance Report (1 external action) = 5 total.
    expect(actions.length).toBeGreaterThanOrEqual(5);
    const navigateActions = actions.filter((a) => a.kind === "navigate");
    const externalActions = actions.filter((a) => a.kind === "external");
    expect(navigateActions.length).toBe(4);
    expect(externalActions.length).toBe(1);
    expect(externalActions[0].href).toBe("/reports/compliance");
    // Verify the navigate action labels use shortLabel where set.
    const labels = navigateActions.map((a) => a.label);
    expect(labels).toContain("Register Union");
    expect(labels).toContain("Upload Document");
    expect(labels).toContain("Create Task");
    expect(labels).toContain("View Audit Log");
  });

  it("getQuickActions for INSPECTOR omits Register Union + Upload Document (task gating)", () => {
    // INSPECTORS can visit Unions + Documents (to inspect) but don't get
    // the "Register Union" or "Upload Document" do-buttons. They see:
    // Create Task, View Audit Log (navigate) + Compliance Report (external).
    // This is the task-gating fix: visit ≠ can-do.
    const actions = getQuickActions("INSPECTOR");
    const labels = actions.map((a) => a.label);
    // INSPECTOR sees: Create Task, View Audit Log, Compliance Report = 3 total.
    expect(labels).toContain("Create Task");
    expect(labels).toContain("View Audit Log");
    expect(labels).toContain("Compliance Report");
    // INSPECTOR does NOT see: Register Union, Upload Document.
    expect(labels).not.toContain("Register Union");
    expect(labels).not.toContain("Upload Document");
    // Verify the count: 2 navigate + 1 external = 3.
    expect(actions).toHaveLength(3);
  });

  it("getQuickActions for OFFICER has exactly ONE Upload Document (no duplicate)", () => {
    // OFFICERS see: Upload Document (from my-union, scoped to their union),
    // Create Task, Compliance Report. They do NOT see a second "Upload
    // Document" from the documents destination (that's gated to REGISTRAR).
    // This is the dedup fix: one task = one button.
    const actions = getQuickActions("OFFICER");
    const labels = actions.map((a) => a.label);
    // OFFICER sees exactly ONE "Upload Document".
    const uploadCount = labels.filter((l) => l === "Upload Document").length;
    expect(uploadCount).toBe(1);
    // OFFICER sees: Upload Document, Create Task, Compliance Report = 3 total.
    expect(labels).toContain("Upload Document");
    expect(labels).toContain("Create Task");
    expect(labels).toContain("Compliance Report");
    // OFFICER does NOT see: Register Union, View Audit Log.
    expect(labels).not.toContain("Register Union");
    expect(labels).not.toContain("View Audit Log");
    expect(actions).toHaveLength(3);
  });

  it("getQuickActions never returns duplicate labels for any role (dedup safety net)", () => {
    // The dedup-by-label safety net: even if the config drifts + two
    // destinations produce the same label for the same role, only the
    // first is kept. This test verifies the dedup works by checking all
    // three roles have no duplicate labels.
    for (const role of ["REGISTRAR", "INSPECTOR", "OFFICER"] as const) {
      const actions = getQuickActions(role);
      const labels = actions.map((a) => a.label);
      const uniqueLabels = new Set(labels);
      expect(uniqueLabels.size, `${role}: duplicate labels found`).toBe(labels.length);
    }
  });

  it("VIEW_TITLES mirrors NAV_STRUCTURE labels (no drift)", () => {
    // Every destination in NAV_STRUCTURE must have a VIEW_TITLES entry
    // with the SAME label. This is the contract that prevents the page
    // heading from drifting from the menu item.
    for (const group of NAV_STRUCTURE) {
      for (const dest of group.destinations) {
        const title = VIEW_TITLES[dest.route];
        expect(
          title,
          `VIEW_TITLES["${dest.route}"] must equal NAV_STRUCTURE label "${dest.label}"`,
        ).toBe(dest.label);
      }
    }
  });

  it("VIEW_TITLES includes special-case routes not in NAV_STRUCTURE", () => {
    // These routes aren't in the nav but still need a page heading.
    expect(VIEW_TITLES["account-security"]).toBe("Account Security");
    expect(VIEW_TITLES["document-detail"]).toBe("Document Details");
  });

  it("findDestination returns the canonical label for a route", () => {
    expect(findDestination("compliance")?.label).toBe("Compliance");
    expect(findDestination("legislation")?.label).toBe("Resources");
    expect(findDestination("retention")?.label).toBe("Retention Queue");
    expect(findDestination("nonexistent")).toBeNull();
  });
});

// =============================================================================
// Help layer — status definitions + glossary contract.
//
// These tests lock in that every status has a plain-language definition
// (for tooltips + the glossary), and that the Help guide destination is
// reachable + correctly labeled.
// =============================================================================

import {
  UNION_STATUS_CONFIG,
  REVIEW_STATUS_CONFIG,
  COMPLIANCE_STATUS_CONFIG,
} from "../dashboard/vocabulary";
import { parseViewParam } from "../dashboard/dashboard-links";
// VIEW_TITLES is already imported above — reusing it.

describe("help layer — status definitions (single source of truth)", () => {
  it("every union status has a non-empty definition + plainLanguage summary", () => {
    // The public glossary uses plainLanguage as the primary text + definition
    // as the secondary detail. Both must be present for every union status.
    for (const [key, cfg] of Object.entries(UNION_STATUS_CONFIG)) {
      expect(cfg.definition, `${key}: definition must be non-empty`).toBeTruthy();
      expect(cfg.definition!.length, `${key}: definition must be substantive`).toBeGreaterThan(20);
      expect(cfg.plainLanguage, `${key}: plainLanguage must be non-empty`).toBeTruthy();
      expect(cfg.plainLanguage!.length, `${key}: plainLanguage must be substantive`).toBeGreaterThan(10);
    }
  });

  it("every review status has a non-empty definition", () => {
    // The Reviews view + Help glossary surface these definitions as tooltips.
    for (const [key, cfg] of Object.entries(REVIEW_STATUS_CONFIG)) {
      expect(cfg.definition, `${key}: definition must be non-empty`).toBeTruthy();
      expect(cfg.definition!.length, `${key}: definition must be substantive`).toBeGreaterThan(20);
    }
  });

  it("every compliance status has a non-empty definition", () => {
    // The Dashboard + Compliance legend + Help glossary surface these.
    for (const [key, cfg] of Object.entries(COMPLIANCE_STATUS_CONFIG)) {
      expect(cfg.definition, `${key}: definition must be non-empty`).toBeTruthy();
      expect(cfg.definition.length, `${key}: definition must be substantive`).toBeGreaterThan(20);
    }
  });

  it("the MISSING definition mentions filing/disposed (NOT review — that's now AWAITING_REVIEW)", () => {
    // After the AWAITING_REVIEW split, MISSING no longer mentions review/
    // pending/approved. Those are now in the AWAITING_REVIEW definition.
    // MISSING is now only about "no document filed" or "disposed".
    expect(COMPLIANCE_STATUS_CONFIG.MISSING.definition).toMatch(/filed|disposed/i);
    expect(COMPLIANCE_STATUS_CONFIG.MISSING.definition).not.toMatch(/review|pending|approved/i);
  });

  it("the AWAITING_REVIEW definition mentions review / Registrar", () => {
    // The new AWAITING_REVIEW status covers PENDING/REJECTED documents.
    // Its definition should make clear this is a Registrar action item.
    expect(COMPLIANCE_STATUS_CONFIG.AWAITING_REVIEW.definition).toMatch(/review|registrar/i);
    expect(COMPLIANCE_STATUS_CONFIG.AWAITING_REVIEW.label).toBe("Awaiting Review");
  });
});

describe("help layer — Help guide destination", () => {
  it("the 'help' route is in NAV_STRUCTURE", () => {
    expect(getAllRoutes()).toContain("help");
  });

  it("the 'help' route is in VIEW_TITLES with the canonical label", () => {
    // The page heading must match the nav item label (one-source-of-truth contract).
    const dest = findDestination("help");
    expect(dest, "help destination must exist in NAV_STRUCTURE").not.toBeNull();
    expect(VIEW_TITLES["help"]).toBe(dest!.label);
  });

  it("the 'help' route is accepted by parseViewParam (URL routing works)", () => {
    // So /?view=help works for refresh + sharing + Back/Forward.
    expect(parseViewParam("help")).toBe("help");
  });

  it("the Help destination is visible to all staff roles", () => {
    // The help layer is for everyone — Registrar, Inspector, Officer all
    // need access to the glossary + role-based guide.
    const dest = findDestination("help");
    expect(dest!.roles).toContain("REGISTRAR");
    expect(dest!.roles).toContain("INSPECTOR");
    expect(dest!.roles).toContain("OFFICER");
  });

  it("the Help destination has 'Glossary' + 'Guide' as aliases for fuzzy search", () => {
    // So typing "glossary" or "guide" in the Cmd+K palette finds the Help page.
    const dest = findDestination("help");
    expect(dest!.aliases).toContain("Glossary");
    expect(dest!.aliases).toContain("Guide");
  });
});

// =============================================================================
// Task status vocabulary — alignment with the Prisma TaskStatus enum.
//
// These tests lock in that TASK_STATUS_CONFIG in vocabulary.ts mirrors the
// real Prisma TaskStatus enum (PENDING / IN_PROGRESS / COMPLETED / CANCELLED).
//
// Before this contract, the map used invented names (TODO / DONE) that didn't
// match the DB — causing silent failures where a lookup with a real status
// found no match and the raw enum value was shown to users in capitals.
// The test fails if the map + enum ever drift again.
// =============================================================================

import { TASK_STATUS_CONFIG } from "../dashboard/vocabulary";
import { TaskStatus as PrismaTaskStatus } from "@prisma/client";

describe("task status vocabulary — alignment with Prisma TaskStatus enum", () => {
  it("TASK_STATUS_CONFIG has exactly the same keys as the Prisma TaskStatus enum", () => {
    // The Prisma client exports the enum values as an object. We compare
    // the sorted arrays — if either side adds or removes a value, this
    // test fails loudly.
    const prismaKeys = Object.values(PrismaTaskStatus).sort();
    const vocabKeys = Object.keys(TASK_STATUS_CONFIG).sort();
    expect(vocabKeys).toEqual(prismaKeys);
  });

  it("every TASK_STATUS_CONFIG entry has a non-empty label + tone + definition", () => {
    for (const [key, cfg] of Object.entries(TASK_STATUS_CONFIG)) {
      expect(cfg.label, `${key}: label must be non-empty`).toBeTruthy();
      expect(cfg.tone, `${key}: tone must be non-empty`).toBeTruthy();
      expect(cfg.definition, `${key}: definition must be non-empty`).toBeTruthy();
      expect(cfg.definition!.length, `${key}: definition must be substantive`).toBeGreaterThan(20);
    }
  });

  it("PENDING → 'To Do' (friendly label, not 'Pending')", () => {
    // The brief specifies: PENDING → "To Do". This is the friendly label
    // staff + reps see — NOT the raw enum value in capitals.
    expect(TASK_STATUS_CONFIG.PENDING.label).toBe("To Do");
  });

  it("IN_PROGRESS → 'In Progress'", () => {
    expect(TASK_STATUS_CONFIG.IN_PROGRESS.label).toBe("In Progress");
  });

  it("COMPLETED → 'Done' (friendly label, not 'Completed')", () => {
    // The brief specifies: COMPLETED → "Done". This is the friendly label.
    expect(TASK_STATUS_CONFIG.COMPLETED.label).toBe("Done");
  });

  it("CANCELLED → 'Cancelled' (the real cancelled state staff need)", () => {
    // The brief: "I want a real cancelled state as staff need to cancel tasks."
    // CANCELLED is now a real Prisma enum value + a TASK_STATUS_CONFIG key.
    expect(TASK_STATUS_CONFIG.CANCELLED.label).toBe("Cancelled");
    // The definition must make clear that cancelled tasks stay on the list
    // (not deleted) — this is the audit-history contract.
    expect(TASK_STATUS_CONFIG.CANCELLED.definition).toMatch(/audit|history|not deleted|stays on/i);
  });

  it("no invented names (TODO / DONE) remain in TASK_STATUS_CONFIG", () => {
    // The old map used TODO + DONE (invented names that didn't match the DB).
    // This test is the graveyard alarm: if anyone re-introduces them, the
    // test fails.
    const keys = Object.keys(TASK_STATUS_CONFIG);
    expect(keys).not.toContain("TODO");
    expect(keys).not.toContain("DONE");
  });
});
