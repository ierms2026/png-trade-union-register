import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/context";
import { Role, Severity } from "@prisma/client";

// =============================================================================
// POST /api/users/[id]/reset-2fa
// -----------------------------------------------------------------------------
// Clears a user's 2FA enrollment (twoFactorSecret + twoFactorEnabled) so
// they can re-enroll from scratch. REGISTRAR-only.
//
// INDEPENDENCE FROM OTHER MECHANISMS (critical):
// This endpoint clears ONLY the 2FA fields — it does NOT touch:
//   - failedLoginAttempts (lockout counter)
//   - lockedUntil (lockout expiry)
//   - disabled (admin toggle)
//   - passwordResetToken (password reset flow)
//
// The three "containment" mechanisms (lockout, disabled, 2FA reset) are
// intentionally decoupled per the spec. They can coexist on the same user:
//
//   - Lock a user (3 failed logins) → buys time during investigation
//   - Disable a user → blocks login at the gate
//   - Reset 2FA → forces re-enrollment if their secret was compromised
//
// If these were coupled (e.g., reset-2fa also cleared lockout), the admin
// would lose the audit granularity of "we locked them at 14:02, reset 2FA
// at 14:05, disabled at 14:08" — they'd have to do all three at once, and
// the audit trail would only show one event.
// =============================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // --- 1. Auth check -------------------------------------------------------
  const actor = await getAuthUser(req);
  if (actor.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can reset 2FA." },
      { status: 403 },
    );
  }

  // --- 2. Verify the user exists (404 if not) -------------------------------
  const existingUser = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      twoFactorSecret: true, // captured for beforeJson (NEVER returned to client)
      twoFactorEnabled: true,
      // Capture the OTHER three mechanisms to PROVE in the audit trail
      // that they were untouched:
      failedLoginAttempts: true,
      lockedUntil: true,
      disabled: true,
    },
  });

  if (!existingUser) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 },
    );
  }

  // --- 3. Apply the update — clear ONLY 2FA fields -------------------------
  // Note: we don't check whether 2FA was actually enabled. Calling
  // reset-2fa on a user without 2FA is a no-op (clears already-null fields),
  // and the audit entry captures the before-state so an admin can see
  // "they didn't have 2FA enabled anyway."
  const updatedUser = await db.user.update({
    where: { id },
    data: {
      twoFactorSecret: null,
      twoFactorEnabled: false,
    },
    select: {
      id: true,
      email: true,
      role: true,
      twoFactorEnabled: true,
      // Verify in the response that the OTHER mechanisms are unchanged:
      failedLoginAttempts: true,
      lockedUntil: true,
      disabled: true,
    },
  });

  // --- 4. Audit log entry -------------------------------------------------
  // The beforeJson captures the FULL pre-state (including lockout +
  // disabled + 2FA), and the afterJson captures the post-state. A diff
  // would show only 2FA fields changed — proving the independence.
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action: "user_reset_2fa",
      entityType: "User",
      entityId: id,
      // beforeJson includes the secret's *presence* (true/false), NOT the
      // secret itself — logging the secret would defeat the purpose of
      // clearing it. We use a sanitized snapshot.
      beforeJson: JSON.stringify({
        email: existingUser.email,
        role: existingUser.role,
        twoFactorEnabled: existingUser.twoFactorEnabled,
        twoFactorSecretWasSet: existingUser.twoFactorSecret !== null,
        failedLoginAttempts: existingUser.failedLoginAttempts,
        lockedUntil: existingUser.lockedUntil,
        disabled: existingUser.disabled,
      }),
      afterJson: JSON.stringify({
        email: updatedUser.email,
        role: updatedUser.role,
        twoFactorEnabled: updatedUser.twoFactorEnabled,
        twoFactorSecretWasSet: false, // we just cleared it
        failedLoginAttempts: updatedUser.failedLoginAttempts,
        lockedUntil: updatedUser.lockedUntil,
        disabled: updatedUser.disabled,
      }),
      severity: Severity.WARNING, // 2FA reset is sensitive (re-enrollment required)
    },
  });

  // --- 5. Return the updated user (without sensitive fields) --------------
  return NextResponse.json({ user: updatedUser });
}
