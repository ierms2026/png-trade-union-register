// =============================================================================
// Nav Structure — the SINGLE SOURCE OF TRUTH for the staff dashboard's
// navigation, search palette, quick actions, + breadcrumbs.
//
// STRUCTURE: 8 top-level groups, 19 destinations:
//
//   Dashboard     (direct link, all roles)
//   Unions        (dropdown: Unions, My Union, Documents, Compare)
//   Compliance    (dropdown: Compliance, Rules)
//   Tasks         (direct link, all roles)
//   Calendar      (direct link, all roles)
//   Work Queues   (dropdown: Review Queue, Contact Updates, Retention Queue)
//   Search        (direct link, all roles)
//   Admin         (dropdown: Audit, Users, Security, API Keys, Webhooks, Resources)
//
// All 19 destinations are reachable in ≤2 clicks.
//
// =============================================================================
//
// ONE SOURCE OF TRUTH — WHAT THIS FILE OWNS
// -----------------------------------------------------------------------------
// Every UI surface that lists destinations must read from NAV_STRUCTURE (or a
// helper derived from it). Hard-coded destination lists elsewhere are a bug —
// they drift. Specifically:
//
//   1. TOP NAV (app-shell.tsx HorizontalNav)        → reads getNavForRole(role)
//   2. CMD+K PALETTE (global-search.tsx)            → reads getPaletteEntries(role)
//   3. DASHBOARD QUICK ACTIONS (dashboard.tsx)      → reads getQuickActions(role)
//   4. BREADCRUMBS (app-shell.tsx buildBreadcrumbs) → reads getNavForRole(role)
//                                                      + findGroupForRoute()
//
// CANONICAL LABELS — ONE NAME PER DESTINATION
// -----------------------------------------------------------------------------
// Each destination has ONE `label`. That label is used in the menu, the
// palette, the breadcrumb, and (where applicable) the page heading. Older
// copies of these names (e.g. "Compliance Matrix", "Security Dashboard",
// "Audit Log", "Resources Library", "Legislation") are kept ONLY in the
// `aliases` array so the palette's fuzzy-search still matches them — they
// are NEVER shown to the user. This means renaming a destination is a
// one-line edit here, and every surface updates at once.
//
// The `vocabulary.ts` `VIEW_TITLES` map mirrors these labels for view
// headings. If you rename a destination here, update `VIEW_TITLES` too —
// there's a test in `dashboard-nav.test.ts` that fails if they drift.
// =============================================================================

import {
  LayoutDashboard, Building2, CheckCircle2, Settings2, GitCompare,
  ListTodo, Calendar, ScrollText, Users, Shield, Key, FileCheck, Home,
  Scale, Contact as AddressBook, Webhook, FileText, Plus, Upload, Search,
  Archive, ClipboardList, HelpCircle, type LucideIcon,
} from "lucide-react";

/** The three staff roles. Matches AuthUser["role"] in app-shell.tsx. */
export type StaffRole = "REGISTRAR" | "INSPECTOR" | "OFFICER";

/**
 * Quick-action descriptor. A destination with `quickAction` set appears as a
 * button in the dashboard's Quick Actions row. Two kinds:
 *
 *   - `{ kind: "navigate" }` — clicking the button calls onNavigate(route).
 *       Used for actions whose primary purpose is "jump to this view" (e.g.
 *       "Register Union" jumps to the unions view).
 *   - `{ kind: "external", href }` — clicking opens `href` in a new tab.
 *       Used for the Compliance Report (lives at /reports/compliance, outside
 *       the SPA router).
 *
 * The label + icon come from the destination itself — quick actions don't
 * override them. This keeps the quick-action button visually consistent
 * with the menu item for the same destination.
 *
 * ROLE GATING: the destination's `roles` array still applies. A quick action
 * only appears for users whose role is in `roles`. The dashboard doesn't
 * need its own role checks — getQuickActions(role) filters automatically.
 *
 * `shortLabel` (optional): the quick-action button has less horizontal room
 * than the menu, so a destination can specify a shorter verb-style label
 * for the button (e.g. "Register Union" instead of "Unions", "Upload
 * Document" instead of "Documents"). If omitted, the destination's `label`
 * is used.
 *
 * TASK GATING (not just destination gating):
 *   The destination's `roles` array controls who can SEE the destination in
 *   the nav. But a quick action is a TASK ("do this job"), not a destination
 *   ("visit this page"). Some roles can visit a page but shouldn't get the
 *   do-button for it. For example:
 *     - INSPECTORS can visit Unions (to inspect) but shouldn't get the
 *       "Register Union" button (they don't register unions).
 *     - INSPECTORS can visit Documents (to inspect) but shouldn't get the
 *       "Upload Document" button (they don't upload).
 *   The optional `roles` field on QuickAction handles this: if set, the
 *   quick action only appears for roles in THAT array (a subset of the
 *   destination's `roles`). If omitted, the quick action appears for all
 *   roles that can see the destination (the old behavior — kept for
 *   backward compat).
 *
 * DEDUP:
 *   If two destinations produce the same label for the same role (e.g.
 *   "Upload Document" from both `my-union` and `documents` for an OFFICER),
 *   getQuickActions keeps only the FIRST one. This is a safety net — the
 *   task-gating `roles` field should already prevent duplicates, but the
 *   dedup ensures no duplicate buttons even if the config drifts.
 */
export type QuickAction =
  | { kind: "navigate"; shortLabel?: string; roles?: StaffRole[] }
  | { kind: "external"; href: string; shortLabel?: string; roles?: StaffRole[] };

/**
 * A single nav destination. The `route` is the string passed to
 * `onNavigate(view)`, which `page.tsx`'s switch maps to a view component.
 * Routes are byte-identical to the pre-6.3 `NAV_ITEMS[].id` strings
 * (deep-link preservation).
 */
export interface NavDestination {
  /**
   * The CANONICAL label — used in the menu, palette, breadcrumb, and (where
   * applicable) the page heading. ONE name per destination; do not surface
   * aliases to the user.
   */
  label: string;
  /** The route string (passed to onNavigate). Byte-identical to pre-6.3 ids. */
  route: string;
  /** Lucide icon component for the dropdown item / palette row / quick action. */
  icon: LucideIcon;
  /** Roles that can see this destination. */
  roles: StaffRole[];
  /**
   * Optional aliases — old names for this destination that the palette's
   * fuzzy-search should still match. NEVER shown to the user; only used for
   * matching. E.g. `["Compliance Matrix", "Legislation"]` for the
   * "Compliance" / "Resources" destinations.
   */
  aliases?: string[];
  /**
   * Optional quick-action descriptor. If set, this destination appears as a
   * button in the dashboard's Quick Actions row (role-gated by `roles`).
   * See QuickAction for the two kinds.
   */
  quickAction?: QuickAction;
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
 * The complete nav structure. 8 top-level groups, 19 destinations.
 * Ordered left-to-right in the top nav.
 *
 * LABEL DISCIPLINE: each destination's `label` is the canonical name. The
 * palette, breadcrumbs, and page headings all use it. Aliases (where
 * present) are search-only — never displayed.
 */
export const NAV_STRUCTURE: NavGroup[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    destinations: [
      { label: "Dashboard", route: "dashboard", icon: LayoutDashboard, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"] },
    ],
    route: "dashboard",
  },
  {
    label: "Unions",
    icon: Building2,
    destinations: [
      // Register Union: REGISTRAR only (Inspectors can visit Unions to
      // inspect but don't register new unions).
      { label: "Unions", route: "unions", icon: Building2, roles: ["REGISTRAR", "INSPECTOR"], aliases: ["Register Union"], quickAction: { kind: "navigate", shortLabel: "Register Union", roles: ["REGISTRAR"] } },
      // Upload Document (Officer's single upload): OFFICER only. This is
      // the ONLY upload button an Officer sees — scoped to their own union.
      { label: "My Union", route: "my-union", icon: Home, roles: ["OFFICER"], quickAction: { kind: "navigate", shortLabel: "Upload Document" } },
      // Upload Document (general): REGISTRAR only. Officers get their
      // upload via my-union above; Inspectors don't upload. Without this
      // gate, an Officer would see TWO "Upload Document" buttons (one
      // from my-union, one from documents) + an Inspector would see one.
      { label: "Documents", route: "documents", icon: FileText, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"], aliases: ["Upload Document"], quickAction: { kind: "navigate", shortLabel: "Upload Document", roles: ["REGISTRAR"] } },
      { label: "Compare", route: "compare", icon: GitCompare, roles: ["REGISTRAR", "INSPECTOR"], aliases: ["Compare Unions"] },
    ],
  },
  {
    label: "Compliance",
    icon: CheckCircle2,
    destinations: [
      { label: "Compliance", route: "compliance", icon: CheckCircle2, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"], aliases: ["Compliance Matrix", "Compliance Status"] },
      { label: "Rules", route: "configure-rules", icon: Settings2, roles: ["REGISTRAR"], aliases: ["Configure Rules"] },
    ],
  },
  {
    label: "Tasks",
    icon: ListTodo,
    destinations: [
      { label: "Tasks", route: "tasks", icon: ListTodo, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"], aliases: ["Create Task"], quickAction: { kind: "navigate", shortLabel: "Create Task" } },
    ],
    route: "tasks",
  },
  {
    label: "Calendar",
    icon: Calendar,
    destinations: [
      { label: "Calendar", route: "calendar", icon: Calendar, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"] },
    ],
    route: "calendar",
  },
  {
    label: "Work Queues",
    icon: ClipboardList,
    destinations: [
      { label: "Review Queue", route: "reviews", icon: FileCheck, roles: ["REGISTRAR"] },
      { label: "Contact Updates", route: "contact-requests", icon: AddressBook, roles: ["REGISTRAR"], aliases: ["Contact Update Requests"] },
      { label: "Retention Queue", route: "retention", icon: Archive, roles: ["REGISTRAR"], aliases: ["Retention"] },
    ],
  },
  {
    label: "Search",
    icon: Search,
    destinations: [
      { label: "Search", route: "search", icon: Search, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"], aliases: ["Search Documents"] },
    ],
    route: "search",
  },
  {
    label: "Admin",
    icon: Shield,
    destinations: [
      { label: "Audit", route: "audit", icon: ScrollText, roles: ["REGISTRAR", "INSPECTOR"], aliases: ["Audit Log"], quickAction: { kind: "navigate", shortLabel: "View Audit Log" } },
      { label: "Users", route: "users", icon: Users, roles: ["REGISTRAR"] },
      { label: "Security", route: "security", icon: Shield, roles: ["REGISTRAR"], aliases: ["Security Dashboard"] },
      { label: "API Keys", route: "api-keys", icon: Key, roles: ["REGISTRAR"] },
      { label: "Webhooks", route: "webhooks", icon: Webhook, roles: ["REGISTRAR"] },
      { label: "Resources", route: "legislation", icon: Scale, roles: ["REGISTRAR"], aliases: ["Resources Library", "Legislation", "Legislation Library"] },
    ],
  },
  {
    label: "Help",
    icon: HelpCircle,
    destinations: [
      { label: "Help & Guide", route: "help", icon: HelpCircle, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"], aliases: ["Guide", "Glossary", "Status Glossary"] },
    ],
    route: "help",
  },
];

// =============================================================================
// Helpers — single source of truth for nav, palette, quick actions, breadcrumbs
// =============================================================================

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
 *
 * Used by: app-shell.tsx (top nav + breadcrumbs), global-search.tsx
 * (palette navigation group), dashboard.tsx (quick actions).
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
 * Returns 19 routes (the complete inventory, regardless of role). The
 * tests use this to assert every route resolves in `page.tsx`'s switch
 * + is reachable in ≤2 clicks.
 */
export function getAllRoutes(): string[] {
  return NAV_STRUCTURE.flatMap((group) => group.destinations.map((d) => d.route));
}

/**
 * Find the group that contains a given route. Used by the nav component
 * to highlight the parent group when a child route is active, and by the
 * breadcrumb builder to add a group crumb for dropdown children.
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
 * Find a specific destination by route. Returns null if not found.
 *
 * Used by the breadcrumb builder to read the canonical label, and by
 * the palette to read aliases for fuzzy matching.
 */
export function findDestination(route: string): NavDestination | null {
  for (const group of NAV_STRUCTURE) {
    const dest = group.destinations.find((d) => d.route === route);
    if (dest) return dest;
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

// =============================================================================
// Palette entries — derived from NAV_STRUCTURE, filtered by role.
// -----------------------------------------------------------------------------
// Used by global-search.tsx's "Navigation" group. Each entry carries the
// destination's canonical label + icon + route + any aliases (for fuzzy
// matching). The palette component builds the cmdk `value` string from
// these — no hard-coded list in the palette file.
// =============================================================================

export interface PaletteEntry {
  /** The destination's canonical route (passed to onNavigate). */
  route: string;
  /** The destination's canonical label (shown in the palette row). */
  label: string;
  /** The destination's icon. */
  icon: LucideIcon;
  /** Old names for fuzzy-match purposes. Never shown to the user. */
  aliases: string[];
  /** The group label — used as a secondary hint in the palette row. */
  groupLabel: string;
}

/**
 * Return every destination visible to `role`, as palette entries.
 *
 * The palette shows destinations from ALL visible groups in one flat list
 * (cmdk groups them by group label if it wants, but the data is flat).
 * `my-union` and `unions` are mutually exclusive by role — the palette
 * doesn't need to special-case them; the role filter handles it.
 */
export function getPaletteEntries(role: StaffRole): PaletteEntry[] {
  return getNavForRole(role).flatMap((group) =>
    group.destinations.map((dest) => ({
      route: dest.route,
      label: dest.label,
      icon: dest.icon,
      aliases: dest.aliases ?? [],
      groupLabel: group.label,
    })),
  );
}

// =============================================================================
// Quick actions — derived from NAV_STRUCTURE, filtered by role.
// -----------------------------------------------------------------------------
// Used by dashboard.tsx's Quick Actions row. A destination appears as a
// quick action iff it has `quickAction` set AND the user's role is in
// `roles`. The dashboard reads this list and renders one button per entry.
// =============================================================================

export interface QuickActionEntry {
  /** The destination's canonical route. For `external` actions, this is unused. */
  route: string;
  /** The label shown on the button. Uses `quickAction.shortLabel` if set, else `label`. */
  label: string;
  /** The destination's icon. */
  icon: LucideIcon;
  /** The action kind — navigate (SPA) or external (new tab). */
  kind: "navigate" | "external";
  /** For `external` actions, the URL to open in a new tab. Unused for `navigate`. */
  href?: string;
}

/**
 * Return every quick action visible to `role`, in NAV_STRUCTURE order.
 *
 * The dashboard renders these in a 4-column grid. The order matches the
 * nav structure (Dashboard group first, then Unions, etc.), so the
 * quick-action row visually echoes the menu order. Destinations without
 * `quickAction` set are skipped.
 *
 * TASK GATING:
 *   A quick action appears for `role` iff:
 *     1. The destination is visible to `role` (dest.roles includes role), AND
 *     2. The quick action's own `roles` field (if set) includes `role`.
 *   This separates "can I visit this page?" (1) from "should I get the
 *   do-button?" (2). For example, an INSPECTOR can visit the Unions page
 *   (1 = true) but doesn't get the "Register Union" button (2 = false,
 *   because the quickAction.roles is ["REGISTRAR"]).
 *
 * DEDUP:
 *   If two destinations produce the same label for the same role, only the
 *   FIRST is kept. This is a safety net — the task-gating `roles` field
 *   should already prevent duplicates (e.g. Officer sees "Upload Document"
 *   only from `my-union`, not from `documents`), but the dedup ensures no
 *   duplicate buttons even if the config drifts.
 *
 * EXTERNAL ACTIONS: the Compliance Report is the one external quick action.
 * It lives at /reports/compliance (a Server Component route, outside the
 * SPA router), so it can't use onNavigate — it opens in a new tab instead.
 */
export function getQuickActions(role: StaffRole): QuickActionEntry[] {
  const entries: QuickActionEntry[] = [];
  const seenLabels = new Set<string>(); // for dedup-by-label
  for (const group of NAV_STRUCTURE) {
    for (const dest of group.destinations) {
      if (!dest.quickAction) continue;
      // Gate 1: the destination must be visible to the role.
      if (!dest.roles.includes(role)) continue;
      // Gate 2: the quick action's own roles field (if set) must include
      // the role. This is the task gate — it can be a subset of the
      // destination's roles.
      if (dest.quickAction.roles && !dest.quickAction.roles.includes(role)) continue;
      const label = dest.quickAction.shortLabel ?? dest.label;
      // Dedup: if we've already added an entry with this label for this
      // role, skip. Keeps the first occurrence (NAV_STRUCTURE order).
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);
      if (dest.quickAction.kind === "navigate") {
        entries.push({ route: dest.route, label, icon: dest.icon, kind: "navigate" });
      } else {
        entries.push({ route: dest.route, label, icon: dest.icon, kind: "external", href: dest.quickAction.href });
      }
    }
  }
  // --- Extra quick actions that aren't nav destinations --------------------
  // The Compliance Report is a printable Server Component route at
  // /reports/compliance — it's not in the SPA router's switch, so it can't
  // be a NAV_STRUCTURE destination. But it's still a dashboard quick action
  // for all staff roles (Registrar, Inspector, Officer can all view the
  // report — different content per role, but the route is the same).
  //
  // Defined here so the dashboard's quick-action row has ONE source of
  // truth: getQuickActions(role) returns both nav-derived actions AND
  // these extras. The dashboard doesn't keep its own list.
  for (const extra of EXTRA_QUICK_ACTIONS) {
    if (!extra.roles.includes(role)) continue;
    // Dedup extras too (in case an extra has the same label as a nav action).
    if (seenLabels.has(extra.label)) continue;
    seenLabels.add(extra.label);
    entries.push({
      route: extra.route,
      label: extra.label,
      icon: extra.icon,
      kind: "external",
      href: extra.href,
    });
  }
  return entries;
}

/**
 * Extra quick actions that aren't nav destinations. These live outside the
 * SPA router (e.g. /reports/compliance is a Server Component route that
 * opens in a new tab). They're declared here so getQuickActions() is the
 * single source of truth for the dashboard's quick-action row — the
 * dashboard doesn't keep a separate list.
 *
 * If you add a new printable report or external tool that should appear as
 * a quick action, add it here. Don't add it to the dashboard component —
 * that re-introduces the drift problem.
 */
interface ExtraQuickAction {
  /** Stable identifier (not a route — used for React keys). */
  route: string;
  /** The label shown on the button. */
  label: string;
  /** The icon shown on the button. */
  icon: LucideIcon;
  /** The URL to open in a new tab. */
  href: string;
  /** Roles that can see this action. */
  roles: StaffRole[];
}

const EXTRA_QUICK_ACTIONS: ExtraQuickAction[] = [
  {
    route: "compliance-report",
    label: "Compliance Report",
    icon: FileText,
    href: "/reports/compliance",
    roles: ["REGISTRAR", "INSPECTOR", "OFFICER"],
  },
];
