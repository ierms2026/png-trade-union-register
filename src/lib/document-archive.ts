import { NextResponse } from "next/server";

// =============================================================================
// Archival lockdown helper — used by all document mutation routes to enforce
// read-only archival. Once a document's archivedAt is set, uploads, restores,
// and text extraction are blocked (HTTP 423 Locked).
//
// This is the legal-defensibility core: sensitive documents (Secret Ballots,
// Election of Office Bearers, Inspection Reports) must be tamper-proof during
// their 7-year retention window. The archival flag is the lock; this helper
// is the enforcement.
// =============================================================================

/**
 * Check if a document is archived. Returns a 423 Locked response if it is,
 * or null if the document is not archived (mutation is allowed).
 *
 * Usage:
 *   const archived = checkArchival(doc);
 *   if (archived) return archived;
 */
export function checkArchival(
  doc: { archivedAt?: Date | string | null } | null,
): NextResponse | null {
  if (doc?.archivedAt) {
    return NextResponse.json(
      {
        error:
          "This document is in read-only archival (retention window active). " +
          "Modifications — including new version uploads, restores, and text extraction — " +
          "are blocked to preserve the document's evidentiary integrity. " +
          "Only a Registrar can override this lock with a documented reason.",
      },
      { status: 423 }, // 423 Locked
    );
  }
  return null;
}
