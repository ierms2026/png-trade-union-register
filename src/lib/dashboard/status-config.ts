import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileQuestion,
  Ban,
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

/** The 5 compliance statuses, matching the compliance calculator's output. */
export type ComplianceStatus =
  | "COMPLIANT"
  | "EXPIRING"
  | "OVERDUE"
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
  "MISSING",
  "NOT_APPLICABLE",
];

/**
 * Statuses that count toward the compliance rate denominator.
 * NOT_APPLICABLE is excluded from both numerator and denominator
 * (per computeUnionScore in calculator.ts).
 */
export const APPLICABLE_STATUSES: ComplianceStatus[] = [
  "COMPLIANT",
  "EXPIRING",
  "OVERDUE",
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
 */
export const STATUS_CONFIG: Record<ComplianceStatus, StatusConfig> = {
  COMPLIANT: {
    label: "Compliant",
    colorToken: "var(--status-compliant)",
    icon: CheckCircle2,
    definition:
      "Document filed, approved by Registrar, and renewal date is more than 90 days away.",
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
  MISSING: {
    label: "Missing",
    colorToken: "var(--status-missing)",
    icon: FileQuestion,
    definition:
      "No document filed, document disposed, or document awaiting Registrar review (PENDING/REJECTED).",
  },
  NOT_APPLICABLE: {
    label: "N/A",
    colorToken: "var(--status-muted)",
    icon: Ban,
    definition: "Document type is not required for this union (rule.required = false).",
  },
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
