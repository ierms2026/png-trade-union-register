import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileQuestion,
  Ban,
  Clock,
  type LucideIcon,
} from "lucide-react";

// =============================================================================
// Status Config — the single source of truth for compliance status labels,
// colors, icons, and definitions.
//
// Per chunk 0.1 audit:
//   - EXPIRING_WINDOW_DAYS = 90 (matches calculator.ts line 130)
//   - MISSING includes PENDING/REJECTED review statuses (review workflow
//     Option A: un-reviewed uploads don't count toward compliance)
//   - NOT_APPLICABLE = rule.required === false (no such rules in current
//     seed, but the type must handle it for future config changes)
//
// Color tokens reference CSS variables defined in globals.css. This module
// is the ONLY place where status → color/label/icon mappings live. The
// guard test (status-config-guard.test.ts) enforces that dashboard
// components do not hardcode hex color codes.
// =============================================================================

/** The compliance statuses, matching the compliance calculator's output. */
export type ComplianceStatus =
  | "COMPLIANT"
  | "EXPIRING"
  | "OVERDUE"
  | "AWAITING_REVIEW"
  | "MISSING"
  | "NOT_APPLICABLE";

/**
 * Number of days before a document's renewal date at which it transitions
 * from COMPLIANT to EXPIRING.
 *
 * Per the audit: this threshold lives in calculator.ts:130 and is the
 * canonical value. This module re-exports it so dashboard components can
 * import it from one place rather than reaching into the calculator.
 */
export const EXPIRING_WINDOW_DAYS = 90;

/**
 * Forecast buckets for the Expiry Forecast card (chunk 3.3).
 * Each value is a day-count boundary: (0, 30], (30, 60], (60, 90].
 *
 * NOTE: buckets[0] (30) is NOT equal to EXPIRING_WINDOW_DAYS (90).
 * The expiring window is 90 days (any doc due within 90 days is "Expiring").
 * The forecast buckets subdivide that window into finer-grained urgency
 * buckets (30/60/90). The config test asserts buckets[0] <= EXPIRING_WINDOW_DAYS
 * (the first bucket is within the expiring window), not equality.
 *
 * If someone later splits the expiring window from the forecast granularity,
 * the test forces a conscious decision.
 */
export const FORECAST_BUCKETS = [30, 60, 90] as const;

/**
 * Trend window for the Compliance Trend chart (chunk 4.2b).
 *
 * The chart renders the most recent N days of available history — derived
 * from point dates, never hardcoded. If fewer than N days of history
 * exist, the chart renders what's available (no padding, no synthesis —
 * per 4.2a's gap semantics).
 *
 * Default 365: ~one year of daily snapshots. A longer window would
 * compress the x-axis too much for daily labels; a shorter window would
 * miss year-over-year context. 6.2 may tune this for the final layout.
 *
 * This constant lives HERE (beside FORECAST_BUCKETS) so all dashboard
 * chart windows have a single config home — a future "config audit" can
 * find every window constant by grepping this file.
 */
export const TREND_WINDOW_DAYS = 365;

/**
 * Responsive breakpoint for the dashboard's final layout (chunk 6.1).
 *
 * Below this width, the two-column rows (Needs-Attention + Composition,
 * Required-vs-On-File + Expiry-Forecast, Trend + Recent-Activity) stack
 * vertically in DOM order. The KPI band wraps via auto-fit (independent
 * of this breakpoint).
 *
 * Value: 1024 (the chunk spec's "~1024px"). Single home for the dashboard
 * breakpoint so 6.2 / 6.3 can find it via grep.
 *
 * The Tailwind `lg:` prefix corresponds to 1024px by default — this constant
 * is for documentation + tests, not for Tailwind class generation (the
 * layout uses `lg:grid-cols-2` which already matches).
 */
export const DASHBOARD_BREAKPOINT_PX = 1024;

/**
 * Sentinel value for rules that effectively never expire (one-time filings
 * like a Constitution). Set renewalYears to this in the seed to mark a rule
 * as "no renewal required." Matches calculator.ts:145.
 */
export const NEVER_RENEW_YEARS = 99;

/** Ordered list of all compliance statuses, in canonical display order. */
export const COMPLIANCE_STATUSES: ComplianceStatus[] = [
  "COMPLIANT",
  "EXPIRING",
  "OVERDUE",
  "AWAITING_REVIEW",
  "MISSING",
  "NOT_APPLICABLE",
];

/**
 * Statuses that count toward the compliance rate denominator.
 * NOT_APPLICABLE is excluded from both numerator and denominator
 * (per computeUnionScore in calculator.ts).
 *
 * AWAITING_REVIEW IS included in the denominator — the document type IS
 * required, the union just hasn't gotten approval yet. This means a pending
 * review lowers the compliance rate (it's not compliant yet), but the
 * matrix shows it as a distinct status (not folded into MISSING) so the
 * Registrar can see their review backlog.
 */
export const APPLICABLE_STATUSES: ComplianceStatus[] = [
  "COMPLIANT",
  "EXPIRING",
  "OVERDUE",
  "AWAITING_REVIEW",
  "MISSING",
];

export interface StatusConfig {
  /** Human-readable label, e.g. "Compliant" */
  label: string;
  /** CSS variable token, e.g. "var(--status-compliant)" */
  colorToken: string;
  /** Lucide icon component for badges / tiles */
  icon: LucideIcon;
  /** Human-readable definition (for tooltips, audit docs, onboarding) */
  definition: string;
}

/**
 * The canonical status configuration. Every dashboard component that
 * renders a status label, color, or icon MUST read from this object.
 *
 * DEFINITION TEMPLATES (chunk 6.2):
 *   Definitions are templates that interpolate threshold constants (e.g.
 *   `${EXPIRING_WINDOW_DAYS}`). This makes a future constant change
 *   propagate to the definition text automatically — or fail the
 *   `dashboard-status-config.test.ts` template-interpolation test loudly
 *   if someone hardcodes a number instead.
 *
 *   The grep invariant: NO status-definition prose in components. Every
 *   tooltip surfaces `STATUS_CONFIG[status].definition` (or
 *   `DASHBOARD_KPI_DEFINITIONS[key]` for the non-status KPIs).
 */
export const STATUS_CONFIG: Record<ComplianceStatus, StatusConfig> = {
  COMPLIANT: {
    label: "Compliant",
    colorToken: "var(--status-compliant)",
    icon: CheckCircle2,
    // Template: interpolates EXPIRING_WINDOW_DAYS so a constant change
    // propagates to the definition text. Aligns with the calculator's
    // derivation (reviewStatus === "APPROVED" + expiryDate > now + window).
    definition: `Document filed, approved by Registrar, with renewal date more than ${EXPIRING_WINDOW_DAYS} days away.`,
  },
  EXPIRING: {
    label: "Expiring",
    colorToken: "var(--status-expiring)",
    icon: AlertTriangle,
    definition: `Document filed and approved, but renewal date is within ${EXPIRING_WINDOW_DAYS} days.`,
  },
  OVERDUE: {
    label: "Overdue",
    colorToken: "var(--status-overdue)",
    icon: XCircle,
    definition: "Document filed and approved, but renewal date has passed.",
  },
  AWAITING_REVIEW: {
    label: "Awaiting Review",
    colorToken: "var(--status-review)",
    icon: Clock,
    definition:
      "Document has been uploaded by the union but the Registrar has not yet approved it (or has rejected it). The union has done their part — this is not a gap in compliance, it's an item on the Registrar's desk.",
  },
  MISSING: {
    label: "Missing",
    colorToken: "var(--status-missing)",
    icon: FileQuestion,
    definition:
      "No document has been filed for this type, or a previously-filed document was disposed under retention rules. The union needs to file a new document.",
  },
  NOT_APPLICABLE: {
    label: "N/A",
    colorToken: "var(--status-muted)",
    icon: Ban,
    definition: "Document type is not required for this union (rule.required = false).",
  },
};

// =============================================================================
// KPI definitions — for the non-status KPI cards (Total Unions, Documents,
// Compliance Rate). The status KPIs (Compliant, Expiring, Overdue, Missing)
// use STATUS_CONFIG above; these are for the cards that don't map to a
// ComplianceStatus.
//
// Per chunk 6.2 spec: "Documents card (definition = the 1.1 DECISION text,
// e.g. 'Active documents on file; superseded uploads excluded' — this
// definition has governed the numbers since 1.1; today it finally reaches
// users); Total Unions ('Registered unions'); the rate card's existing 1.2
// tooltip (verify intact)."
//
// The 1.2 rate card tooltip is hardcoded in the RateKpiCard component
// (lines 198-220 of dashboard.tsx) — it's the existing tooltip, verified
// intact. It does NOT live here because it's a single-purpose tooltip on a
// single card, not a config-driven definition. If 6.3+ wants to surface it
// elsewhere, lift it here then.
// =============================================================================

/**
 * Definitions for the non-status KPI cards. Keys correspond to the card's
 * `label` text (not the underlying data field) so the tooltip can look up
 * the definition by the same string the user sees.
 *
 * "Total Unions" — counts all unions in the registry regardless of status
 *   (ACTIVE/SUSPENDED/DEREGISTERED). The dashboard's stats API returns
 *   `totalUnions` from `db.union.count({})` — no status filter.
 *
 * "Documents" — the 1.1 DECISION: "active" documents = non-disposed
 *   (`disposedAt: null`). The 0.1 audit found a 23-vs-21 discrepancy
 *   (disposed vs non-disposed); 1.1 decided active-only. This definition
 *   text has governed the number since 1.1; today (6.2) it finally reaches
 *   users via the tooltip.
 */
export const DASHBOARD_KPI_DEFINITIONS: Readonly<Record<string, string>> = {
  "Total Unions": "Registered unions in the registry, across all statuses (Active, Suspended, Deregistered).",
  "Documents": "Active documents on file; superseded uploads and disposed documents excluded.",
};

// ---------------------------------------------------------------------------
// Selector helpers — logic lives here, not in components.
// ---------------------------------------------------------------------------

export function getStatusConfig(status: ComplianceStatus): StatusConfig {
  return STATUS_CONFIG[status];
}

export function getStatusLabel(status: ComplianceStatus): string {
  return STATUS_CONFIG[status].label;
}

export function getStatusColorToken(status: ComplianceStatus): string {
  return STATUS_CONFIG[status].colorToken;
}

export function getStatusIcon(status: ComplianceStatus): LucideIcon {
  return STATUS_CONFIG[status].icon;
}

export function getStatusDefinition(status: ComplianceStatus): string {
  return STATUS_CONFIG[status].definition;
}

export function isApplicableStatus(status: ComplianceStatus): boolean {
  return status !== "NOT_APPLICABLE";
}

/**
 * Returns the statuses that should be displayed as compliance KPI tiles.
 * NOT_APPLICABLE is excluded from the tile row (it doesn't represent a
 * compliance failure or success — it's a non-requirement).
 */
export function getTileStatuses(): ComplianceStatus[] {
  return APPLICABLE_STATUSES;
}
