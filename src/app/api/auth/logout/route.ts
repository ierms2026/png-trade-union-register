import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import {
  SESSION_COOKIE_NAME,
  SESSION_CLEAR_COOKIE_ATTRIBUTES,
  verifySessionCookieValue,
} from "@/lib/auth/session";
import { cookies } from "next/headers";
import { Severity } from "@prisma/client";

// =============================================================================
// POST /api/auth/logout
// -----------------------------------------------------------------------------
// Clears the session cookie AND deletes the Session row from the DB.
//
// WHY DELETE THE ROW (not just clear the cookie):
//   - If we only cleared the cookie, the Session row would linger until
//     its natural expiry (up to 7 days). During that window, if an
//     attacker had exfiltrated the cookie value (e.g. via XSS before
//     the HttpOnly flag was set, or via a compromised browser extension),
//     they could still use it.
//   - Deleting the row makes the JTI invalid — any future request with
//     that cookie will fail the DB lookup in auth-guard and return 401.
//
// IDEMPOTENT:
//   - Calling logout when already logged out (no cookie, or cookie with
//     an invalid signature, or cookie whose JTI was already deleted)
//     returns 200 with no error. The end state (no session) is the same.
//
// AUDIT:
//   - We log the logout for forensic completeness (a login without a
//     corresponding logout could indicate a stolen session that's still
//     active). Severity: INFO — logouts are routine.
// =============================================================================

export async function POST() {
  // --- 1. Read the session cookie to find the JTI -------------------------
  // We use `cookies()` directly (not getAuthUser) because we need the
  // JTI even if the user's row is mid-deletion or the session has
  // already expired — we still want to delete the Session row.
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;

  let jti: string | null = null;
  let userId: string | null = null;
  let userEmail: string | null = null;

  if (cookieValue) {
    const verified = verifySessionCookieValue(cookieValue);
    if (verified) {
      jti = verified.jti;
      // Look up the session to get the userId for the audit log.
      const session = await db.session.findUnique({
        where: { jti: verified.jti },
        select: { userId: true, user: { select: { email: true } } },
      });
      if (session) {
        userId = session.userId;
        userEmail = session.user.email;
      }
    }
  }

  // --- 2. Delete the Session row (if we have a JTI) ----------------------
  if (jti) {
    await db.session.deleteMany({ where: { jti } }).catch(() => {
      // Ignore — the row may already be gone (idempotent logout).
    });
  }

  // --- 3. Audit the logout ------------------------------------------------
  if (userId && userEmail) {
    await db.auditLog.create({
      data: {
        actorId: userId,
        actorName: userEmail,
        action: "user_logout",
        entityType: "User",
        entityId: userId,
        severity: Severity.INFO,
      },
    });
  }

  // --- 4. Clear the cookie ------------------------------------------------
  const res = NextResponse.json({ success: true });
  res.cookies.set(
    SESSION_COOKIE_NAME,
    "",
    SESSION_CLEAR_COOKIE_ATTRIBUTES,
  );
  return res;
}
