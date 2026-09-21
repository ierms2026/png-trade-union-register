import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/auth-guard";
import {
  generateTwoFactorSecret,
  buildOtpAuthUri,
  generateQrCodeDataUrl,
} from "@/lib/auth/totp";

// =============================================================================
// POST /api/auth/2fa/setup
// -----------------------------------------------------------------------------
// Generates a fresh TOTP secret + QR code for 2FA enrollment.
//
// CRITICAL: This endpoint does NOT persist the secret. The secret is
// returned to the client (in-memory only on the server) and the user
// must verify a code from their authenticator app via
// /api/auth/2fa/verify BEFORE the secret is saved to the DB.
//
// WHY NOT PERSIST ON SETUP:
//   - If we saved the secret on setup, a user who generated a QR code
//     but never scanned it (or scanned it with the wrong app) would
//     end up with 2FA "enabled" but no working authenticator. They'd
//     be locked out on next login.
//   - The two-step flow (setup → verify) proves the user has a working
//     authenticator before we commit.
//
// RESPONSE SHAPE:
//   {
//     secret: "JBSWY3DPEHPK3PXP",       // Base32 — shown to the user
//                                         // for manual entry if QR fails
//     qrCodeDataUrl: "data:image/png;base64,...",  // <img src="...">
//     otpauthUri: "otpauth://totp/..."   // for clients that want to
//                                         // render their own QR
//   }
//
// AUTH:
//   Requires an authenticated session — only the user themselves can
//   set up 2FA on their own account. An admin forcing 2FA reset uses
//   /api/users/[id]/reset-2fa (which clears 2FA; the user then re-enrolls).
// =============================================================================

export async function POST() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  // Generate a fresh secret for this enrollment attempt.
  const secret = generateTwoFactorSecret();

  // Build the otpauth:// URI that the QR code encodes. The URI includes
  // the user's email as the label so the authenticator app shows the
  // right account name.
  const otpauthUri = buildOtpAuthUri(user.email, secret);

  // Render the URI as a QR code PNG, base64-encoded. The client can
  // drop this directly into <img src={qrCodeDataUrl} />.
  const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUri);

  return NextResponse.json({
    secret,
    qrCodeDataUrl,
    otpauthUri,
  });
}
