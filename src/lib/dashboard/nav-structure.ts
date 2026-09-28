// =============================================================================
// Nav Structure — chunk 6.3. The single source of truth for the staff
// dashboard's navigation structure.
//
// HOME: `src/lib/dashboard/nav-structure.ts`. Lives in the dashboard lib
// tree alongside status-config.ts + activity-config.ts. The nav component
// (`src/components/app/app-shell.tsx`) imports `getNavForRole` + types from
// here and renders the structure — zero destination strings hardcoded in
// JSX (grep guard).
//
// STRUCTURE: 5 top-level items, 3 with dropdowns (13 destinations total —
// the spec said 12, but `my-union` is a 13th item that maps to the same
// view as `unions` via `page.tsx`'s switch. Per the spec's "Do not delete
// destinations", all 13 are kept).
//
//   Dashboard    (direct link, all roles)
//   Unions       (dropdown: Unions, My Union, Compare)
//   Compliance   (dropdown: Compliance, Rules, Review Queue)
//   Tasks        (direct link, REGISTRAR + OFFICER)
//   Admin        (dropdown: Calendar, Audit, Users, Security, API Keys)
//
// All 13 destinations are reachable in ≤2 clicks: top-level direct = 1
// click; dropdown child = 2 clicks (open dropdown + click child). The
// reachability test in `dashboard-nav.test.ts` walks the structure and
// asserts this.
//
// ROLE GATING: each destination carries a `roles` array. `getNavForRole`
// filters: a group is shown if ANY of its destinations is available to
// the role; a dropdown's available destinations are filtered to the role.
// A group with NO available destinations is hidden entirely (e.g. an
// OFFICER sees no "Admin" group — none of its children are OFFICER-
// accessible).
//
// DEEP-LINK PRESERVATION: the `route` field for each destination is
// byte-identical to the pre-6.3 `NAV_ITEMS[].id` strings. The deep-link
// test asserts this against the pre-chunk inventory recorded in the 6.3
// handoff.
//
// LINKS MODULE COINCIDENCE: per the 6.3 spec, "The links module is for
// coinciding destinations only; do not wire nav into the filter contract."
// The nav's Compliance link is the plain Compliance page (no status
// filter) — it does NOT use `complianceFilterUrl` from `dashboard-links.ts`.
// The links module's `complianceFilterUrl` is for the KPI cards' drill-
// through (4.1), not for nav.
// =============================================================================

import {
  LayoutDashboard, Building2, CheckCircle2, Settings2, GitCompare,
  ListTodo, Calendar, ScrollText, Users, Shield, Key, FileCheck, Home,
  Scale, Contact as AddressBook, Webhook, type LucideIcon,
} from "lucide-react";

/** The three staff roles. Matches AuthUser["role"] in app-shell.tsx. */
export type StaffRole = "REGISTRAR" | "INSPECTOR" | "OFFICER";

/**
 * A single nav destination. The `route` is the string passed to
 * `onNavigate(view)`, which `page.tsx`'s switch maps to a view component.
 * Routes are byte-identical to the pre-6.3 `NAV_ITEMS[].id` strings
 * (deep-link preservation).
 */
export interface NavDestination {
  /** The label shown in the nav. */
  label: string;
  /** The route string (passed to onNavigate). Byte-identical to pre-6.3 ids. */
  route: string;
  /** Lucide icon component for the dropdown item. */
  icon: LucideIcon;
  /** Roles that can see this destination. */
  roles: StaffRole[];
}

/**
 * A top-level nav group. Either a direct link (single destination, no
 * dropdown) or a dropdown (multiple destinations).
 *
 * For a direct link: `destinations` has exactly 1 entry, `dropdown` is
 * false. The group's label + icon come from the single destination.
 *
 * For a dropdown: `destinations` has 2+ entries, `dropdown` is true. The
 * group's label + icon are the group's own (e.g. "Unions" / Building2);
 * the destinations are the dropdown items.
 */
export interface NavGroup {
  /** The group's label (shown on the top-level nav item). */
  label: string;
  /** The group's icon (shown on the top-level nav item). */
  icon: LucideIcon;
  /** The destinations in this group. 1 = direct link; 2+ = dropdown. */
  destinations: NavDestination[];
  /**
   * The route for a direct link (when `destinations.length === 1`).
   * Undefined for dropdowns — the dropdown has no single route; it
   * opens a panel instead.
   */
  route?: string;
}

/**
 * The complete nav structure. 5 top-level groups, 13 destinations.
 *
 * The order is the reading order (left-to-right in the top nav). Groups
 * are ordered by:
 *   1. Dashboard (always first — the home)
 *   2. Registry oversight (Unions group: Unions, My Union, Compare)
 *   3. Compliance (Compliance group: Compliance, Rules, Review Queue)
 *   4. Productivity (Tasks — direct link, no dropdown)
 *   5. Admin (Calendar, Audit, Users, Security, API Keys)
 *
 * This order matches the pre-6.3 NAV_ITEMS order (which was: Dashboard,
 * Unions, My Union, Compliance, Rules, Compare, Tasks, Review Queue,
 * Calendar, Audit, Users, Security, API Keys) — the grouping preserves
 * the relative order within each group.
 */
export const NAV_STRUCTURE: NavGroup[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    destinations: [
      {
        label: "Dashboard",
        route: "dashboard",
        icon: LayoutDashboard,
        roles: ["REGISTRAR", "INSPECTOR", "OFFICER"],
      },
    ],
    route: "dashboard",
  },
  {
    label: "Unions",
    icon: Building2,
    destinations: [
      {
        label: "Unions",
        route: "unions",
        icon: Building2,
        roles: ["REGISTRAR", "INSPECTOR"],
      },
      {
        label: "My Union",
        route: "my-union",
        icon: Home,
        roles: ["OFFICER"],
      },
      {
        label: "Compare",
        route: "compare",
        icon: GitCompare,
        roles: ["REGISTRAR", "INSPECTOR"],
      },
    ],
  },
  {
    label: "Compliance",
    icon: CheckCircle2,
    destinations: [
      {
        label: "Compliance",
        route: "compliance",
        icon: CheckCircle2,
        roles: ["REGISTRAR", "INSPECTOR", "OFFICER"],
      },
      {
        label: "Rules",
        route: "configure-rules",
        icon: Settings2,
        roles: ["REGISTRAR"],
      },
      {
        label: "Review Queue",
        route: "reviews",
        icon: FileCheck,
        roles: ["REGISTRAR"],
      },
      {
        label: "Contact Updates",
        route: "contact-requests",
        icon: AddressBook,
        roles: ["REGISTRAR"],
      },
    ],
  },
  {
    label: "Tasks",
    icon: ListTodo,
    destinations: [
      {
        label: "Tasks",
        route: "tasks",
        icon: ListTodo,
        roles: ["REGISTRAR", "INSPECTOR", "OFFICER"],
      },
    ],
    route: "tasks",
  },
  {
    label: "Admin",
    icon: Shield,
    destinations: [
      {
        label: "Calendar",
        route: "calendar",
        icon: Calendar,
        roles: ["REGISTRAR", "INSPECTOR", "OFFICER"],
      },
      {
        label: "Audit",
        route: "audit",
        icon: ScrollText,
        roles: ["REGISTRAR", "INSPECTOR"],
      },
      {
        label: "Users",
        route: "users",
        icon: Users,
        roles: ["REGISTRAR"],
      },
      {
        label: "Security",
        route: "security",
        icon: Shield,
        roles: ["REGISTRAR"],
      },
      {
        label: "API Keys",
        route: "api-keys",
        icon: Key,
        roles: ["REGISTRAR"],
      },
      {
        label: "Webhooks",
        route: "webhooks",
        icon: Webhook,
        roles: ["REGISTRAR"],
      },
      {
        label: "Resources",
        route: "legislation",
        icon: Scale,
        roles: ["REGISTRAR"],
      },
    ],
  },
];

/**
 * Filter the nav structure to the destinations available to a given role.
 *
 * - Groups with NO available destinations are dropped entirely (e.g. an
 *   OFFICER sees no "Admin" group — none of its children are OFFICER-
 *   accessible).
 * - Within a dropdown group, only the role-accessible destinations are
 *   returned.
 * - A group that has only 1 available destination renders as a direct
 *   link (the caller checks `destinations.length` — if 1, render direct;
 *   if 2+, render dropdown).
 *
 * Pure: no I/O, no side effects. Pass a role, get the filtered structure.
 */
export function getNavForRole(role: StaffRole): NavGroup[] {
  return NAV_STRUCTURE.map((group) => ({
    ...group,
    destinations: group.destinations.filter((d) => d.roles.includes(role)),
  }))
    .filter((group) => group.destinations.length > 0);
}

/**
 * Walk the full nav structure (all roles) and return every destination's
 * route. Used by the route smoke test + reachability test in
 * `dashboard-nav.test.ts`.
 *
 * Returns 13 routes (the complete inventory, regardless of role). The
 * tests use this to assert every route resolves in `page.tsx`'s switch
 * + is reachable in ≤2 clicks.
 */
export function getAllRoutes(): string[] {
  return NAV_STRUCTURE.flatMap((group) => group.destinations.map((d) => d.route));
}

/**
 * Find the group that contains a given route. Used by the nav component
 * to highlight the parent group when a child route is active.
 *
 * Returns the group, or null if the route isn't in any group (e.g. the
 * `account-security` route, which is reachable only via the user menu,
 * not the nav bar).
 */
export function findGroupForRoute(route: string): NavGroup | null {
  for (const group of NAV_STRUCTURE) {
    if (group.destinations.some((d) => d.route === route)) {
      return group;
    }
  }
  return null;
}

/**
 * Count the clicks required to reach a destination from the dashboard.
 *
 * - A direct link (top-level group with 1 destination) = 1 click.
 * - A dropdown child = 2 clicks (open dropdown + click child).
 * - The dashboard itself = 0 clicks (you're already there).
 *
 * The reachability test asserts every destination is ≤2 clicks.
 */
export function clicksToReach(route: string): number {
  if (route === "dashboard") return 0;
  const group = findGroupForRoute(route);
  if (!group) return Infinity; // route not in nav (e.g. account-security)
  // Direct link (group with 1 destination) = 1 click.
  // Dropdown child (group with 2+ destinations) = 2 clicks.
  return group.destinations.length === 1 ? 1 : 2;
}
