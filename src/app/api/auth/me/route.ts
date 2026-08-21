import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";

// =============================================================================
// GET /api/auth/me
// -----------------------------------------------------------------------------
// Returns the currently authenticated user, or { user: null } with 200 if
// unauthenticated.
//
// WHY 200 (not 401) FOR UNAUTHENTICATED:
//   - The frontend uses this endpoint on mount to decide whether to show
//     the login form or the app shell. A 401 would trigger error handlers
//     in fetch wrappers (TanStack Query, our useFetch hook) and pollute
//     the console with noise.
//   - Returning 200 with { user: null } is a clean signal: "no session,
//     show the login form." The frontend checks `data.user` and branches.
//   - Authenticated routes that REQUIRE a user still return 401 — this
//     endpoint is the exception because it's the "who am I?" probe.
//
// TWO-FACTOR STATUS:
//   The response includes `twoFactorEnabled` from the DB (not from the
//   session cookie — the cookie only carries { jti, exp }). This lets the
//   frontend show the 2FA badge in the user menu without a second request.
// =============================================================================

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    // 200 with null user — see comment above.
    return NextResponse.json({ user: null });
  }

  // Load the twoFactorEnabled flag from the DB (the session cookie
  // doesn't carry it). We select only what we need.
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { twoFactorEnabled: true },
  });

  // If the user was deleted between the session lookup and this query,
  // treat as unauthenticated.
  if (!dbUser) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      assignedUnionId: user.assignedUnionId,
      twoFactorEnabled: dbUser.twoFactorEnabled,
    },
  });
}
