import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";

// =============================================================================
// GET /api/security/overview
// -----------------------------------------------------------------------------
// Returns the Registrar's early-warning metrics for the system's auth health.
//
// WHAT THIS RETURNS:
//   - failedLogins: { last24h, last7d } — counts from LoginAttempt where
//     success=false. Drives the headline cards on the Security Dashboard.
//   - lockedOutUsers: array of users where lockedUntil > now. Each entry
//     includes enough info for the UI to show a row + an "Unlock" button.
//   - disabledUsers: array of users where disabled=true. Distinct from
//     lockedOut (lockout is temporary, disabled is admin-toggled).
//   - twoFactorAdoption: { enabled, totalEligible, rate } — 2FA adoption
//     rate EXCLUDING disabled users from BOTH numerator and denominator.
//   - activeSessions: count of non-expired, non-revoked Session rows.
//
// 2FA ADOPTION DENOMINATOR (critical detail):
// Per spec: "2FA adoption rate excludes disabled users from BOTH numerator
// and denominator." Rationale: a disabled user can't log in to enable 2FA,
// so counting them would artificially depress the rate. The denominator is
// `count(disabled=false)`, the numerator is `count(disabled=false AND
// twoFactorEnabled=true)`. If all enabled users have 2FA, the rate is 100%
// regardless of how many users are disabled.
//
// AUTH:
// REGISTRAR-only. Inspectors have read-only access to most of the system
// but the Security Dashboard is specifically admin-scoped — it shows
// failed-login attempts (which include IP addresses + typed emails) that
// shouldn't be visible to non-admin staff. Officers have no business
// seeing any of this.
// =============================================================================

// Public fields for user entries in the response — strip sensitive fields
// (passwordHash, twoFactorSecret, passwordResetToken) everywhere.
// NOTE: User has no createdAt/updatedAt (trimmed from the Session 1 schema).
const USER_PUBLIC_FIELDS = {
  id: true,
  email: true,
  role: true,
  assignedUnionId: true,
  twoFactorEnabled: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  disabled: true,
} as const;

export async function GET(req: NextRequest) {
  // --- 1. Auth check: REGISTRAR-only ---------------------------------------
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can view the security overview." },
      { status: 403 },
    );
  }

  // --- 2. Compute time windows ---------------------------------------------
  // Computed once, reused across queries. The "now" stays consistent within
  // this request — a query that takes 50ms won't drift the window.
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // --- 3. Run all independent queries in parallel ---------------------------
  // 5 queries, no data dependencies between them — Promise.all runs them
  // concurrently. Total wall-clock time = slowest query, not sum.
  const [
    failedLogins24h,
    failedLogins7d,
    lockedOutUsers,
    disabledUsers,
    enabledCount,
    totalEligibleCount,
    activeSessions,
  ] = await Promise.all([
    // Failed logins in the last 24 hours
    db.loginAttempt.count({
      where: {
        success: false,
        createdAt: { gte: last24h },
      },
    }),

    // Failed logins in the last 7 days
    db.loginAttempt.count({
      where: {
        success: false,
        createdAt: { gte: last7d },
      },
    }),

    // Currently locked-out users: lockedUntil is set AND in the future
    // (a stale lockedUntil in the past means the lock has expired — the
    // user can attempt login again, even if failedLoginAttempts is still 3)
    db.user.findMany({
      where: {
        lockedUntil: { gt: now },
      },
      select: {
        ...USER_PUBLIC_FIELDS,
        // We don't expose passwordHash/twoFactorSecret, but DO want to show
        // "Also Disabled" badge — so disabled is already in the select.
      },
      orderBy: { lockedUntil: "asc" }, // soonest-expiring first
    }),

    // Disabled users: admin-toggled, independent of lockout
    db.user.findMany({
      where: { disabled: true },
      select: USER_PUBLIC_FIELDS,
      orderBy: { email: "asc" },
    }),

    // 2FA adoption numerator: enabled AND not disabled
    // (disabled users are excluded from BOTH numerator and denominator
    // per spec — see the route header for rationale)
    db.user.count({
      where: {
        disabled: false,
        twoFactorEnabled: true,
      },
    }),

    // 2FA adoption denominator: not disabled
    db.user.count({
      where: { disabled: false },
    }),

    // Active sessions: not expired AND not revoked
    // (Session has no revokedAt in our schema, so we just check expiresAt)
    db.session.count({
      where: {
        expiresAt: { gt: now },
      },
    }),
  ]);

  // --- 4. Compute the 2FA adoption rate ------------------------------------
  // Edge case: if there are 0 eligible (non-disabled) users, the rate is
  // undefined. We return 0 (not null) — the UI shows "0%" rather than "—".
  // This is the correct semantic: "no one has 2FA enabled" is more accurate
  // than "we don't know."
  const twoFactorAdoptionRate =
    totalEligibleCount === 0 ? 0 : Math.round((enabledCount / totalEligibleCount) * 100);

  // --- 5. Return the overview ----------------------------------------------
  return NextResponse.json({
    failedLogins: {
      last24h: failedLogins24h,
      last7d: failedLogins7d,
    },
    lockedOutUsers, // each user has all fields needed for an "Unlock" button
    disabledUsers,
    twoFactorAdoption: {
      enabled: enabledCount,
      totalEligible: totalEligibleCount,
      rate: twoFactorAdoptionRate, // 0–100, integer
    },
    activeSessions,
    generatedAt: now.toISOString(),
  });
}
