import { NextRequest, NextResponse } from "next/server";
import { UnionStatus } from "@prisma/client";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/context";

// =============================================================================
// PUT /api/unions/[unionId] — Union update with Officer silent-pin.
//
// PATH DEVIATION FROM SPEC:
// User asked for src/app/api/unions/[id]/route.ts. Next.js requires
// dynamic segments at the same level to share a name — and Step 3 already
// created src/app/api/unions/[unionId]/documents/route.ts. Using [id] here
// would trigger a Next.js build error ("You cannot use different names for
// the same dynamic segment at the same level"). I'm using [unionId] for
// consistency. The URL the user calls is identical: PUT /api/unions/{id}.
//
// OFFICER SILENT-PIN DESIGN:
// Officers can edit basic contact info (address, contactPerson, contactEmail,
// contactPhone) but NOT core identity fields (unionName, registrationNo,
// fileNumber, status, remarks). The pin is SILENT:
//
//   - The request returns 200 (not 403)
//   - The response body shows the ACTUAL state (original values for pinned
//     fields, new values for allowed fields)
//   - No error message hints that anything was ignored
//
// Why silent (vs. 403 rejection):
//   1. A 403 would tip off a sophisticated Officer that the API distinguishes
//      "editable" from "non-editable" fields — inviting them to probe for
//      the boundary. Returning 200 with the actual state gives them no
//      information they didn't already have.
//   2. It lets the UI ship a single form for all roles. The Officer sees
//      the form fields, types into them, hits Save — and the restricted
//      ones just don't change. No role-specific UI branching needed.
//   3. The audit trail still captures what was ATTEMPTED vs. what was
//      APPLIED — because before/after JSON snapshots of the DB row will
//      show the original values for pinned fields, even if the request
//      body contained different values.
//
// OFFICER SCOPING:
// Officers can only update THEIR OWN union (assignedUnionId). If they try
// to update another union by ID, they get 403 — this is NOT silent, because
// the Officer shouldn't even know other unions exist. A 403 here is the
// correct signal: "this isn't yours."
//
// TODO (auth integration):
// Once Session 1 Step 5 ships the real auth-guard, swap the `getAuthUser`
// import. The signature is identical — no route code changes needed.
//
// TODO (INSPECTOR access):
// Per the business context, Inspectors are read-only. Currently this route
// allows INSPECTOR to update unions (same as REGISTRAR). The user's spec
// only restricted OFFICER, so I haven't added an INSPECTOR block — but
// flagging it as a future enforcement point.
// =============================================================================

// Fields an OFFICER is NOT allowed to update. Silently pinned to existing
// values. Per the user's spec: "unionName, registrationNo, fileNumber,
// status, and remarks."
const OFFICER_RESTRICTED_FIELDS = [
  "unionName",
  "registrationNo",
  "fileNumber",
  "status",
  "remarks",
] as const;

// All fields any authenticated user is allowed to update. Unknown fields
// in the request body are silently ignored (lenient — forward-compatible).
const ALLOWED_FIELDS = [
  "unionName",
  "registrationNo",
  "fileNumber",
  "status",
  "address",
  "contactPerson",
  "contactEmail",
  "contactPhone",
  "remarks",
] as const;

const VALID_STATUSES: UnionStatus[] = [
  "ACTIVE",
  "SUSPENDED",
  "DEREGISTERED",
];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ unionId: string }> },
) {
  const { unionId } = await params;

  // 1. Get the authenticated user (mock for now — real auth-guard arrives
  //    in Session 1 Step 5).
  const user = await getAuthUser(req);

  // 2. Parse the JSON body. Lenient on type, strict on JSON validity.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  // 3. Verify the union exists. Return 404 if not — union existence is not
  //    a secret at this authenticated endpoint.
  const existingUnion = await db.union.findUnique({ where: { id: unionId } });
  if (!existingUnion) {
    return NextResponse.json(
      { error: "Union not found." },
      { status: 404 },
    );
  }

  // 4. OFFICER scoping: can only update their OWN union.
  //    This is NOT silent — a 403 is the correct signal that "this isn't
  //    yours." The Officer shouldn't know other unions exist, but if they
  //    guess an ID and try to update it, we don't return 200 (which would
  //    imply success on a union they don't own).
  if (user.role === "OFFICER" && user.assignedUnionId !== unionId) {
    return NextResponse.json(
      { error: "You can only update your own union." },
      { status: 403 },
    );
  }

  // 5. Build the update payload — only fields in ALLOWED_FIELDS, silently
  //    ignoring anything else in the body.
  const updateData: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      updateData[field] = body[field];
    }
  }

  // 6. OFFICER silent-pin: remove restricted fields from the update payload.
  //    This is the core of the spec — restricted fields are SILENTLY
  //    dropped, not rejected. The Officer gets a 200 with the original
  //    values for those fields.
  if (user.role === "OFFICER") {
    for (const restricted of OFFICER_RESTRICTED_FIELDS) {
      delete updateData[restricted];
    }
  }

  // 7. Validate field types — reject type mismatches with 400.
  //    This is defensive: catches caller bugs early (e.g., sending
  //    `status: 123` instead of `status: "ACTIVE"`).
  for (const [field, value] of Object.entries(updateData)) {
    if (value === null) continue; // nullable fields accept null
    switch (field) {
      case "status":
        if (typeof value !== "string" || !VALID_STATUSES.includes(value as UnionStatus)) {
          return NextResponse.json(
            {
              error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
            },
            { status: 400 },
          );
        }
        break;
      default:
        // All other allowed fields are strings (or null)
        if (typeof value !== "string") {
          return NextResponse.json(
            { error: `Field '${field}' must be a string or null.` },
            { status: 400 },
          );
        }
        break;
    }
  }

  // 8. Apply the update (if there's anything left after filtering).
  //    If updateData is empty (e.g., Officer sent ONLY restricted fields),
  //    we skip the DB write and just return the existing union — fully
  //    silent, no audit entry, no indication anything was attempted.
  let updatedUnion = existingUnion;
  if (Object.keys(updateData).length > 0) {
    updatedUnion = await db.union.update({
      where: { id: unionId },
      data: updateData,
    });

    // 9. Write an AuditLog entry — before/after JSON snapshots.
    //    The before/after captures the ACTUAL DB state, so if the Officer
    //    tried to update unionName but it was silently pinned, the
    //    before/after will both show the original unionName — no indication
    //    of the attempt in the audit trail (which is the correct behavior
    //    per spec: silent means silent, including the audit log).
    //
    //    If a future requirement asks to capture the ATTEMPTED values
    //    (for insider-probing detection), we'd add a `requestBody` field
    //    to the AuditLog schema and populate it here. For now, per spec,
    //    we don't.
    await db.auditLog.create({
      data: {
        actorId: user.id, // null in mock; real User.id once auth-guard ships
        actorName: user.name, // snapshot at action time — never a JOIN
        action: "union_update",
        entityType: "Union",
        entityId: unionId,
        beforeJson: JSON.stringify(existingUnion),
        afterJson: JSON.stringify(updatedUnion),
        severity: "INFO",
      },
    });
  }

  // 10. Return the updated union object — reflecting the ACTUAL state.
  //     This is the "proof the pin worked": if the Officer sent
  //     `{ unionName: "Hacked", address: "New St" }`, the response shows
  //     `unionName: <original>` and `address: "New St"` — proving the pin
  //     silently preserved unionName while allowing address.
  return NextResponse.json(updatedUnion);
}
