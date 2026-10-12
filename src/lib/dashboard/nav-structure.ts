// =============================================================================
// Nav Structure — the SINGLE SOURCE OF TRUTH for the staff dashboard's
// navigation, search palette, quick actions, + breadcrumbs.
//
// IA-1 (navigation restructure): the nav is now organized into 6 groups:
//   1. Dashboard        — the landing page (all roles)
//   2. Registry          — Unions, Documents, My Union, Compare
//   3. Compliance        — Compliance matrix, Rules
//   4. Work              — Tasks, Calendar
//   5. Oversight         — Retention & Disposal, Audit Log, Review Queue,
//                           Contact Updates, Search
//   6. Administration    — Users, Access Monitoring, API Keys, Webhooks,
//                           Resources
//
// ROLE VISIBILITY:
//   REGISTRAR  — all groups
//   INSPECTOR  — Dashboard, Registry, Compliance, Work, Oversight (NO
//                Administration). Retention is REJECT-ONLY (can see the
//                queue but cannot approve disposals — enforced server-side).
//   OFFICER    — Dashboard, My Union (Registry), Compliance, Work (Tasks +
//                Calendar only). NO Oversight, NO Administration.
//
// GROUP HEADINGS: the sidebar renders group headings and hides empty groups
// (groups with zero role-accessible destinations). See SidebarNav in
// app-shell.tsx.
// =============================================================================

import {
  LayoutDashboard, Building2, CheckCircle2, Settings2, GitCompare,
  ListTodo, Calendar, ScrollText, Users, Shield, Key, FileCheck, Home,
  Scale, Contact as AddressBook, Webhook, FileText, Plus, Upload, Search,
  Archive, ClipboardList, HelpCircle, MonitorCog, type LucideIcon,
} from "lucide-react";

/** The three staff roles. Matches AuthUser["role"] in app-shell.tsx. */
export type StaffRole = "REGISTRAR" | "INSPECTOR" | "OFFICER";

/**
 * Quick-action descriptor. A destination with `quickAction` set appears as a
 * button in the dashboard's Quick Actions row.
 */
export type QuickAction =
  | { kind: "navigate"; shortLabel?: string; roles?: StaffRole[] }
  | { kind: "external"; href: string; shortLabel?: string; roles?: StaffRole[] };

/**
 * A single nav destination.
 */
export interface NavDestination {
  /** The CANONICAL label — used in the sidebar, palette, breadcrumb, page heading. */
  label: string;
  /** The route string (passed to onNavigate). */
  route: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Roles that can see this destination. */
  roles: StaffRole[];
  /** Optional aliases for palette fuzzy-search (never shown to the user). */
  aliases?: string[];
  /** Optional quick-action descriptor. */
  quickAction?: QuickAction;
}

/**
 * A nav group. Has a heading label + an icon + 1+ destinations.
 *
 * In the sidebar, the group's `label` is rendered as a section heading
 * above its destinations. Groups with zero role-accessible destinations
 * are hidden entirely.
 */
export interface NavGroup {
  /** The group's heading label (shown as a section heading in the sidebar). */
  label: string;
  /** The group's icon (shown next to the heading, or used for the palette). */
  icon: LucideIcon;
  /** The destinations in this group. */
  destinations: NavDestination[];
  /**
   * Optional route for a single-destination group. When set, the group
   * heading is also a direct link to this route.
   */
  route?: string;
}

/**
 * The complete nav structure. 6 groups, ordered top-to-bottom in the sidebar.
 *
 * IA-1 groups:
 *   Dashboard → Registry → Compliance → Work → Oversight → Administration
 *
 * Help is a standalone top-level item (not in a group) — always visible,
 * rendered at the bottom of the sidebar.
 */
export const NAV_STRUCTURE: NavGroup[] = [
  // --- 1. Dashboard --------------------------------------------------------
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    destinations: [
      { label: "Dashboard", route: "dashboard", icon: LayoutDashboard, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"] },
    ],
    route: "dashboard",
  },

  // --- 2. Registry ---------------------------------------------------------
  {
    label: "Registry",
    icon: Building2,
    destinations: [
      // REGISTRAR + INSPECTOR see "Unions". OFFICER sees "My Union" instead.
      { label: "Unions", route: "unions", icon: Building2, roles: ["REGISTRAR", "INSPECTOR"], aliases: ["Register Union"], quickAction: { kind: "navigate", shortLabel: "Register Union", roles: ["REGISTRAR"] } },
      { label: "My Union", route: "my-union", icon: Home, roles: ["OFFICER"], quickAction: { kind: "navigate", shortLabel: "Upload Document" } },
      { label: "Documents", route: "documents", icon: FileText, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"], aliases: ["Upload Document"], quickAction: { kind: "navigate", shortLabel: "Upload Document", roles: ["REGISTRAR"] } },
      // IA-2: Compare is now a tab inside Compliance. Keep the route in
      // aliases so the palette still finds it, but remove it from the nav.
    ],
  },

  // --- 3. Compliance -------------------------------------------------------
  {
    label: "Compliance",
    icon: CheckCircle2,
    destinations: [
      // IA-2: Compare + Rules are now tabs inside the Compliance view.
      // The compliance destination covers all three tabs.
      { label: "Compliance", route: "compliance", icon: CheckCircle2, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"], aliases: ["Compliance Matrix", "Compliance Status", "Compare Unions", "Compare", "Configure Rules", "Rules"] },
    ],
  },

  // --- 4. Work -------------------------------------------------------------
  {
    label: "Work",
    icon: ListTodo,
    destinations: [
      { label: "Tasks", route: "tasks", icon: ListTodo, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"], aliases: ["Create Task"], quickAction: { kind: "navigate", shortLabel: "Create Task" } },
      { label: "Calendar", route: "calendar", icon: Calendar, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"] },
    ],
  },

  // --- 5. Review & Audit ----------------------------------------------------
  // IA-3: renamed from "Oversight" to avoid confusion with the document-type
  // category "Oversight" (Inspection Reports, Awards, General Matters). The
  // nav group covers Retention, Review Queue, Contact Updates, Audit Log,
  // + Search — all review/audit workflows. The document category keeps its
  // name "Oversight".
  {
    label: "Review & Audit",
    icon: ClipboardList,
    destinations: [
      // IA-1: Retention renamed to "Retention & Disposal". INSPECTOR can see
      // it (reject-only — server-enforced). REGISTRAR can approve.
      { label: "Retention & Disposal", route: "retention", icon: Archive, roles: ["REGISTRAR", "INSPECTOR"], aliases: ["Retention", "Retention Queue"] },
      { label: "Review Queue", route: "reviews", icon: FileCheck, roles: ["REGISTRAR"] },
      { label: "Contact Updates", route: "contact-requests", icon: AddressBook, roles: ["REGISTRAR"], aliases: ["Contact Update Requests"] },
      { label: "Audit Log", route: "audit", icon: ScrollText, roles: ["REGISTRAR", "INSPECTOR"], aliases: ["Audit"], quickAction: { kind: "navigate", shortLabel: "View Audit Log" } },
      // IA-1: Search is in the sidebar for REGISTRAR + INSPECTOR. OFFICER
      // accesses search via Cmd+K palette (the sidebar for officers is
      // intentionally minimal: Dashboard, My Union, Compliance, Tasks, Calendar).
      { label: "Search", route: "search", icon: Search, roles: ["REGISTRAR", "INSPECTOR"], aliases: ["Search Documents"] },
    ],
  },

  // --- 6. Administration ---------------------------------------------------
  {
    label: "Administration",
    icon: Shield,
    destinations: [
      { label: "Users", route: "users", icon: Users, roles: ["REGISTRAR"] },
      // IA-1: "Security" renamed to "Access Monitoring".
      { label: "Access Monitoring", route: "security", icon: MonitorCog, roles: ["REGISTRAR"], aliases: ["Security", "Security Dashboard"] },
      { label: "API Keys", route: "api-keys", icon: Key, roles: ["REGISTRAR"] },
      { label: "Webhooks", route: "webhooks", icon: Webhook, roles: ["REGISTRAR"] },
      { label: "Resources", route: "legislation", icon: Scale, roles: ["REGISTRAR"], aliases: ["Resources Library", "Legislation", "Legislation Library"] },
    ],
  },
];

/**
 * Standalone items (not in a group). Rendered at the bottom of the sidebar.
 * Help is always visible to all roles.
 */
export const STANDALONE_NAV_ITEMS: NavDestination[] = [
  { label: "Help & Guide", route: "help", icon: HelpCircle, roles: ["REGISTRAR", "INSPECTOR", "OFFICER"], aliases: ["Guide", "Glossary", "Status Glossary"] },
];

// =============================================================================
// Helpers — single source of truth for nav, palette, quick actions, breadcrumbs
// =============================================================================

/**
 * Filter the nav structure to the destinations available to a given role.
 *
 * - Groups with NO available destinations are dropped entirely (e.g. an
 *   OFFICER sees no "Review & Audit" or "Administration" group).
 * - Within a group, only the role-accessible destinations are returned.
 * - The "Retention & Disposal" destination is filtered out when
 *   `retentionEnabled` is false (default).
 *
 * Pure: no I/O, no side effects.
 */
export function getNavForRole(role: StaffRole, retentionEnabled = false): NavGroup[] {
  return NAV_STRUCTURE.map((group) => ({
    ...group,
    destinations: group.destinations.filter((d) => {
      if (d.route === "retention" && !retentionEnabled) return false;
      return d.roles.includes(role);
    }),
  }))
    .filter((group) => group.destinations.length > 0);
}

/**
 * Return the standalone nav items visible to a role (Help, etc.).
 */
export function getStandaloneNavItems(role: StaffRole): NavDestination[] {
  return STANDALONE_NAV_ITEMS.filter((d) => d.roles.includes(role));
}

/**
 * Walk the full nav structure (all roles) and return every destination's
 * route. Includes standalone items. Used by route smoke tests.
 */
export function getAllRoutes(): string[] {
  return [
    ...NAV_STRUCTURE.flatMap((group) => group.destinations.map((d) => d.route)),
    ...STANDALONE_NAV_ITEMS.map((d) => d.route),
  ];
}

/**
 * Find the group that contains a given route. Used by breadcrumbs + parent
 * highlight. Returns null if the route isn't in any group (e.g. standalone
 * items or special routes like account-security).
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
 * Find a specific destination by route. Searches groups + standalone items.
 */
export function findDestination(route: string): NavDestination | null {
  for (const group of NAV_STRUCTURE) {
    const dest = group.destinations.find((d) => d.route === route);
    if (dest) return dest;
  }
  const standalone = STANDALONE_NAV_ITEMS.find((d) => d.route === route);
  return standalone ?? null;
}

/**
 * Count the clicks required to reach a destination from the dashboard.
 * In the sidebar layout, every item is 1 click (no dropdowns).
 */
export function clicksToReach(route: string): number {
  if (route === "dashboard") return 0;
  const group = findGroupForRoute(route);
  if (group) return 1;
  const standalone = STANDALONE_NAV_ITEMS.find((d) => d.route === route);
  if (standalone) return 1;
  return Infinity;
}

// =============================================================================
// Palette entries — derived from NAV_STRUCTURE + STANDALONE_NAV_ITEMS, filtered by role.
// =============================================================================

export interface PaletteEntry {
  route: string;
  label: string;
  icon: LucideIcon;
  aliases: string[];
  groupLabel: string;
}

export function getPaletteEntries(role: StaffRole, retentionEnabled = false): PaletteEntry[] {
  const groupEntries = getNavForRole(role, retentionEnabled).flatMap((group) =>
    group.destinations.map((dest) => ({
      route: dest.route,
      label: dest.label,
      icon: dest.icon,
      aliases: dest.aliases ?? [],
      groupLabel: group.label,
    })),
  );
  const standaloneEntries = getStandaloneNavItems(role).map((dest) => ({
    route: dest.route,
    label: dest.label,
    icon: dest.icon,
    aliases: dest.aliases ?? [],
    groupLabel: "Help",
  }));
  return [...groupEntries, ...standaloneEntries];
}

// =============================================================================
// Quick actions — derived from NAV_STRUCTURE, filtered by role.
// =============================================================================

export interface QuickActionEntry {
  route: string;
  label: string;
  icon: LucideIcon;
  kind: "navigate" | "external";
  href?: string;
}

export function getQuickActions(role: StaffRole): QuickActionEntry[] {
  const entries: QuickActionEntry[] = [];
  const seenLabels = new Set<string>();
  for (const group of NAV_STRUCTURE) {
    for (const dest of group.destinations) {
      if (!dest.quickAction) continue;
      if (!dest.roles.includes(role)) continue;
      if (dest.quickAction.roles && !dest.quickAction.roles.includes(role)) continue;
      const label = dest.quickAction.shortLabel ?? dest.label;
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);
      if (dest.quickAction.kind === "navigate") {
        entries.push({ route: dest.route, label, icon: dest.icon, kind: "navigate" });
      } else {
        entries.push({ route: dest.route, label, icon: dest.icon, kind: "external", href: dest.quickAction.href });
      }
    }
  }
  for (const extra of EXTRA_QUICK_ACTIONS) {
    if (!extra.roles.includes(role)) continue;
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

interface ExtraQuickAction {
  route: string;
  label: string;
  icon: LucideIcon;
  href: string;
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
