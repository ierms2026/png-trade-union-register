// =============================================================================
// Document-types where-builder — extracted from
// /api/dashboard/document-types/route.ts so the scoping logic is testable.
//
// The route handler calls `buildDocumentTypesWhere(user)` to get the
// `where` clauses for the document + union queries. Tests call it directly
// to verify Officer scoping without spinning up a Next server.
//
// T75b (D17): now uses getUnionScope for fail-closed behavior. An Officer or
// Representative with no assigned union returns `{ kind: "none" }` — the
// route handler turns that into a 403. This function returns
// `{ docWhere: { disposedAt: null }, unionWhere: {} }` for the "none" scope
// (the route handler is responsible for checking the scope BEFORE calling
// this function and returning 403 for "none").
// =============================================================================

import { getUnionScope, type UnionScope } from "@/lib/auth/union-scope";

export interface DocumentTypesWhere {
  /** Where clause for the document query (disposedAt: null + optional unionId). */
  docWhere: { disposedAt: null; unionId?: string };
  /** Where clause for the union count query (scoped to one union, or empty). */
  unionWhere: { id?: string };
}

/**
 * Get the union scope for a user. The route handler checks this BEFORE
 * calling buildDocumentTypesWhere — if the scope is "none", the handler
 * returns 403 and never calls this function.
 */
export function getDocumentTypesScope(user: {
  role: string;
  assignedUnionId: string | null;
}): UnionScope {
  return getUnionScope(user);
}

/**
 * Build the where-clauses for the document-types query, scoped by role.
 *
 * The caller MUST first check `getDocumentTypesScope(user)` and return 403
 * if the scope is `{ kind: "none" }`. This function is only called for
 * `{ kind: "all" }` or `{ kind: "union", unionId }` scopes.
 *
 * @param user The authenticated user (role + assignedUnionId)
 * @returns docWhere + unionWhere for the Prisma queries
 */
export function buildDocumentTypesWhere(user: {
  role: string;
  assignedUnionId: string | null;
}): DocumentTypesWhere {
  const scope = getUnionScope(user);

  if (scope.kind === "union") {
    return {
      docWhere: { disposedAt: null, unionId: scope.unionId },
      unionWhere: { id: scope.unionId },
    };
  }

  // kind === "all" (Registrar / Inspector) — or kind === "none" (the caller
  // should have returned 403 before reaching here, but defensively we return
  // an empty where that would match nothing only if the caller didn't check.
  // For "all", return unscoped as before.
  return {
    docWhere: { disposedAt: null },
    unionWhere: {},
  };
}
