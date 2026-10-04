import type { ComplianceStatus } from "./status-config";
import { APPLICABLE_STATUSES } from "./status-config";

// =============================================================================
// Dashboard Links — the single source of truth for deep-linkable dashboard
// URLs. Components never string-build hrefs; they call these builders.
//
// The SPA is a single-page app at "/" with in-memory view switching. URL
// params (?view=compliance&status=OVERDUE) are read on mount in page.tsx
// and used to set the initial view + filter state. This makes the dashboard
// deep-linkable: pasting a URL reproduces the filter.
//
// PARAM CONTRACT (public API for future chunks):
//   ?view=compliance        — navigate to the compliance view
//   ?view=unions            — navigate to the unions view
//   ?status=OVERDUE         — filter the compliance view by status
//   ?status=EXPIRING        — filter the compliance view by expiring
//   (values are uppercase ComplianceStatus values from status-config)
//
// FUTURE EXTENSIONS (do NOT implement in this chunk):
//   ?status=overdue,expiring — multi-status (would fix 3.1's "View all")
//   ?daysAhead=60            — date-range filter (would activate 3.3's 60/90)
//   ?documentType=Financial%20Return — type filter (for 2.2's meters)
// =============================================================================

/** URL parameter key for the dashboard view. */
export const PARAM_VIEW = "view";

/** URL parameter key for the compliance status filter. */
export const PARAM_STATUS = "status";

/** Valid `view` param values. */
export type ViewParam =
  | "compliance" | "unions" | "dashboard" | "search" | "documents" | "document-detail"
  | "tasks" | "reviews" | "retention" | "contact-requests" | "calendar" | "audit"
  | "users" | "security" | "api-keys" | "webhooks" | "legislation"
  | "configure-rules" | "compare" | "my-union" | "account-security" | "help";

/**
 * Build a deep-link URL for the compliance view filtered by a specific status.
 * Returns a relative URL suitable for `<a href={...}>`.
 *
 * @param status One of the applicable compliance statuses (COMPLIANT, EXPIRING, OVERDUE, MISSING)
 * @returns e.g. "/?view=compliance&status=OVERDUE"
 */
export function complianceFilterUrl(status: ComplianceStatus): string {
  if (status === "NOT_APPLICABLE") {
    throw new Error("Cannot filter by NOT_APPLICABLE — it is excluded from the compliance matrix.");
  }
  return `/?${PARAM_VIEW}=compliance&${PARAM_STATUS}=${status}`;
}

/**
 * Build a deep-link URL for the compliance view, unfiltered.
 * @returns "/?view=compliance"
 */
export function complianceUnfilteredUrl(): string {
  return `/?${PARAM_VIEW}=compliance`;
}

/**
 * Build a deep-link URL for the unions list view.
 * @returns "/?view=unions"
 */
export function unionsListUrl(): string {
  return `/?${PARAM_VIEW}=unions`;
}

/**
 * Parse a status param value from the URL into a validated StatusFilter.
 * Returns null for absent or invalid values (caller should treat null as "ALL").
 *
 * @param value The raw param value (e.g. "OVERDUE" from ?status=OVERDUE)
 * @returns The validated ComplianceStatus, or null if absent/invalid
 */
export function parseStatusParam(value: string | null): ComplianceStatus | null {
  if (!value) return null;
  // Check if the value is one of the applicable statuses
  const normalized = value.toUpperCase();
  if (APPLICABLE_STATUSES.includes(normalized as ComplianceStatus)) {
    return normalized as ComplianceStatus;
  }
  // Invalid value — degrade to null (unfiltered)
  return null;
}

/**
 * Parse a view param value from the URL into a validated view name.
 * Returns null for absent or invalid values (caller should treat null as "dashboard").
 *
 * @param value The raw param value (e.g. "compliance" from ?view=compliance)
 * @returns The validated view name, or null if absent/invalid
 */
export function parseViewParam(value: string | null): ViewParam | null {
  if (!value) return null;
  const validViews: ViewParam[] = [
    "compliance", "unions", "dashboard", "search", "documents", "document-detail",
    "tasks", "reviews", "retention", "contact-requests", "calendar", "audit",
    "users", "security", "api-keys", "webhooks", "legislation",
    "configure-rules", "compare", "my-union", "account-security", "help",
  ];
  if (validViews.includes(value as ViewParam)) {
    return value as ViewParam;
  }
  return null;
}
