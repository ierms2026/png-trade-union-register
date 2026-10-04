import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { Severity } from "@prisma/client";

// =============================================================================
// POST /api/auth/set-password
// -----------------------------------------------------------------------------
// Consumes a passwordResetToken and sets the user's password.
//
// This route is the consumption step for THREE flows that all share the same
// `User.passwordResetToken` column:
//
//   FLOW A — New user created by admin:
//     1. Registrar creates a user → POST /api/users generates a token
//     2. The token is sent to the user (email in production, dialog in dev)
//     3. The user visits /?token=xxx → sees the Set Password form
//     4. User enters their chosen password → POST /api/auth/set-password
//     5. This route validates the token, hashes the password, clears the token
//
//   FLOW B — Admin reset of an existing user:
//     1. Registrar clicks "Reset password" on a user → POST /api/users/[id]/reset-password
//        issues a fresh token + sets passwordHash to "!pending" (invalidating the old)
//     2. The token is shared out-of-band with the user
//     3. The user visits /?token=xxx → same Set Password form
//     4. This route consumes the token + sets the new password
//
//   FLOW C — Self-service "Forgot password?" reset (added in this chunk):
//     1. User clicks "Forgot password?" on the sign-in page + enters their email
//     2. POST /api/auth/forgot-password issues a token + emails them a link
//        (does NOT invalidate the old password — see that route's docstring)
//     3. The user clicks the link → same Set Password form
//     4. This route consumes the token + sets the new password
//
// SECURITY:
//   - Token must exist in the DB (not fabricated)
//   - Token must not be expired (passwordResetExpires > now)
//   - Password must be ≥ 8 chars (basic policy)
//   - On success, the token is CLEARED (one-time use — can't be reused)
//   - The user's passwordHash is updated (replaces "!pending" sentinel OR
//     an existing real hash — works for all three flows)
//   - Audit log entry written. The action distinguishes the flows:
//       * user_set_password        — Flows A + B (admin-issued token; the
//                                    user's passwordHash was "!pending")
//       * user_reset_password_self — Flow C (self-service; the user's
//                                    passwordHash was a real bcrypt hash)
//     The two are distinguished by checking whether the stored hash was
//     "!pending" at consumption time. This is best-effort — a self-service
//     reset that happens to land right after an admin reset (race) would
//     be logged as user_set_password, which is the more conservative of
//     the two. The audit trail is still complete; the action label just
//     reflects "this was the first password set on this account / after
//     an admin reset" vs "this was a user-driven password change".
//
// NO AUTH REQUIRED:
//   This endpoint is intentionally unauthenticated — the token IS the auth.
//   The user hasn't set a password yet (Flow A), or has forgotten it (Flows
//   B + C), so they can't have a session.
//
// SESSION INVALIDATION (Flows B + C):
//   We do NOT revoke the user's existing sessions here. For Flow B the
//   admin-reset route already invalidated the password (passwordHash =
//   "!pending"), which means active sessions can't re-authenticate — but
//   they remain valid until they expire or the user logs out. For Flow C
//   the user's old password still works until they consume the token, so
//   active sessions are expected to keep working. If immediate session
//   revocation is desired, the user can disable themselves via Account
//   Security (or a Registrar can disable + re-enable them).
// =============================================================================

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.token !== "string" || typeof body.password !== "string") {
    return NextResponse.json(
      { error: "Token and password are required." },
      { status: 400 },
    );
  }

  // --- 1. Validate password length ------------------------------------------
  if (body.password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  // --- 2. Find the user by token --------------------------------------------
  const user = await db.user.findFirst({
    where: {
      passwordResetToken: body.token,
      passwordResetExpires: { gt: new Date() },
    },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Invalid or expired token. Please request a new password reset." },
      { status: 400 },
    );
  }

  // --- 3. Hash the new password ---------------------------------------------
  const passwordHash = await hashPassword(body.password);

  // --- 4. Update the user: set password + clear token -----------------------
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });

  // --- 5. Audit log entry ---------------------------------------------------
  // Distinguish Flows A+B (admin-issued token → passwordHash was "!pending")
  // from Flow C (self-service → passwordHash was a real bcrypt hash). The
  // two actions get different labels so the audit trail shows whether a
  // password change was user-initiated or admin-driven.
  const wasSelfService = user.passwordHash !== "!pending";
  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: wasSelfService ? "user_reset_password_self" : "user_set_password",
      entityType: "User",
      entityId: user.id,
      beforeJson: JSON.stringify({
        hadPendingPassword: user.passwordHash === "!pending",
        wasSelfServiceReset: wasSelfService,
      }),
      afterJson: JSON.stringify({ passwordSet: true }),
      // Self-service resets are slightly more sensitive than admin-driven
      // ones (no human reviewed the request before the token was issued),
      // so they get WARNING severity. Admin-driven resets stay at INFO —
      // a Registrar already authorized the action.
      severity: wasSelfService ? Severity.WARNING : Severity.INFO,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Password set successfully. You can now sign in.",
  });
}
