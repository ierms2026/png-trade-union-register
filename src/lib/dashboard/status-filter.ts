import type { ComplianceStatus } from "./status-config";
import { APPLICABLE_STATUSES } from "./status-config";

// =============================================================================
// Status Filter Helper — the canonical way to navigate to the Compliance
// matrix filtered by a specific status.
//
// Extracted from the deleted Compliance Status Distribution tiles' click
// handler (chunk 1.3). The tiles are gone, but the click-to-filter behavior
// survives here for chunk 2.1 to reuse in whatever fills the empty grid slot.
//
// CONTRACT (for chunk 2.1):
//   - Call `navigateToComplianceFilter(status)` to get the navigation target
//   - The caller is responsible for setting the filter state + navigating
//     (e.g. `setInitialStatusFilter(result.filter); setActiveView(result.view)`)
//   - `status` must be one of the APPLICABLE_STATUSES (COMPLIANT, EXPIRING,
//     OVERDUE, MISSING). NOT_APPLICABLE is not filterable.
// =============================================================================

/** The navigation result — which view to show and what filter to apply. */
export interface ComplianceFilterNavigation {
  /** Always "compliance" — the view to navigate to. */
  view: "compliance";
  /** The compliance status to filter the matrix by. */
  filter: ComplianceStatus;
}

/**
 * Compute the navigation target for filtering the Compliance matrix by a
 * specific status. Pure function — no side effects.
 *
 * @param status One of the applicable compliance statuses
 * @returns `{ view: "compliance", filter: status }`
 * @throws If `status` is NOT_APPLICABLE (not filterable)
 */
export function navigateToComplianceFilter(
  status: ComplianceStatus,
): ComplianceFilterNavigation {
  if (status === "NOT_APPLICABLE") {
    throw new Error(
      `Cannot filter by NOT_APPLICABLE — it is excluded from the compliance matrix.`,
    );
  }
  return { view: "compliance", filter: status };
}

/**
 * Get the list of statuses that can be used with navigateToComplianceFilter.
 * This is the same as APPLICABLE_STATUSES, re-exported here so callers
 * don't need to import from status-config separately.
 */
export const FILTERABLE_STATUSES = APPLICABLE_STATUSES;
