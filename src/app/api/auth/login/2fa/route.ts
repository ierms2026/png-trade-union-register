import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { verifyTwoFactorCode } from "@/lib/auth/totp";
import {
  createSessionCookieValue,
  generateJTI,
  SESSION_COOKIE_ATTRIBUTES,
  SESSION_TTL_MS,
} from "@/lib/auth/session";
import { LOCKOUT_THRESHOLD, LOCKOUT_DURATION_MINS } from "@/lib/auth/constants";
import { parseChallengeToken } from "@/app/api/auth/login/route";
import { Severity } from "@prisma/client";

// =============================================================================
// POST /api/auth/login/2fa
// -----------------------------------------------------------------------------
// Second step of the two-step login flow:
//   1. Client POSTed { email, password } to /api/auth/login.
//   2. We verified the password + saw 2FA was enabled, returned a
//      challenge token (base64("{userId}:{timestamp}"), 30s expiry).
//   3. Client POSTs { challengeToken, otp } HERE.
//   4. We verify the challenge token's structure + expiry.
//   5. We re-load the user from the DB (defends against a user being
//      disabled or having 2FA reset between step 1 and step 2).
//   6. We verify the TOTP code against the stored secret.
//   7. On success, issue the session cookie (same as the no-2FA path).
//
// WHY RE-LOAD THE USER:
//   - Between step 1 (password verified) and step 2 (OTP verified), an
//     admin could have disabled the user. We must not issue a session
//     to a now-disabled user.
//   - An admin could have reset 2FA (e.g. because the user lost their
//     phone). The stored secret might be gone; we should reject rather
//     than accept a code against a stale secret.
//
// LOCKOUT SHARING:
//   Per the spec, password + 2FA failures share the same counter. A user
//   who fails password twice then fails 2FA once hits the 3-attempt
//   threshold and is locked. This prevents an attacker from brute-forcing
//   the 6-digit OTP (10^6 space) without consequence — each OTP attempt
//   counts toward the lockout.
// =============================================================================

interface TwoFactorRequestBody {
  challengeToken?: unknown;
  otp?: unknown;
}

export async function POST(req: NextRequest) {
  // --- 1. Parse the body ---------------------------------------------------
  let body: TwoFactorRequestBody;
  try {
    body = (await req.json()) as TwoFactorRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (
    typeof body.challengeToken !== "string" ||
    body.challengeToken.length === 0
  ) {
    return NextResponse.json(
      { error: "Challenge token is required." },
      { status: 400 },
    );
  }
  if (typeof body.otp !== "string" || body.otp.length === 0) {
    return NextResponse.json(
      { error: "OTP code is required." },
      { status: 400 },
    );
  }

  // --- 2. Verify the challenge token --------------------------------------
  const userId = parseChallengeToken(body.challengeToken);
  if (!userId) {
    return NextResponse.json(
      { error: "Invalid or expired challenge token. Please log in again." },
      { status: 401 },
    );
  }

  // --- 3. Re-load the user from the DB ------------------------------------
  // (See "WHY RE-LOAD THE USER" in the file header.)
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json(
      { error: "Invalid or expired challenge token. Please log in again." },
      { status: 401 },
    );
  }
  if (user.disabled) {
    return NextResponse.json(
      { error: "This account has been disabled. Contact the registrar." },
      { status: 403 },
    );
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const remainingMin = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60000,
    );
    return NextResponse.json(
      {
        error: `Account locked. Try again in ${remainingMin} minute(s).`,
      },
      { status: 423 },
    );
  }
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    // 2FA was reset between step 1 and step 2. Don't leak details —
    // tell the user to start over.
    return NextResponse.json(
      { error: "Two-factor authentication is no longer enabled. Please log in again." },
      { status: 401 },
    );
  }

  // --- 4. Verify the TOTP code --------------------------------------------
  const otpOk = await verifyTwoFactorCode(
    user.twoFactorSecret,
    body.otp.trim(),
  );

  if (!otpOk) {
    // Increment the shared failure counter (same as password failures).
    const newCount = user.failedLoginAttempts + 1;
    const shouldLock = newCount >= LOCKOUT_THRESHOLD;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : newCount,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCKOUT_DURATION_MINS * 60 * 1000)
          : user.lockedUntil,
      },
    });

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent") ?? null;
    await db.loginAttempt.create({
      data: { email: user.email, success: false, userId: user.id, ip, userAgent },
    });

    const remaining = shouldLock
      ? 0
      : Math.max(0, LOCKOUT_THRESHOLD - newCount);
    return NextResponse.json(
      {
        error: shouldLock
          ? `Account locked for ${LOCKOUT_DURATION_MINS} minutes due to repeated failed attempts.`
          : `Invalid code. ${remaining} attempt(s) remaining.`,
      },
      { status: 401 },
    );
  }

  // --- 5. Success — reset failure counter + issue session -----------------
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;
  await db.loginAttempt.create({
    data: { email: user.email, success: true, userId: user.id, ip, userAgent },
  });

  const jti = generateJTI();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: { userId: user.id, jti, expiresAt, ip, userAgent },
  });

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "user_login_2fa",
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
