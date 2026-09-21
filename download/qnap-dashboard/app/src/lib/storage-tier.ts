// =============================================================================
// Storage Tier Helper — computes the appropriate storage tier for a document
// based on its age, retention period, and document type.
//
// Following the codebase's "compute live, never store" principle (same as the
// compliance calculator), the storage tier is a derived property computed
// from the document's metadata — NOT a stored field. This avoids drift if
// rules change.
//
// Tiers (per the lifecycle spec):
//   ACTIVE       — Recent docs, currently in use. Served from fast storage.
//                  Used for: all docs within the first year of filing, or
//                  any doc not yet past its renewal period.
//   COLD_STORAGE — Long-term docs (past renewal period but within retention).
//                  Still accessible but served from slower storage. Most
//                  7-year retention docs spend years 2-7 here.
//   DEEP_ARCHIVE — Permanent / 50-year docs that have been in the system for
//                  10+ years. Moved to offline/cold storage, removed from
//                  active search indexes. Foundational docs (Registration
//                  Certificate, Application, Constitution) eventually land
//                  here.
//   DISPOSED     — Disposed docs. File content destroyed; only the metadata
//                  stub remains. The download endpoint still serves the
//                  metadata (for forensic purposes), but the .bin file
//                  is gone.
// =============================================================================

export type StorageTier = "ACTIVE" | "COLD_STORAGE" | "DEEP_ARCHIVE" | "DISPOSED";

export interface StorageTierInput {
  /** When the latest version was filed (uploadedAt or effectiveDate). */
  filedAt: Date | null;
  /** Retention period in years (from ComplianceRule). 99 = permanent. */
  retentionYrs: number;
  /** Renewal period in years. 99 = never renews. */
  renewalYears: number;
  /** Whether the document has been disposed (disposedAt is set). */
  disposed: boolean;
}

/**
 * Compute the storage tier for a document.
 *
 * Pure function — no I/O, no side effects. Pass a fixed `now` for
 * deterministic output (same pattern as the compliance calculator).
 */
export function computeStorageTier(
  input: StorageTierInput,
  now: Date = new Date(),
): StorageTier {
  // Disposed docs are always in the DISPOSED tier — the file content has
  // been destroyed; only the metadata stub remains.
  if (input.disposed) return "DISPOSED";

  // If no filedAt (no version uploaded), treat as ACTIVE (it's a brand-
  // new document row with no content yet).
  if (!input.filedAt) return "ACTIVE";

  const ageMs = now.getTime() - input.filedAt.getTime();
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const ageYears = ageMs / msPerYear;

  // Permanent docs (99-year retention): go to DEEP_ARCHIVE after 10 years.
  // These are foundational documents that should be in cold storage but
  // never deleted.
  if (input.retentionYrs >= 99) {
    return ageYears >= 10 ? "DEEP_ARCHIVE" : "ACTIVE";
  }

  // 50-year retention docs (Constitution): DEEP_ARCHIVE after 25 years.
  if (input.retentionYrs >= 50) {
    return ageYears >= 25 ? "DEEP_ARCHIVE" : "ACTIVE";
  }

  // 7-year retention docs: ACTIVE for first year (renewal period for
  // 1-year-cycle docs), then COLD_STORAGE for years 2-7.
  if (input.retentionYrs <= 7) {
    if (ageYears < 1) return "ACTIVE";
    return "COLD_STORAGE";
  }

  // Default: ACTIVE (shouldn't reach here with current doc types)
  return "ACTIVE";
}

/**
 * Human-readable label for each storage tier, used in UI badges.
 */
export const STORAGE_TIER_LABELS: Record<StorageTier, string> = {
  ACTIVE: "Active Storage",
  COLD_STORAGE: "Cold Storage",
  DEEP_ARCHIVE: "Deep Archive",
  DISPOSED: "Disposed",
};

/**
 * CSS classes for storage tier badges (same pattern as STATUS_BADGE_CLASSES
 * in the compliance calculator).
 */
export const STORAGE_TIER_BADGE_CLASSES: Record<StorageTier, string> = {
  ACTIVE: "bg-blue-100 text-blue-800 border-blue-200",
  COLD_STORAGE: "bg-indigo-100 text-indigo-800 border-indigo-200",
  DEEP_ARCHIVE: "bg-slate-200 text-slate-700 border-slate-300",
  DISPOSED: "bg-red-100 text-red-800 border-red-200",
};
