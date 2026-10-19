import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";

// =============================================================================
// GET /api/officers
// -----------------------------------------------------------------------------
// Lists OFFICER-role users + the union each is assigned to.
//
// Purpose: powers the "Assigned officer" filter on the Search view. A
// Registrar/Inspector can pick an officer from the dropdown to filter
// documents to that officer's union — useful when reviewing a specific
// officer's filings without having to look up which union is theirs.
//
// WHY A SEPARATE ENDPOINT (vs. reusing /api/users or /api/tasks/assignees):
//   - /api/users is REGISTRAR-only — Inspectors can't call it. But Inspectors
//     can search, and they need the officer filter too.
//   - /api/tasks/assignees returns ALL non-disabled users (any role), not
//     just officers. Reusing it would surface Registrars/Inspectors in the
//     "Assigned officer" dropdown, which is misleading.
//   - This endpoint returns only OFFICER users (the only role with
//     assignedUnionId), with the union name pre-joined so the dropdown can
//     show "jane@example.com — Alpha Union" without a second fetch.
//
// AUTH: REGISTRAR + INSPECTOR. Officers don't see this filter — their search
// is already scoped to their own union (the filter would always be
// themselves).
//
// RESPONSE SHAPE:
//   {
//     officers: [{
//       id: string,
//       email: string,
//       assignedUnionId: string | null,
//       unionName: string | null
//     }]
//   }
// =============================================================================

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  // REGISTRAR + INSPECTOR can call this. Officers get 403 — their search is
  // already scoped, the filter is meaningless for them.
  if (user.role === Role.OFFICER) {
    return NextResponse.json(
      { error: "Officer search is scoped to your own union — this filter is not applicable." },
      { status: 403 },
    );
  }

  // Fetch officer users + the unions they're assigned to. The User model
  // has assignedUnionId but NO Prisma relation to Union (the relation was
  // never declared in the schema — see prisma/schema.prisma). We do two
  // queries + a client-side join: officers first, then a single batched
  // union lookup. This avoids N+1 (would be 1 query per officer for their
  // union name).
  const officers = await db.user.findMany({
    where: {
      role: Role.OFFICER,
      disabled: false,
    },
    select: {
      id: true,
      email: true,
      assignedUnionId: true,
    },
    orderBy: { email: "asc" },
  });

  // Batched union lookup — single query for all assignedUnionIds.
  const unionIds = Array.from(
    new Set(
      officers
        .map((o) => o.assignedUnionId)
        .filter((id): id is string => id !== null),
    ),
  );
  const unions =
    unionIds.length > 0
      ? await db.union.findMany({
          where: { id: { in: unionIds } },
          select: { id: true, unionName: true },
        })
      : [];
  const unionNameById = new Map(unions.map((u) => [u.id, u.unionName]));

  // Flatten into a simple shape for the dropdown.
  return NextResponse.json({
    officers: officers.map((o) => ({
      id: o.id,
      email: o.email,
      assignedUnionId: o.assignedUnionId,
      unionName: o.assignedUnionId ? (unionNameById.get(o.assignedUnionId) ?? null) : null,
    })),
  });
}
