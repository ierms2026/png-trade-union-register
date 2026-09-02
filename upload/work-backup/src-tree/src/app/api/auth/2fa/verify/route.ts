import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { verifyTwoFactorCode } from "@/lib/auth/totp";
import { Severity } from "@prisma/client";

// =============================================================================
// POST /api/auth/2fa/verify
// -----------------------------------------------------------------------------
// Completes the 2FA enrollment flow:
//   1. Client called /api/auth/2fa/setup, got a (secret, qrCodeDataUrl).
//   2. Client scanned the QR with their authenticator app.
//   3. Client POSTs { secret, code } here.
//   4. We verify the code against the secret.
//   5. On success, we PERSIST the secret + set twoFactorEnabled=true.
//
// WHY THE CLIENT SENDS THE SECRET BACK:
//   - The setup endpoint didn't persist the secret (see its header for
//     why). The verify endpoint needs the secret to verify the code,
//     so the client must send it back.
//   - This is safe: the secret is freshly generated per enrollment,
//     sent over HTTPS, and only persisted after a successful verify.
//     An attacker intercepting the setup response can't enable 2FA
//     without also having the user's session cookie (auth required).
//
// IDEMPOTENCY:
//   - If the user already has 2FA enabled, calling this endpoint
//     overwrites their secret. This is intentional — it lets a user
//     re-enroll if they lose their phone (after an admin resets 2FA
//     via /api/users/[id]/reset-2fa, the user re-enrolls here).
//
// AUDIT:
//   - We log the 2FA enable with severity INFO. The action is
//     sensitive (it tightens the account's security) but not a
//     containment action (lockout/disable) which would warrant WARNING.
// =============================================================================

interface VerifyRequestBody {
  secret?: unknown;
  code?: unknown;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  let body: VerifyRequestBody;
  try {
    body = (await req.json()) as VerifyRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (typeof body.secret !== "string" || body.secret.length === 0) {
    return NextResponse.json(
      { error: "Secret is required." },
      { status: 400 },
    );
  }
  if (typeof body.code !== "string" || body.code.length === 0) {
    return NextResponse.json(
      { error: "Code is required." },
      { status: 400 },
    );
  }

  // Verify the TOTP code against the secret from the setup step.
  const ok = await verifyTwoFactorCode(body.secret, body.code.trim());
  if (!ok) {
    return NextResponse.json(
      { error: "Invalid code. Please try again." },
      { status: 400 },
    );
  }

  // Persist the secret + enable 2FA. This is the commit point — before
  // this, the secret only existed in the client's memory.
  await db.user.update({
    where: { id: user.id },
    data: {
      twoFactorSecret: body.secret,
      twoFactorEnabled: true,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "user_2fa_enable",
      entityType: "User",
      entityId: user.id,
      severity: Severity.INFO,
    },
  });

  return NextResponse.json({ success: true });
}
