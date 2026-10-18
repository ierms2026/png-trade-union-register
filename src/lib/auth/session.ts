import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// =============================================================================
// HMAC-signed session cookies with a JTI (JWT ID) for revocation.
//
// WHY THIS DESIGN (and not stateless JWT):
// A stateless JWT encodes the entire session payload (userId, role, exp, ...)
// in the cookie and signs it. Revocation then requires a denylist — which
// is just a session table with extra steps. We take the simpler route:
//
//   - The cookie carries only { jti, exp }, HMAC-signed.
//   - The server looks up the Session row by `jti` on every protected
//     request. If the row is gone (revoked), access is denied.
//   - Revocation = DELETE FROM Session WHERE jti = ? (single SQL statement).
//
// Why the cookie still carries `exp` (server-side truth is in the DB):
// A malicious caller could replay an expired cookie. By checking `exp` in
// the cookie itself *before* hitting the DB, we save a query on the obvious
// reject path. The DB row's `expiresAt` is still authoritative — if the
// cookie's `exp` hasn't fired yet but the row has been deleted (revoked),
// the lookup returns null and we deny.
//
// WHY HMAC (not JWT):
// HMAC is a single primitive — `crypto.createHmac`. JWT requires a library
// (jsonwebtoken, jose) for a problem that's solvable in 30 lines of stdlib
// code. We already pull in `otplib` for TOTP in Step 5; we don't need a
// second crypto library for HMAC.
//
// WHY timingSafeEqual on the signature comparison:
// A naive `===` comparison short-circuits on the first non-matching byte,
// leaking signature length / byte-position info via response timing.
// `timingSafeEqual` runs in constant time. Not strictly necessary here
// (the signature is derived from a server-held secret, so an attacker
// can't enumerate it byte-by-byte without already having the secret),
// but it costs nothing and removes a class of "you should have used
// constant-time" code-review comments.
// =============================================================================

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

/**
 * The cookie name sent to the browser. The `urm_` prefix matches the future
 * API key prefix (Session 4) for brand consistency — both are auth tokens
 * issued by the Union Records Management system.
 */
export const SESSION_COOKIE_NAME = "urm_session";

/**
 * Session lifetime: 7 days from issuance. Aligns with the demo spec's
 * "Active Sessions" dialog (a session row stays valid for a week, then
 * expires; the user can revoke earlier from that dialog).
 */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * HMAC secret. In production this MUST be a 32+ char random string from
 * the secret manager (enforced by instrumentation.ts at boot time).
 *
 * In dev, if SESSION_SECRET is not set, we use a stable fallback so the
 * app always boots. This is NOT secure for production — the
 * instrumentation.ts check throws before the app starts in production
 * if SESSION_SECRET is missing.
 */
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET environment variable is required in production. " +
        "Generate one with: openssl rand -hex 32 and add it to .env",
    );
  }
  console.warn(
    "[auth] SESSION_SECRET not set — using dev-only fallback. " +
      "Do NOT use in production.",
  );
}

const SECRET = SESSION_SECRET ?? "dev-only-insecure-fallback-do-not-use-in-prod";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** The signed payload that travels in the cookie. Kept minimal. */
interface SessionPayload {
  /** JWT ID — the lookup key into the Session table. */
  jti: string;
  /** Expiry (epoch ms). Server-side row is authoritative; this is the
   *  cheap pre-DB reject. */
  exp: number;
}

/** Result of verifying a cookie — either the parsed payload or null. */
export interface VerifiedSession {
  jti: string;
  expiresAt: Date;
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

/** Base64url-encode a string (URL-safe, no padding) — cookie-safe. */
function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

/** Base64url-decode a string back to UTF-8. */
function b64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

/** Compute the HMAC-SHA256 signature for a payload string. Returns base64url. */
function sign(payloadJson: string): string {
  return createHmac("sha256", SECRET).update(payloadJson).digest("base64url");
}

/** Constant-time comparison of two base64url strings. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "base64url");
  const bufB = Buffer.from(b, "base64url");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// -----------------------------------------------------------------------------
// Public API — "placeholder" in the sense that nothing calls these yet.
// They will be wired up in Step 5 when we build /api/auth/login and the
// auth-guard. The implementations below are final, not stubs.
// -----------------------------------------------------------------------------

/**
 * Generate a fresh JTI (JWT ID).
 *
 * Uses `crypto.randomUUID()` — RFC 4122 v4 UUID. 122 bits of entropy,
 * collision-resistant for our scale (a registrar issues maybe 100 sessions
 * a year; UUID v4 supports 2^71 IDs before a 50% collision probability).
 *
 * @returns A 36-char hyphenated UUID string, e.g. "f47ac10b-58cc-4372-a567-0e02b2c3d479".
 */
export function generateJTI(): string {
  return randomUUID();
}

/**
 * Mint a signed session cookie value for a freshly-issued JTI.
 *
 * Call this AFTER persisting the Session row — the cookie and the DB row
 * are a matched pair. If you mint the cookie before writing the row, a
 * request could arrive between mint and write and the lookup would fail.
 *
 * @example
 * const jti = generateJTI();
 * const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
 * await db.session.create({ data: { userId, jti, expiresAt, ip, userAgent } });
 * const cookieValue = createSessionCookieValue(jti, expiresAt);
 * // → "eyJqdGkiOiJmNDc...".a3F5V3Z0...
 * res.cookies.set(SESSION_COOKIE_NAME, cookieValue, { httpOnly: true, ... });
 */
export function createSessionCookieValue(jti: string, expiresAt: Date): string {
  const payload: SessionPayload = { jti, exp: expiresAt.getTime() };
  const payloadJson = JSON.stringify(payload);
  return `${b64url(payloadJson)}.${sign(payloadJson)}`;
}

/**
 * Verify a session cookie value received from the browser.
 *
 * Returns the parsed `{ jti, expiresAt }` if the signature is valid and the
 * cookie-level expiry hasn't fired. Returns `null` for ANY failure mode —
 * malformed cookie, bad signature, expired — so the caller treats all
 * nulls identically as "treat as unauthenticated, don't leak why".
 *
 * NOTE: This function does NOT verify the Session row exists in the DB.
 * The caller (auth-guard in Step 5) must do `db.session.findUnique({ jti })`
 * to confirm revocation hasn't happened. Cookie verification is the cheap
 * pre-DB reject; the DB lookup is the authoritative revocation check.
 */
export function verifySessionCookieValue(cookieValue: string): VerifiedSession | null {
  // Format check: must be "<base64url-payload>.<base64url-signature>"
  const dotIndex = cookieValue.indexOf(".");
  if (dotIndex <= 0 || dotIndex === cookieValue.length - 1) return null;
  if (cookieValue.indexOf(".", dotIndex + 1) !== -1) return null; // >1 dot

  const payloadB64 = cookieValue.slice(0, dotIndex);
  const signature = cookieValue.slice(dotIndex + 1);

  // Decode payload — malformed base64url or non-JSON → null
  let payloadJson: string;
  try {
    payloadJson = b64urlDecode(payloadB64);
  } catch {
    return null;
  }

  // Verify signature — constant-time comparison
  const expectedSignature = sign(payloadJson);
  if (!safeEqual(signature, expectedSignature)) return null;

  // Parse payload — must be well-formed JSON with jti + exp
  let payload: SessionPayload;
  try {
    payload = JSON.parse(payloadJson) as SessionPayload;
  } catch {
    return null;
  }
  if (
    typeof payload?.jti !== "string" ||
    typeof payload?.exp !== "number" ||
    !payload.jti ||
    !Number.isFinite(payload.exp)
  ) {
    return null;
  }

  // Cookie-level expiry — cheap pre-DB reject
  if (Date.now() >= payload.exp) return null;

  return { jti: payload.jti, expiresAt: new Date(payload.exp) };
}

// -----------------------------------------------------------------------------
// Cookie attribute helpers — used by the login route (Step 5) when calling
// `res.cookies.set(...)`. Centralized here so every route that sets or clears
// the cookie uses the same attributes (HttpOnly, SameSite, Secure, Path).
// -----------------------------------------------------------------------------

/** Attributes for the Set-Cookie header when issuing a session. */
export const SESSION_COOKIE_ATTRIBUTES = {
  httpOnly: true, // JS cannot read the cookie → XSS can't exfiltrate it
  sameSite: "lax" as const, // CSRF protection — cookie sent on top-level nav, not on cross-site POST
  secure: process.env.NODE_ENV === "production", // HTTPS-only in prod
  path: "/", // Valid for the whole app
  maxAge: SESSION_TTL_MS / 1000, // Browser discards at expiry
} as const;

/** Attributes for the Set-Cookie header when clearing the session (logout). */
export const SESSION_CLEAR_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 0, // Browser discards immediately
} as const;

// -----------------------------------------------------------------------------
// 2FA Challenge Token — HMAC-signed
// -----------------------------------------------------------------------------
// The challenge token is the bridge between step 1 (password verified) and
// step 2 (OTP verified) of the two-step login. It carries the userId so the
// 2FA route knows whose OTP to check.
//
// SECURITY:
//   - Format: base64url(payload).base64url(signature)
//     where payload = JSON.stringify({ userId, iat })
//   - Signed with the same SECRET as session cookies — one secret, multiple
//     consumers. The signature binds the payload to the server; an attacker
//     can't forge a token without the SECRET.
//   - 30s TTL — tight enough that a stolen token (e.g. from a browser
//     extension scraping the response) is nearly useless.
//   - The 2FA route STILL re-loads the user from the DB before accepting
//     the token, so a disabled user or a reset 2FA secret between steps 1
//     and 2 is caught independently of the signature.
//
// WHY SIGN IT (when the prior unsigned version "worked"):
//   - Without a signature, an attacker who learns a userId (e.g. from a
//     leaked URL, log file, or social engineering) can forge a challenge
//     token: `base64("userId:" + Date.now())`. They could then probe the
//     2FA endpoint directly, bypassing the password check + lockout
//     counter — a 6-digit OTP has only 10^6 space, and lockout only fires
//     after 3 attempts. With signing, forging is impossible without the
//     SECRET, so the password+lockout gate stays intact.
// -----------------------------------------------------------------------------

/** Challenge token TTL: 30 seconds. */
export const CHALLENGE_TOKEN_TTL_MS = 30 * 1000;

interface ChallengePayload {
  userId: string;
  iat: number; // issued-at (epoch ms)
}

/**
 * Mint an HMAC-signed challenge token for the 2FA flow.
 *
 * Call this from the login route after the password is verified but 2FA
 * is required. The client receives the token and POSTs it back to
 * /api/auth/login/2fa along with the OTP code.
 */
export function signChallengeToken(userId: string): string {
  const payload: ChallengePayload = { userId, iat: Date.now() };
  const payloadJson = JSON.stringify(payload);
  return `${b64url(payloadJson)}.${sign(payloadJson)}`;
}

/**
 * Verify a challenge token's signature + TTL. Returns the userId if
 * valid, `null` for any failure (bad signature, expired, malformed).
 *
 * As with `verifySessionCookieValue`, all failure modes return null so
 * the caller treats them identically — no information leakage.
 */
export function parseChallengeToken(token: string): string | null {
  // Format check: exactly one dot, separating payload and signature.
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;
  if (token.indexOf(".", dotIndex + 1) !== -1) return null; // >1 dot

  const payloadB64 = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  // Decode payload
  let payloadJson: string;
  try {
    payloadJson = b64urlDecode(payloadB64);
  } catch {
    return null;
  }

  // Verify signature (constant-time)
  const expectedSignature = sign(payloadJson);
  if (!safeEqual(signature, expectedSignature)) return null;

  // Parse payload
  let payload: ChallengePayload;
  try {
    payload = JSON.parse(payloadJson) as ChallengePayload;
  } catch {
    return null;
  }
  if (
    typeof payload?.userId !== "string" ||
    !payload.userId ||
    typeof payload?.iat !== "number" ||
    !Number.isFinite(payload.iat)
  ) {
    return null;
  }

  // TTL check
  if (Date.now() - payload.iat > CHALLENGE_TOKEN_TTL_MS) return null;

  return payload.userId;
}
