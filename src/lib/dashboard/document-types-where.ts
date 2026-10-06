// =============================================================================
// Document-types where-builder — extracted from
// /api/dashboard/document-types/route.ts so the scoping logic is testable.
//
// The route handler calls `buildDocumentTypesWhere(user)` to get the
// `where` clauses for the document + union queries. Tests call it directly
// to verify Officer scoping without spinning up a Next server.
//
// BEHAVIOR (identical to the route before extraction):
//   - Officer WITH assignedUnionId: scoped to that union
//   - Officer WITHOUT assignedUnionId: UNSCOPED (returns all — this is a
//     known issue, reported in T60; do not change behavior without a task)
//   - Registrar / Inspector / Representative: unscoped
// =============================================================================

export interface DocumentTypesWhere {
  /** Where clause for the document query (disposedAt: null + optional unionId). */
  docWhere: { disposedAt: null; unionId?: string };
  /** Where clause for the union count query (scoped to one union, or empty). */
  unionWhere: { id?: string };
}

/**
 * Build the where-clauses for the document-types query, scoped by role.
 *
 * @param user The authenticated user (role + assignedUnionId)
 * @returns docWhere + unionWhere for the Prisma queries
 */
export function buildDocumentTypesWhere(user: {
  role: string;
  assignedUnionId: string | null;
}): DocumentTypesWhere {
  // Officer scoping: an Officer sees only their assigned union. If the
  // Officer has no assigned union, the check falls through to the unscoped
  // branch (returns all — known issue, see T60 report).
  if (user.role === "OFFICER" && user.assignedUnionId) {
    return {
      docWhere: { disposedAt: null, unionId: user.assignedUnionId },
      unionWhere: { id: user.assignedUnionId },
    };
  }

  // Non-officer (REGISTRAR / INSPECTOR / REPRESENTATIVE) — or Officer with
  // no assigned union (unscoped, known issue): no scoping.
  return {
    docWhere: { disposedAt: null },
    unionWhere: {},
  };
}
