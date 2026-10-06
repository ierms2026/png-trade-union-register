// =============================================================================
// Union scope helper — the single source of truth for role-based union
// scoping. Every route that limits data by role or assignedUnionId should
// call `getUnionScope(user)` instead of hand-rolling the check.
//
// D17 (fail closed): an Officer or Representative with no assigned union is
// an invalid state. They see NO data (a 403), never everything. Under the
// existing rule that Officers and Representatives are scoped to a union, an
// unassigned one is not allowed to see union-scoped data.
//
// Return values:
//   { kind: "all" }    — Registrar and Inspector (no union scoping)
//   { kind: "union", unionId } — Officer/Representative with a valid assigned union
//   { kind: "none" }   — Officer/Representative with null/empty/whitespace id,
//                        or any unknown role
// =============================================================================

export type UnionScope =
  | { kind: "all" }
  | { kind: "union"; unionId: string }
  | { kind: "none" };

/**
 * Determine a user's union scope from their role + assignedUnionId.
 *
 * @param user The authenticated user (role + assignedUnionId)
 * @returns One of:
 *   - { kind: "all" } for Registrar and Inspector (unscoped — see all unions)
 *   - { kind: "union", unionId } for Officer/Representative with a non-empty id
 *   - { kind: "none" } for Officer/Representative with no id, or unknown roles
 */
export function getUnionScope(user: {
  role: string;
  assignedUnionId: string | null;
}): UnionScope {
  // Registrar and Inspector are unscoped — they see all unions. This matches
  // the existing behavior across all staff routes (they never check
  // assignedUnionId for these roles).
  if (user.role === "REGISTRAR" || user.role === "INSPECTOR") {
    return { kind: "all" };
  }

  // Officer is scoped to their assigned union. A null, empty, or
  // whitespace-only id is an invalid state — fail closed (none).
  if (user.role === "OFFICER") {
    const unionId = user.assignedUnionId?.trim();
    if (unionId && unionId.length > 0) {
      return { kind: "union", unionId };
    }
    return { kind: "none" };
  }

  // Unknown role — fail closed.
  return { kind: "none" };
}
