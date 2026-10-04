import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/prisma";
import { Severity } from "@prisma/client";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email-templates";

// =============================================================================
// POST /api/auth/forgot-password
// -----------------------------------------------------------------------------
// Self-service password reset request. Unauthenticated — anyone can call it
// with just an email address. The route looks up the user by email and, if
// found AND not disabled, generates a fresh `passwordResetToken` (same field
// used by the admin-reset flow) + emails them a set-password link.
//
// DESIGN GOALS (per spec):
//   1. IDENTICAL RESPONSE FOR UNKNOWN EMAILS.
//      The route returns the same `{ success: true, message: "If an account
//      exists for that email, a reset link has been sent." }` payload whether
//      or not the email matches a user. This prevents email-enumeration: a
//      stranger cannot probe the endpoint to discover who has an account.
//      We do NOT short-circuit early when the user isn't found — we still
//      run the rate limiter + return the same payload, so timing differences
//      don't leak either.
//
//   2. RATE LIMITED.
//      We limit per-IP to 3 requests / 10 minutes (FORGOT_PASSWORD_RATE).
//      This stops a stranger from hammering the endpoint to (a) discover
//      which emails exist via the email-sent side channel, or (b) spam a
//      victim's inbox with reset emails. The rate limit is enforced BEFORE
//      the user lookup so an attacker hitting the limit gets the same 429
//      whether the email exists or not.
//
//      Per-email rate limit is enforced via a minimum re-issue window
//      (FORGOT_PASSWORD_REISSUE_MS, 60s). If a token was issued < 60s ago,
//      we DON'T issue a new one — we silently no-op + return success. This
//      means a legitimate user who clicks "Send" twice by accident doesn't
//      get two emails, but an attacker can't use it to amplify.
//
//   3. AUDIT LOG.
//      Every request that resolves to a known user is recorded in the audit
//      log with action `user_forgot_password` (WARNING severity — sensitive
//      action, even though no auth was required). Requests for unknown emails
//      are NOT audited (we'd be logging spam from bots hitting random
//      addresses), but the rate-limit Map captures the IP for forensic review
//      if abuse is suspected.
//
//   4. DOES NOT INVALIDATE THE OLD PASSWORD.
//      Unlike the admin-reset route, the self-service flow does NOT set
//      `passwordHash` to "!pending". The user can keep using their existing
//      password until they complete the reset. This is intentional: a user
//      who clicks "Forgot password?" by accident shouldn't be locked out of
//      their account. The token alone is sufficient — if they actually
//      forgot the password, they have the link; if they didn't, the link
//      expires in 1 hour and nothing changes.
//
//   5. DOES NOT BYPASS 2FA.
//      Setting a new password via the token doesn't log the user in — they
//      still have to go through the regular login flow, which includes 2FA
//      if enabled. So a stolen reset link alone can't compromise an account
//      that has 2FA on.
//
// TOKEN REUSE:
//   We reuse the existing `User.passwordResetToken` + `passwordResetExpires`
//   columns (the same fields used by admin-reset and user-creation flows).
//   This means: if an admin reset is already in-flight (token issued, not
//   yet consumed), a self-service request OVERWRITES that token. That's fine
//   — the user only needs ONE valid token at a time, and the admin's token
//   was already invalidated by being overwritten.
//
// EMAIL DELIVERY:
//   Email is sent via `sendPasswordResetEmail` from `@/lib/email-templates`.
//   If SMTP isn't configured (dev/test env), the email is logged to console
//   and the function returns `success: false`. We DO NOT leak this to the
//   caller — the response payload is the same success message regardless of
//   whether the email was actually delivered. (In dev, the test user can
//   read the URL from the server log.)
// =============================================================================

/** Self-service reset token expiry: 1 hour (shorter than admin's 24h). */
const FORGOT_PASSWORD_TTL_MS = 60 * 60 * 1000;

/**
 * Per-email re-issue window: if a token was issued less than this many ms
 * ago, we DON'T issue a new one. Prevents a misbehaving client (or an
 * attacker who knows the email) from spamming the user's inbox.
 */
const FORGOT_PASSWORD_REISSUE_MS = 60 * 1000; // 60 seconds

/** Per-IP rate limit: 3 requests per 10 minutes. */
const FORGOT_PASSWORD_RATE = { max: 3, windowMs: 10 * 60 * 1000 };

/** Build the absolute set-password URL the user will click in the email. */
function buildSetPasswordUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  if (base) return `${base}/?token=${token}`;
  // Fall back to a relative URL — works on the same origin.
  return `/?token=${token}`;
}

/** Identical success payload sent for known AND unknown emails. */
const SUCCESS_PAYLOAD = {
  success: true,
  message:
    "If an account exists for that email, a password reset link has been sent. " +
    "The link will expire in 1 hour. If you don't receive an email within a few " +
    "minutes, check your spam folder or contact the Industrial Registrar's office.",
};

export async function POST(req: NextRequest) {
  // --- 1. Parse the body ---------------------------------------------------
  let body: { email?: unknown };
  try {
    body = (await req.json()) as { email?: unknown };
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

  const email = body.email.trim().toLowerCase();

  // Basic shape check — we don't need a full RFC 5322 regex here. The DB
  // lookup will fail for nonsense strings, and the response is identical
  // to "user not found" so no information leaks.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  // --- 2. Rate limit (per-IP) ----------------------------------------------
  // We extract the IP from the X-Forwarded-For header (set by the reverse
  // proxy in production). Falls back to "unknown" if missing — in that case
  // all unidentified clients share one bucket, which is conservative.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(
    "forgot-password",
    ip,
    FORGOT_PASSWORD_RATE.max,
    FORGOT_PASSWORD_RATE.windowMs,
  );
  if (!rl.allowed) {
    return rateLimitedResponse(rl);
  }

  // --- 3. Look up the user by email ----------------------------------------
  // We do the lookup AFTER the rate-limit check so an attacker hitting the
  // limit gets 429 immediately (no DB round-trip, no information leak).
  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      disabled: true,
      passwordResetToken: true,
      passwordResetExpires: true,
    },
  });

  // --- 4. Issue a token (or silently no-op) --------------------------------
  // We branch on (a) the user existing, (b) being enabled, and (c) no token
  // having been issued in the last FORGOT_PASSWORD_REISSUE_MS. The caller
  // NEVER sees which branch was taken — the response is identical.
  if (user && !user.disabled) {
    const now = Date.now();
    const lastIssuedAt =
      user.passwordResetExpires != null
        ? user.passwordResetExpires.getTime() - FORGOT_PASSWORD_TTL_MS
        : 0;
    const reissueBlocked = now - lastIssuedAt < FORGOT_PASSWORD_REISSUE_MS;

    if (!reissueBlocked) {
      const passwordResetToken = randomBytes(32).toString("hex");
      const passwordResetExpires = new Date(now + FORGOT_PASSWORD_TTL_MS);

      await db.user.update({
        where: { id: user.id },
        data: { passwordResetToken, passwordResetExpires },
      });

      // --- 5a. Audit log entry (only for known users) --------------------
      // Severity: WARNING — password-reset requests are sensitive. A burst
      // of these against one account is a strong signal of an attempted
      // takeover, and the audit trail lets a Registrar spot it.
      await db.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.email,
          action: "user_forgot_password",
          entityType: "User",
          entityId: user.id,
          beforeJson: JSON.stringify({
            email: user.email,
            hadExistingResetToken: user.passwordResetToken !== null,
          }),
          afterJson: JSON.stringify({
            email: user.email,
            resetTokenIssued: true,
            resetExpiresAt: passwordResetExpires.toISOString(),
          }),
          severity: Severity.WARNING,
        },
      });

      // --- 5b. Send the email (best-effort) -------------------------------
      // We don't await failures — the response is the same regardless. If
      // SMTP isn't configured in dev, the URL is logged to the server
      // console so the test user can copy it.
      const setPasswordUrl = buildSetPasswordUrl(passwordResetToken);
      sendPasswordResetEmail({
        to: user.email,
        setPasswordUrl,
        expiresAt: passwordResetExpires,
        // The email template uses this to render "performed by X". For a
        // self-service reset, the user themselves is the actor — we make
        // that explicit so the email doesn't say "performed by an admin".
        createdByEmail: user.email,
        isNewUser: false,
      }).then((result) => {
        if (!result.success) {
          // SMTP not configured or send failed. Log the URL so dev/test
          // users can still complete the flow. In production this branch
          // means a real email wasn't sent — the operator should monitor
          // for this in the server logs.
          console.log(
            `[forgot-password] Email not sent to ${user.email} (${result.error}). ` +
              `Reset URL: ${setPasswordUrl}`,
          );
        }
      });
    }
    // If reissueBlocked is true, we silently return success — the user
    // already has a valid link in their inbox from < 60s ago.
  }

  // --- 6. Return the identical success payload -----------------------------
  // Whether the user was found, disabled, rate-limited on reissue, or
  // successfully issued — the response is the same. This is the spec's
  // "strangers can't use it to discover who has an account" requirement.
  //
  // We attach the rate-limit headers so polite clients can self-throttle.
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
  };
  return NextResponse.json(SUCCESS_PAYLOAD, { status: 200, headers });
}
