import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";

// =============================================================================
// PATCH /api/api-keys/[id]
// -----------------------------------------------------------------------------
// Revokes an API key (soft-delete). REGISTRAR-only.
//
// REVOCATION IS A SOFT-DELETE:
// Setting `revokedAt = now()` marks the key as revoked, but the row stays
// in the DB for audit history. The UI shows revoked keys with a "Revoked"
// badge so an admin can see what's been revoked and when.
//
// WHY NOT A HARD DELETE:
//   1. Audit trail: if a key was used to perform actions, the audit log
//      references the key by ID. Hard-deleting the ApiKey row would orphan
//      those references.
//   2. Forensic value: if a key was compromised and used maliciously,
//      keeping the row preserves the prefix + scopes + expiry + createdAt
//      for investigation.
//   3. UX clarity: a hard delete would make revoked keys disappear from
//      the UI — an admin might not realize a key had been revoked
//      previously and could re-create one with the same scope.
//
// IMMUTABILITY OF SCOPES + EXPIRY (critical):
// Per spec: "PATCH /api/api-keys/[id] rejects scope/expiry changes with
// 'Revoke and reissue'". This is enforced with a 400 Bad Request — the
// caller must revoke this key and create a new one with the desired
// scopes/expiry.
//
// Why immutability:
//   - If scopes could be widened after creation, a stolen key could be
//     silently upgraded by an attacker who compromised the create flow.
//   - If expiry could be extended, a key that should have expired stays
//     valid forever — defeats the entire point of expiry.
//   - Forcing "revoke + reissue" creates an audit trail entry for both
//     actions (the revoke + the new create), making scope/expiry changes
//     traceable.
//
// WHAT THIS ENDPOINT ACCEPTS:
//   - { revoked: true }   → set revokedAt = now() (if not already revoked)
//   - Anything else      → 400 "Revoke and reissue" if it tries to change
//                          scopes or expiresAt; otherwise no-op (200 with
//                          current state, since nothing changed)
//
// IDEMPOTENT:
// Calling PATCH { revoked: true } on an already-revoked key returns 200
// (no error). The `revokedAt` is NOT updated to the new timestamp —
// preserving the original revocation time for audit accuracy.
// =============================================================================

// Public fields for the response — same as the list route (no keyHash).
const API_KEY_PUBLIC_FIELDS = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

interface PatchRequestBody {
  revoked?: unknown;
  scopes?: unknown;
  expiresAt?: unknown;
  name?: unknown;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // --- 1. Auth check: REGISTRAR-only ---------------------------------------
  const actor = await getAuthUser(req);
  if (!actor) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (actor.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can revoke API keys." },
      { status: 403 },
    );
  }

  // --- 2. Parse + validate the body ---------------------------------------
  let body: PatchRequestBody;
  try {
    body = (await req.json()) as PatchRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  // --- 3. Reject scope + expiry changes ------------------------------------
  // Per spec: "Revoke and reissue" — these fields are immutable after
  // creation. The caller must revoke this key and create a new one.
  if (body.scopes !== undefined) {
    return NextResponse.json(
      {
        error:
          "Scopes cannot be changed after creation. Revoke this key and create a new one with the desired scopes.",
      },
      { status: 400 },
    );
  }
  if (body.expiresAt !== undefined) {
    return NextResponse.json(
      {
        error:
          "Expiry cannot be changed after creation. Revoke this key and create a new one with the desired expiry.",
      },
      { status: 400 },
    );
  }

  // We also reject name changes for the same reason — the spec doesn't
  // explicitly mention name, but the principle is the same: a name is
  // identifying metadata that should be stable for audit. If you need a
  // different name, revoke + reissue.
  if (body.name !== undefined) {
    return NextResponse.json(
      {
        error:
          "Name cannot be changed after creation. Revoke this key and create a new one with the desired name.",
      },
      { status: 400 },
    );
  }

  // --- 4. Verify revoked: true was passed ---------------------------------
  // The only valid mutation on this endpoint is `revoked: true`. Anything
  // else is either an explicit reject (above) or a no-op (we return 200
  // with the current state — defensive, in case the caller sent an empty
  // body or a body with only `revoked: false`).
  if (body.revoked !== true) {
    // No valid action specified. Fetch the current state and return it
    // without modifying — gives the caller a useful response instead of
    // a confusing 400.
    const existing = await db.apiKey.findUnique({
      where: { id },
      select: API_KEY_PUBLIC_FIELDS,
    });
    if (!existing) {
      return NextResponse.json(
        { error: "API key not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({ apiKey: existing });
  }

  // --- 5. Verify the key exists (404 if not) -------------------------------
  const existingKey = await db.apiKey.findUnique({
    where: { id },
    select: API_KEY_PUBLIC_FIELDS,
  });
  if (!existingKey) {
    return NextResponse.json(
      { error: "API key not found." },
      { status: 404 },
    );
  }

  // --- 6. Apply the revoke (idempotent) ------------------------------------
  // If already revoked, don't update the timestamp — preserve the original
  // revocation time for audit accuracy. Return 200 either way.
  if (existingKey.revokedAt !== null) {
    // Already revoked — return current state, no DB write, no audit entry.
    return NextResponse.json({ apiKey: existingKey });
  }

  const now = new Date();
  const updatedKey = await db.apiKey.update({
    where: { id },
    data: { revokedAt: now },
    select: API_KEY_PUBLIC_FIELDS,
  });

  // --- 7. Audit log entry --------------------------------------------------
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action: "api_key_revoke",
      entityType: "ApiKey",
      entityId: id,
      beforeJson: JSON.stringify({
        name: existingKey.name,
        prefix: existingKey.prefix,
        scopes: existingKey.scopes,
        expiresAt: existingKey.expiresAt,
        revokedAt: existingKey.revokedAt, // null before
      }),
      afterJson: JSON.stringify({
        name: updatedKey.name,
        prefix: updatedKey.prefix,
        scopes: updatedKey.scopes,
        expiresAt: updatedKey.expiresAt,
        revokedAt: updatedKey.revokedAt, // now set
      }),
      severity: Severity.WARNING, // revoking invalidates a credential — sensitive
    },
  });

  return NextResponse.json({ apiKey: updatedKey });
}
