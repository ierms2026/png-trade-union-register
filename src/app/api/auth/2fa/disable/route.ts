import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { verifyPassword } from "@/lib/auth/password";
import { Severity } from "@prisma/client";

// =============================================================================
// POST /api/auth/2fa/disable
// -----------------------------------------------------------------------------
// Disables 2FA on the current user's account. Requires the user's
// password as confirmation — this prevents a stolen session cookie
// from being used to silently weaken the account's security.
//
// WHY REQUIRE PASSWORD:
//   - 2FA is a security improvement. Disabling it is a security
//     regression. We require the password (a second factor the
//     attacker doesn't have, even if they have the session cookie)
//     to confirm the user genuinely wants to disable 2FA.
//   - This mirrors the "sudo mode" pattern: sensitive account changes
//     require re-authentication, even within an active session.
//
// AUDIT:
//   - Severity: WARNING. Disabling 2FA is a security-relevant action
//     that should be visible in the audit trail for forensic review
//     if the account is later compromised.
// =============================================================================

interface DisableRequestBody {
  password?: unknown;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  let body: DisableRequestBody;
  try {
    body = (await req.json()) as DisableRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (typeof body.password !== "string" || body.password.length === 0) {
    return NextResponse.json(
      { error: "Password is required to disable 2FA." },
      { status: 400 },
    );
  }

  // Load the user's password hash + current 2FA state for the audit.
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: {
      passwordHash: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
    },
  });
  if (!dbUser) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  // Verify the password. We don't reveal whether 2FA was enabled —
  // the response is the same whether 2FA was on or off (the end state
  // is "2FA off" either way).
  const passwordOk = await verifyPassword(body.password, dbUser.passwordHash);
  if (!passwordOk) {
    return NextResponse.json(
      { error: "Incorrect password." },
      { status: 401 },
    );
  }

  // Clear the 2FA fields.
  await db.user.update({
    where: { id: user.id },
    data: {
      twoFactorSecret: null,
      twoFactorEnabled: false,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "user_2fa_disable",
      entityType: "User",
      entityId: user.id,
      // We log the BEFORE state (sanitized — never the secret itself)
      // so the audit trail shows 2FA was enabled before this action.
      beforeJson: JSON.stringify({
        twoFactorEnabled: dbUser.twoFactorEnabled,
        twoFactorSecretWasSet: dbUser.twoFactorSecret !== null,
      }),
      afterJson: JSON.stringify({
        twoFactorEnabled: false,
        twoFactorSecretWasSet: false,
      }),
      severity: Severity.WARNING,
    },
  });

  return NextResponse.json({ success: true });
}
