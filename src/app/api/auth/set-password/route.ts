import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { Severity } from "@prisma/client";

// =============================================================================
// POST /api/auth/set-password
// -----------------------------------------------------------------------------
// Consumes a passwordResetToken and sets the user's password.
//
// This is the missing piece of the user-creation flow:
//   1. Registrar creates a user → POST /api/users generates a token
//   2. The token is sent to the user (email in production, dialog in dev)
//   3. The user visits /?token=xxx → sees the Set Password form
//   4. User enters their chosen password → POST /api/auth/set-password
//   5. This route validates the token, hashes the password, clears the token
//
// SECURITY:
//   - Token must exist in the DB (not fabricated)
//   - Token must not be expired (passwordResetExpires > now)
//   - Password must be ≥ 8 chars (basic policy)
//   - On success, the token is CLEARED (one-time use — can't be reused)
//   - The user's passwordHash is updated (replaces "!pending" sentinel)
//   - Audit log entry written
//
// NO AUTH REQUIRED:
//   This endpoint is intentionally unauthenticated — the token IS the auth.
//   The user hasn't set a password yet, so they can't have a session.
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
  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "user_set_password",
      entityType: "User",
      entityId: user.id,
      beforeJson: JSON.stringify({ hadPendingPassword: user.passwordHash === "!pending" }),
      afterJson: JSON.stringify({ passwordSet: true }),
      severity: Severity.INFO,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Password set successfully. You can now sign in.",
  });
}
