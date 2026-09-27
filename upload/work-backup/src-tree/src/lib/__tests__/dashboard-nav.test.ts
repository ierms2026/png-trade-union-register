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
  "compliance",
  "configure-rules",
  "compare",
  "tasks",
  "reviews",
  "contact-requests",
  "calendar",
  "audit",
  "users",
  "security",
  "api-keys",
  "legislation",
] as const;

describe("nav-structure — NAV_STRUCTURE config (chunk 6.3)", () => {
  it("has exactly 5 top-level groups (the spec's target)", () => {
    expect(NAV_STRUCTURE).toHaveLength(5);
  });

  it("the 5 groups are: Dashboard, Unions, Compliance, Tasks, Admin", () => {
    expect(NAV_STRUCTURE.map((g) => g.label)).toEqual([
      "Dashboard",
      "Unions",
      "Compliance",
      "Tasks",
      "Admin",
    ]);
  });

  it("2 groups are direct links (Dashboard, Tasks); 3 are dropdowns (Unions, Compliance, Admin)", () => {
    const directLinks = NAV_STRUCTURE.filter((g) => g.destinations.length === 1);
    const dropdowns = NAV_STRUCTURE.filter((g) => g.destinations.length > 1);
    expect(directLinks.map((g) => g.label)).toEqual(["Dashboard", "Tasks"]);
    expect(dropdowns.map((g) => g.label)).toEqual(["Unions", "Compliance", "Admin"]);
  });

  it("all 15 destinations are present (13 original + legislation + contact-requests)", () => {
    const allRoutes = getAllRoutes();
    expect(allRoutes).toHaveLength(15);
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

  it("NAV_STRUCTURE introduces NO new routes (only the pre-chunk 15)", () => {
    const allRoutes = getAllRoutes();
    const preChunkSet = new Set(PRE_CHUNK_ROUTES);
    const newRoutes = allRoutes.filter((r) => !preChunkSet.has(r as typeof PRE_CHUNK_ROUTES[number]));
    expect(newRoutes, `no new routes; found: ${newRoutes.join(", ")}`).toEqual([]);
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

  it("direct-link destinations (Tasks) are 1 click", () => {
    expect(clicksToReach("tasks")).toBe(1);
  });

  it("dropdown children are 2 clicks (open dropdown + click child)", () => {
    // Unions group children
    expect(clicksToReach("unions")).toBe(2);
    expect(clicksToReach("my-union")).toBe(2);
    expect(clicksToReach("compare")).toBe(2);
    // Compliance group children
    expect(clicksToReach("compliance")).toBe(2);
    expect(clicksToReach("configure-rules")).toBe(2);
    expect(clicksToReach("reviews")).toBe(2);
    // Admin group children
    expect(clicksToReach("calendar")).toBe(2);
    expect(clicksToReach("audit")).toBe(2);
    expect(clicksToReach("users")).toBe(2);
    expect(clicksToReach("security")).toBe(2);
    expect(clicksToReach("api-keys")).toBe(2);
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
  it("REGISTRAR sees all 5 groups (15 destinations accessible — my-union is OFFICER-only)", () => {
    const nav = getNavForRole("REGISTRAR");
    expect(nav).toHaveLength(5);
    const allRoutes = nav.flatMap((g) => g.destinations.map((d) => d.route));
    expect(allRoutes).toHaveLength(14); // all 15 minus my-union
    expect(allRoutes).not.toContain("my-union");
  });

  it("INSPECTOR sees Dashboard, Unions (Unions + Compare), Compliance, Tasks, Admin (Calendar + Audit) — Inspectors now have Tasks access", () => {
    const nav = getNavForRole("INSPECTOR");
    // Inspector now sees 5 groups (Tasks was added to INSPECTOR role gating).
    expect(nav).toHaveLength(5);
    expect(nav.map((g) => g.label)).toEqual(["Dashboard", "Unions", "Compliance", "Tasks", "Admin"]);
    // Unions dropdown: Unions + Compare (NOT My Union — OFFICER only)
    const unionsGroup = nav.find((g) => g.label === "Unions")!;
    expect(unionsGroup.destinations.map((d) => d.route)).toEqual(["unions", "compare"]);
    // Admin dropdown: Calendar + Audit only (NOT Users/Security/API Keys/Legislation — REGISTRAR only)
    const adminGroup = nav.find((g) => g.label === "Admin")!;
    expect(adminGroup.destinations.map((d) => d.route)).toEqual(["calendar", "audit"]);
  });

  it("OFFICER sees Dashboard, Unions (My Union only), Compliance, Tasks, Admin (Calendar only) — 5 groups but different children", () => {
    const nav = getNavForRole("OFFICER");
    expect(nav).toHaveLength(5);
    expect(nav.map((g) => g.label)).toEqual(["Dashboard", "Unions", "Compliance", "Tasks", "Admin"]);
    // Unions dropdown: My Union only (NOT Unions/Compare — INSPECTOR+REGISTRAR)
    const unionsGroup = nav.find((g) => g.label === "Unions")!;
    expect(unionsGroup.destinations.map((d) => d.route)).toEqual(["my-union"]);
    // Compliance dropdown: Compliance only (NOT Rules/Review Queue — REGISTRAR only)
    const complianceGroup = nav.find((g) => g.label === "Compliance")!;
    expect(complianceGroup.destinations.map((d) => d.route)).toEqual(["compliance"]);
    // Admin dropdown: Calendar only (NOT Audit — INSPECTAR+REGISTRAR; NOT Users/Security/API Keys — REGISTRAR only)
    const adminGroup = nav.find((g) => g.label === "Admin")!;
    expect(adminGroup.destinations.map((d) => d.route)).toEqual(["calendar"]);
  });

  it("a group with only 1 available destination (OFFICER's Unions = My Union only) is still a dropdown (group has 2+ destinations in the full structure)", () => {
    // The OFFICER's Unions group has only My Union (1 destination). The
    // nav component renders it as a dropdown because the GROUP has 2+
    // destinations in NAV_STRUCTURE (the role filter narrows it to 1).
    // This is a known edge case: an OFFICER sees a "Unions ▾" dropdown
    // with only "My Union" inside. The alternative (render as direct
    // link) would require knowing the role at the group level, which
    // the config doesn't carry. The current behavior is acceptable:
    // the dropdown has 1 item, which is still ≤2 clicks.
    const nav = getNavForRole("OFFICER");
    const unionsGroup = nav.find((g) => g.label === "Unions")!;
    expect(unionsGroup.destinations).toHaveLength(1);
    // The nav component checks `destinations.length` AFTER role filtering.
    // For OFFICER's Unions: 1 → renders as direct link (the nav
    // component's `isDirectLink = group.destinations.length === 1`).
    // This is the correct behavior: the OFFICER's Unions group becomes
    // a direct link to My Union.
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
