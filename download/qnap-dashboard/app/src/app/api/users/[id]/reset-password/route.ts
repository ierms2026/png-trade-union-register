export const runtime = "nodejs"; // Required: uses Node.js modules (node:fs, node:path, etc.)
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";

// =============================================================================
// POST /api/users/[id]/reset-password
// -----------------------------------------------------------------------------
// Admin-initiated password reset. REGISTRAR-only. Generates a new
// passwordResetToken + sets passwordHash to the "!pending" sentinel,
// forcing the user to set a new password via the set-password flow on
// next login.
//
// This is the "admin reset" half of the password-reset mechanism documented
// on the User model:
//   - Create time: POST /api/users generates the initial token.
//   - Admin reset: THIS ROUTE generates a fresh token for an existing user.
//   - User set: POST /api/auth/set-password consumes the token.
//
// SECURITY:
//   - The admin NEVER types or sees the user's new password. The user sets
//     it themselves via the set-password link. This means the admin can't
//     disclose it under coercion, and the password never enters the admin's
//     browser history or the request log.
//   - The token is 32 random bytes (256 bits), hex-encoded (64 chars), with
//     a 24-hour expiry. Sufficient for a one-time secret.
//   - Calling this route INVALIDATES the user's existing password immediately
//     (passwordHash → "!pending"). They can't log in with the old password
//     while waiting to set the new one. This is intentional — if an admin
//     resets a password, it's usually because the old one is suspect.
//   - All existing sessions for the user are NOT automatically revoked here.
//     If immediate session invalidation is needed, the admin should also
//     disable the user (PUT /api/users/[id] with disabled: true), which
//     immediately invalidates all sessions via the auth-guard's disabled
//     check. Re-enabling the user then requires a fresh login with the new
//     password.
//
// RESPONSE:
//   Returns the passwordResetToken ONE TIME — same as the create-user route.
//   The admin is expected to share this token with the user out-of-band
//   (email, in-person, etc.). Subsequent GET requests do NOT include it.
//
// IDEMPOTENT:
//   Calling this route multiple times is safe — each call generates a fresh
//   token and expires the previous one (overwrites passwordResetToken +
//   passwordResetExpires). The user can use whichever token they have; only
//   the latest one is in the DB, so older tokens are invalid after a reset.
// =============================================================================

/** Password reset token expiry: 24 hours from generation. */
const PASSWORD_RESET_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // --- 1. Auth check — REGISTRAR only --------------------------------------
  const actor = await getAuthUser(req);
  if (!actor) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (actor.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can reset user passwords." },
      { status: 403 },
    );
  }

  // --- 2. Verify the target user exists ------------------------------------
  const existingUser = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      disabled: true,
      twoFactorEnabled: true,
      // Capture for the audit beforeJson (NEVER log the actual hash/token):
      passwordHash: true,
      passwordResetToken: true,
      passwordResetExpires: true,
    },
  });

  if (!existingUser) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 },
    );
  }

  // --- 3. Generate a fresh reset token -------------------------------------
  // 32 bytes = 256 bits of entropy. Hex-encoded = 64 chars.
  const passwordResetToken = randomBytes(32).toString("hex");
  const passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  // --- 4. Apply the reset --------------------------------------------------
  // Set passwordHash to "!pending" — this immediately invalidates the old
  // password. The login route's bcrypt.verify will return false for any
  // non-bcrypt string, so even if someone knows the old password, they
  // can't log in.
  await db.user.update({
    where: { id },
    data: {
      passwordHash: "!pending",
      passwordResetToken,
      passwordResetExpires,
    },
  });

  // --- 5. Audit log entry --------------------------------------------------
  // Severity: WARNING — password reset is a sensitive action. If performed
  // maliciously (e.g. a compromised admin account), it locks the user out.
  // The audit trail captures WHO reset it and WHEN, so a forensic review
  // can spot suspicious resets.
  //
  // We do NOT log the token itself (it's a one-time secret). The audit
  // entry just records that a reset happened.
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action: "user_reset_password",
      entityType: "User",
      entityId: id,
      beforeJson: JSON.stringify({
        email: existingUser.email,
        role: existingUser.role,
        disabled: existingUser.disabled,
        twoFactorEnabled: existingUser.twoFactorEnabled,
        hadPendingPassword: existingUser.passwordHash === "!pending",
        hadExistingResetToken: existingUser.passwordResetToken !== null,
      }),
      afterJson: JSON.stringify({
        email: existingUser.email,
        role: existingUser.role,
        disabled: existingUser.disabled,
        twoFactorEnabled: existingUser.twoFactorEnabled,
        passwordSetToPending: true,
        newResetTokenIssued: true,
        resetExpiresAt: passwordResetExpires.toISOString(),
      }),
      severity: Severity.WARNING,
    },
  });

  // --- 6. Return the token ONE TIME ----------------------------------------
  // Same pattern as POST /api/users — the token is included in this
  // response only. The admin must copy it and share it with the user.
  // In production, this would be sent via email and never returned in the
  // API response.
  return NextResponse.json({
    success: true,
    message:
      "Password reset initiated. The user's old password is now invalid. " +
      "Share the reset token with the user so they can set a new password.",
    passwordResetToken,
    passwordResetExpires,
    // Include the set-password URL for convenience — the admin can copy
    // this and send it directly to the user.
    setPasswordUrl: `/?token=${passwordResetToken}`,
  });
}
