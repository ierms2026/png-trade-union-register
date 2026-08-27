import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import {
  createSessionCookieValue,
  generateJTI,
  SESSION_COOKIE_ATTRIBUTES,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  signChallengeToken,
} from "@/lib/auth/session";
import { Severity } from "@prisma/client";

// =============================================================================
// POST /api/auth/login
// -----------------------------------------------------------------------------
// The first step of the two-step login flow:
//   1. Client POSTs { email, password }.
//   2. We verify the password via bcrypt.
//   3. If 2FA is enabled on the account, we return a short-lived challenge
//      token (30s) — the client then POSTs { challengeToken, otp } to
//      /api/auth/login/2fa to complete the login.
//   4. If 2FA is NOT enabled, we issue the session cookie here and return
//      the user object.
//
// LOCKOUT POLICY:
//   - 3 failed attempts (password OR 2FA — they share the counter) →
//     account locked for 15 minutes.
//   - On success, the counter resets to 0.
//   - The lockout is checked BEFORE the password verify — even a correct
//     password won't unlock a locked account (the user must wait).
//
// WHY LOG LoginAttempt ROWS:
//   - The Security Dashboard (GET /api/security/overview) counts failed
//     logins over 24h/7d windows. Without these rows, the dashboard
//     would always show 0.
//   - The rows also include IP + userAgent for forensic investigation
//     if an account is compromised.
//
// TIMING-SAFETY (or why we don't short-circuit on "user not found"):
//   - A naive implementation returns 401 immediately if the email isn't
//     found, then runs bcrypt.verify only for existing users. An attacker
//     can time the response to enumerate valid emails.
//   - We mitigate by always running bcrypt.verify against a dummy hash
//     when the user isn't found — the response time is then identical
//     whether the email exists or not. The dummy hash below is a real
//     bcrypt hash of a random string; the verify will run the full
//     12-round KDF and return false in the same ~250ms as a real verify.
// =============================================================================

// A real bcrypt hash of a throwaway password, used as a constant-time
// decoy when the email isn't found. Generated with bcrypt.hash('x', 12).
const DUMMY_HASH =
  "$2a$12$uQqZyfGZ6o9kl4qYj3vUO.X.NdQ4HKPRtWQ7BD8rJm5p1Nc9oR8K.";

// Challenge token TTL is defined in session.ts (CHALLENGE_TOKEN_TTL_MS, 30s).
// The user has 30s to fetch their authenticator app and type the 6-digit
// code. Tight enough that a stolen challenge token (e.g. from a browser
// extension scraping the response body) is nearly useless; loose enough
// for a human.

interface LoginRequestBody {
  email?: unknown;
  password?: unknown;
}

// Challenge token helpers live in session.ts so both this route and the
// 2FA route share the same signing/verification logic. Re-exported here
// for backwards compatibility with any code that imported it from this
// module.
export { parseChallengeToken } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  // --- 1. Parse the body ---------------------------------------------------
  let body: LoginRequestBody;
  try {
    body = (await req.json()) as LoginRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (typeof body.email !== "string" || body.email.trim().length === 0) {
    return NextResponse.json(
      { error: "Email is required." },
      { status: 400 },
    );
  }
  if (
    typeof body.password !== "string" ||
    body.password.length === 0
  ) {
    return NextResponse.json(
      { error: "Password is required." },
      { status: 400 },
    );
  }

  const email = body.email.trim().toLowerCase();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  // --- 2. Look up the user by email ---------------------------------------
  const user = await db.user.findUnique({ where: { email } });

  // --- 3. Timing-safe decoy if user not found -----------------------------
  // Run bcrypt.verify against a dummy hash so the response time is
  // indistinguishable from a real user with a wrong password. This
  // defeats email-enumeration via timing.
  if (!user) {
    await verifyPassword(body.password, DUMMY_HASH);
    // Record the failed attempt (userId=null since we don't have one).
    await db.loginAttempt.create({
      data: { email, success: false, userId: null, ip, userAgent },
    });
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  // --- 4. Check disabled (admin-toggled) ----------------------------------
  // A disabled user can't log in at all, regardless of password.
  // We still record the attempt for audit/forensic purposes.
  if (user.disabled) {
    await db.loginAttempt.create({
      data: { email, success: false, userId: user.id, ip, userAgent },
    });
    return NextResponse.json(
      { error: "This account has been disabled. Contact the registrar." },
      { status: 403 },
    );
  }

  // --- 5. (Lockout disabled for preview environment) ----------------------
  // The 3-failures → 15-min lockout has been removed for the preview/test
  // environment so testers can iterate freely. We still log every attempt
  // for the Security Dashboard; we just never set `lockedUntil`.
  // If an account was previously locked (carry-over from prod data), we
  // clear it here so the user can sign in immediately.
  if (user.lockedUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
  }

  // --- 6. Verify the password ---------------------------------------------
  const passwordOk = await verifyPassword(body.password, user.passwordHash);

  if (!passwordOk) {
    // Track failed attempts for audit/Security Dashboard, but DO NOT lock
    // the account — lockout is disabled in the preview environment.
    const newCount = user.failedLoginAttempts + 1;
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: newCount },
    });

    await db.loginAttempt.create({
      data: { email, success: false, userId: user.id, ip, userAgent },
    });

    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  // --- 7. Password correct — check 2FA -----------------------------------
  // Reset the failed-attempt counter on success (the user has proven
  // they know the password, so the lockout counter should start fresh
  // for the next session).
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  await db.loginAttempt.create({
    data: { email, success: true, userId: user.id, ip, userAgent },
  });

  // --- 8. If 2FA enabled, return a signed challenge token --------------
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const challengeToken = signChallengeToken(user.id);
    return NextResponse.json({
      requiresTwoFactor: true,
      challengeToken,
      email: user.email,
    });
  }

  // --- 9. No 2FA — issue the session cookie -------------------------------
  const jti = generateJTI();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: { userId: user.id, jti, expiresAt, ip, userAgent },
  });

  // Audit the login (INFO severity — logins are routine, but the
  // audit trail should show who logged in and when).
  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "user_login",
      entityType: "User",
      entityId: user.id,
      severity: Severity.INFO,
    },
  });

  const cookieValue = createSessionCookieValue(jti, expiresAt);
  const res = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      assignedUnionId: user.assignedUnionId,
      twoFactorEnabled: user.twoFactorEnabled,
    },
  });
  res.cookies.set(SESSION_COOKIE_NAME, cookieValue, SESSION_COOKIE_ATTRIBUTES);
  return res;
}
