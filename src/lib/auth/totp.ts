import { TOTP, generateSecret, generateURI } from "otplib";
import QRCode from "qrcode";

// =============================================================================
// TOTP (Time-based One-Time Password) — RFC 6238 — for two-factor auth.
//
// WHY TOTP (not SMS, not push notifications):
//   - Offline: the secret + clock are all that's needed. No phone number
//     to leak, no carrier to trust, no push service to operate.
//   - Standard: every authenticator app (Google Authenticator, Authy,
//     1Password, Microsoft Authenticator) supports the otpauth:// URI
//     scheme we generate below. Users pick their own app.
//   - Phishing-resistant when paired with a hardware key (FIDO2/WebAuthn),
//     but TOTP alone is still a major step up from password-only — the
//     attacker needs BOTH the password AND the secret, which means they
//     need to compromise the user's device, not just the network.
//
// WHY otplib v13 (not the older v12 API):
//   - v13 is TypeScript-first with a clean class + functional API.
//   - The TOTP class encapsulates config (digits, period, tolerance) so
//     we configure it once and reuse the instance.
//   - Built-in plugins for crypto (NobleCryptoPlugin) and base32
//     (ScureBase32Plugin) — no manual plugin wiring needed for the
//     common case.
//
// CONFIGURATION:
//   - digits: 6      — RFC 6238 standard; matches every authenticator app.
//   - period: 30s    — RFC 6238 default; matches every authenticator app.
//   - epochTolerance: 30s — accepts tokens from the previous AND next
//     30s window. This handles clock drift between the user's phone and
//     the server (a phone 20s slow would generate a "previous window"
//     token that's still valid). Tighter than the v12 `window: 1` (which
//     meant 1 period each way = 30s each way), so the security posture
//     is identical.
// =============================================================================

// Singleton TOTP instance configured once, reused across all verifications.
// Creating a new instance per request would be wasteful (the config doesn't
// change) — but each call to .verify() is still independent (no shared
// mutable state).
const totp = new TOTP({
  digits: 6,
  period: 30,
  // 30 seconds of tolerance each way = 1 period window (matches v12's
  // `window: 1`). Aligns with the spec's intent.
  epochTolerance: 30,
});

/**
 * Generate a fresh Base32-encoded TOTP secret for a new 2FA enrollment.
 *
 * Returns a 32-character Base32 string (20 bytes of entropy = 160 bits),
 * which is the standard for TOTP secrets and works with every
 * authenticator app.
 */
export function generateTwoFactorSecret(): string {
  // otplib's generateSecret() uses 20 bytes by default, which is the
  // RFC 4226 recommendation. No need to override.
  return generateSecret();
}

/**
 * Build the `otpauth://` URI for QR code generation.
 *
 * The URI format is:
 *   otpauth://totp/<issuer>:<label>?secret=<secret>&issuer=<issuer>&digits=6&period=30
 *
 * Authenticator apps parse this URI from the QR code to enroll the
 * account. The `issuer` shows up as the app name in the authenticator;
 * the `label` is typically the user's email.
 *
 * @param email   The user's email — used as the account label.
 * @param secret  The Base32 secret from generateTwoFactorSecret().
 */
export function buildOtpAuthUri(email: string, secret: string): string {
  return generateURI({
    issuer: "Union Records Management",
    label: email,
    secret,
    // digits + period are encoded in the URI so the authenticator app
    // uses the same config we verify with. Defaults match our TOTP
    // instance, but being explicit avoids drift if the defaults change.
    digits: 6,
    period: 30,
  });
}

/**
 * Generate a QR code as a data URL (base64-encoded PNG) for the given
 * otpauth:// URI.
 *
 * The data URL can be rendered directly in an <img src="..."> tag — no
 * need to host the QR code as a file. The QR code is generated on the
 * server (not the client) so the secret never touches the browser's
 * JS heap until the user explicitly enrolls.
 *
 * @param uri  The otpauth:// URI from buildOtpAuthUri.
 * @returns    A `data:image/png;base64,...` string.
 */
export async function generateQrCodeDataUrl(uri: string): Promise<string> {
  // QRCode.toDataURL returns a Promise<string> in modern qrcode (v1.5+).
  // Error correction level 'M' (15% redundancy) is the default and is
  // sufficient for a clean QR scan from a screen.
  return QRCode.toDataURL(uri, {
    errorCorrectionLevel: "M",
    width: 240, // 240px — large enough to scan from a phone, small enough for the dialog
  });
}

/**
 * Verify a 6-digit TOTP token against a stored secret.
 *
 * Uses the singleton `totp` instance configured with a 30s tolerance
 * window each way (handles clock drift). Returns `true` if the token
 * is valid for the current (or adjacent) time step.
 *
 * IMPORTANT:
 *   - The caller is responsible for rate-limiting failed attempts (the
 *     login route applies the same LOCKOUT_THRESHOLD as password failures).
 *   - The caller is responsible for clearing the secret after a
 *     successful verify IF the verify is part of an enrollment flow
 *     (the 2fa/verify route does this — it persists the secret only on
 *     success).
 *
 * @param secret  The Base32 secret stored on the User row.
 * @param token   The 6-digit code the user entered.
 */
export async function verifyTwoFactorCode(
  secret: string,
  token: string,
): Promise<boolean> {
  // Defensive: empty inputs shouldn't crash — return false.
  if (!secret || !token) return false;

  try {
    const result = await totp.verify(token, { secret });
    // otplib v13 returns a VerifyResult object with a `valid` boolean.
    // Older v12 returned a plain boolean. We handle both shapes for
    // forward-compatibility.
    if (typeof result === "boolean") return result;
    return Boolean(result?.valid);
  } catch {
    // Any error (malformed secret, malformed token, plugin failure) →
    // treat as a failed verification. The caller's rate limiter will
    // handle repeated failures.
    return false;
  }
}
