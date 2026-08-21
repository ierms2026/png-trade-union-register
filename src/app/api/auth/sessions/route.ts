import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import {
  SESSION_COOKIE_NAME,
  verifySessionCookieValue,
} from "@/lib/auth/session";
import { cookies } from "next/headers";

// =============================================================================
// GET /api/auth/sessions
// -----------------------------------------------------------------------------
// Lists the current user's active sessions. Used by the "Active Sessions"
// dialog in the Account Security view — the user can see all the devices
// they're logged in on and revoke any they don't recognize.
//
// RESPONSE SHAPE:
//   {
//     sessions: [
//       {
//         id, jti, createdAt, expiresAt, ip, userAgent,
//         isCurrent: boolean  // true if this is the session making the request
//       },
//       ...
//     ]
//   }
//
// `isCurrent` is computed by comparing the session's JTI to the JTI in
// the request's cookie. The frontend uses this to:
//   - Disable the "Revoke" button on the current session (you can't
//     revoke yourself from the sessions dialog — use the Sign Out button
//     instead, which clears the cookie too).
//   - Show a "Current session" badge.
//
// ONLY ACTIVE SESSIONS:
//   We filter out expired sessions (expiresAt <= now). Expired rows
//   linger in the DB until they're cleaned up by a future sweep, but
//   they're not useful to show the user.
// =============================================================================

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  // Read the current session's JTI from the cookie so we can mark
  // isCurrent on the matching row.
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  let currentJti: string | null = null;
  if (cookieValue) {
    const verified = verifySessionCookieValue(cookieValue);
    if (verified) currentJti = verified.jti;
  }

  const now = new Date();
  const sessions = await db.session.findMany({
    where: {
      userId: user.id,
      expiresAt: { gt: now }, // only active (non-expired) sessions
    },
    select: {
      id: true,
      jti: true,
      createdAt: true,
      expiresAt: true,
      ip: true,
      userAgent: true,
    },
    orderBy: { createdAt: "desc" }, // most recent first
  });

  // Serialize dates + add the isCurrent flag.
  const serialized = sessions.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    isCurrent: s.jti === currentJti,
  }));

  return NextResponse.json({ sessions: serialized });
}
