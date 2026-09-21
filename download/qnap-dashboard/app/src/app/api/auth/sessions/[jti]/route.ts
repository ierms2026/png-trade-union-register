import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import {
  SESSION_COOKIE_NAME,
  verifySessionCookieValue,
} from "@/lib/auth/session";
import { cookies } from "next/headers";
import { Severity } from "@prisma/client";

// =============================================================================
// DELETE /api/auth/sessions/[jti]
// -----------------------------------------------------------------------------
// Revokes a session by JTI. The user can revoke any of their own sessions
// EXCEPT the current one (use the Sign Out button for that — which also
// clears the cookie).
//
// OWNERSHIP CHECK:
//   The session must belong to the current user. A user can't revoke
//   another user's session by guessing the JTI. We enforce this by
//   filtering the deleteMany on both `jti` AND `userId` — if the JTI
//   belongs to a different user, the delete affects 0 rows and we
//   return 404 (not 403 — we don't want to leak "this JTI exists but
//   isn't yours").
//
// CAN'T REVOKE CURRENT:
//   Revoking the current session would log the user out mid-action,
//   which is confusing UX. We detect this by comparing the JTI to the
//   one in the request's cookie and return 400 with a helpful message.
//
// AUDIT:
//   Severity: INFO. Session revocation is a routine account-management
//   action (not a containment action like lockout/disable).
// =============================================================================

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ jti: string }> },
) {
  const { jti } = await params;

  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  // --- 1. Can't revoke the current session --------------------------------
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  if (cookieValue) {
    const verified = verifySessionCookieValue(cookieValue);
    if (verified && verified.jti === jti) {
      return NextResponse.json(
        {
          error:
            "You can't revoke your current session from here. Use the Sign Out button instead.",
        },
        { status: 400 },
      );
    }
  }

  // --- 2. Find the session (ownership check) ------------------------------
  // We filter on BOTH jti AND userId — if the JTI belongs to another
  // user, this returns null and we 404 (no leak).
  const session = await db.session.findFirst({
    where: { jti, userId: user.id },
    select: { id: true, userAgent: true, ip: true, createdAt: true },
  });

  if (!session) {
    return NextResponse.json(
      { error: "Session not found." },
      { status: 404 },
    );
  }

  // --- 3. Delete the session row ------------------------------------------
  // This is the revocation — any future request with this JTI will
  // fail the DB lookup in auth-guard and return 401.
  await db.session.delete({ where: { id: session.id } });

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "session_revoke",
      entityType: "Session",
      entityId: session.id,
      beforeJson: JSON.stringify({
        userAgent: session.userAgent,
        ip: session.ip,
        createdAt: session.createdAt.toISOString(),
      }),
      severity: Severity.INFO,
    },
  });

  return NextResponse.json({ success: true });
}
