import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/context";
import { Role, Severity } from "@prisma/client";

// =============================================================================
// POST /api/security/unlock
// -----------------------------------------------------------------------------
// Clears a user's lockout state (failedLoginAttempts + lockedUntil) so they
// can attempt login again immediately. REGISTRAR-only.
//
// INDEPENDENCE FROM OTHER MECHANISMS (critical):
// This endpoint clears ONLY the lockout fields — it does NOT touch:
//   - disabled (admin toggle — only the Users API can change this)
//   - twoFactorEnabled / twoFactorSecret (2FA — only reset-2fa can change)
//   - passwordResetToken (password reset flow)
//
// The three "containment" mechanisms (lockout, disabled, 2FA reset) are
// intentionally decoupled per the spec. They can coexist on the same user:
//
//   - Lock a user (3 failed logins) → buys time during investigation
//   - Disable a user → blocks login at the gate
//   - Reset 2FA → forces re-enrollment if their secret was compromised
//
// If a user is BOTH locked AND disabled, unlocking clears the lock but
// leaves them disabled. The response includes a `disabledUnchanged` flag
// so the UI can show "Note: this user is also disabled" rather than
// implying unlock = full restore.
//
// "ALSO DISABLED" BADGE:
// Per spec, the Security Dashboard shows an "Also Disabled" badge when a
// locked user is also disabled. This is the visual confirmation that the
// two states coexist independently — unlocking won't restore access if the
// user is also disabled.
//
// AUDIT:
// Writes an AuditLog entry with action "user_unlock", severity WARNING
// (unlocking bypasses the 3-failure lockout — a sensitive action that
// should be reviewable in the audit trail).
//
// TODO (last-Registrar protection):
// Currently this endpoint doesn't check whether the user being unlocked is
// the last active Registrar. That's CORRECT — unlocking doesn't change
// the user's role or disabled state, so it can't brick the system. The
// last-Registrar protection only applies to PUT (role change / disable)
// and DELETE.
// =============================================================================

export async function POST(req: NextRequest) {
  // --- 1. Auth check: REGISTRAR-only ---------------------------------------
  const actor = await getAuthUser(req);
  if (actor.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can unlock accounts." },
      { status: 403 },
    );
  }

  // --- 2. Parse + validate the body ----------------------------------------
  let body: { userId?: unknown };
  try {
    body = (await req.json()) as { userId?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body. Expected { userId }." },
      { status: 400 },
    );
  }

  if (typeof body.userId !== "string" || body.userId.trim().length === 0) {
    return NextResponse.json(
      { error: "Field 'userId' is required and must be a non-empty string." },
      { status: 400 },
    );
  }

  const userId = body.userId;

  // --- 3. Verify the user exists (404 if not) -------------------------------
  // Capture the BEFORE state for the audit log + the "disabledUnchanged"
  // flag in the response.
  const existingUser = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      disabled: true,
      twoFactorEnabled: true,
    },
  });

  if (!existingUser) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 },
    );
  }

  // --- 4. Apply the unlock — clear ONLY lockout fields ---------------------
  // `failedLoginAttempts = 0` and `lockedUntil = null`. The user gets a
  // fresh 3-attempt window.
  //
  // We don't check whether the user is actually locked. Calling unlock on
  // an unlocked user is a no-op (sets 0 → 0, null → null), and the audit
  // entry captures the before-state so an admin can see "they weren't
  // locked anyway."
  const updatedUser = await db.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    select: {
      id: true,
      email: true,
      role: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      disabled: true,
      twoFactorEnabled: true,
    },
  });

  // --- 5. Audit log entry --------------------------------------------------
  // beforeJson + afterJson capture the FULL pre/post state so a diff
  // would show ONLY lockout fields changed — proving the independence.
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action: "user_unlock",
      entityType: "User",
      entityId: userId,
      beforeJson: JSON.stringify({
        email: existingUser.email,
        role: existingUser.role,
        failedLoginAttempts: existingUser.failedLoginAttempts,
        lockedUntil: existingUser.lockedUntil,
        disabled: existingUser.disabled,
        twoFactorEnabled: existingUser.twoFactorEnabled,
      }),
      afterJson: JSON.stringify({
        email: updatedUser.email,
        role: updatedUser.role,
        failedLoginAttempts: updatedUser.failedLoginAttempts,
        lockedUntil: updatedUser.lockedUntil,
        disabled: updatedUser.disabled,
        twoFactorEnabled: updatedUser.twoFactorEnabled,
      }),
      severity: Severity.WARNING, // unlock bypasses lockout — sensitive
    },
  });

  // --- 6. Return the result with `disabledUnchanged` flag ------------------
  // If the user was also disabled, the UI can show "Note: this user is also
  // disabled" rather than implying unlock = full restore. Per spec.
  const disabledUnchanged =
    existingUser.disabled === true && updatedUser.disabled === true;

  return NextResponse.json({
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      failedLoginAttempts: updatedUser.failedLoginAttempts,
      lockedUntil: updatedUser.lockedUntil,
      disabled: updatedUser.disabled,
      twoFactorEnabled: updatedUser.twoFactorEnabled,
    },
    // True if the user was disabled before AND is still disabled after.
    // The UI uses this to show an "Also Disabled" note — unlocking didn't
    // restore full access.
    disabledUnchanged,
  });
}
