import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";

// =============================================================================
// GET /api/users  |  POST /api/users
// -----------------------------------------------------------------------------
// REGISTRAR-only. Inspectors are read-only on user data; Officers have no
// business seeing the user list.
//
// GET: list all users (no password hash in the response — strip sensitive
//      fields before returning).
//
// POST: create a new user. NO PASSWORD is accepted in the request body per
//      spec — the API generates a passwordResetToken and returns it in the
//      response, simulating an email-send. The user sets their own password
//      via the set-password route (Session 1 Step 5, future) using that
//      token. This prevents an admin from ever knowing the user's password,
//      even at creation time.
//
// WHY NO PASSWORD IN BODY:
//   1. If the admin types the password, they know it. Even with best
//      intentions, that's a security fail — a coerced admin could be
//      forced to disclose a user's password.
//   2. The user setting their own password (via the reset link) means
//      it's never in the admin's browser history, never in the request
//      log, never in the audit trail.
//   3. Email verification side effect: forcing the user to click a link
//      confirms their email is real and they have access to it.
// =============================================================================

// Sensitive fields stripped from every user response. Even admins shouldn't
// see password hashes or 2FA secrets in a list view — if they need to
// verify 2FA status, we expose `twoFactorEnabled` (boolean) only.
//
// NOTE: User has no createdAt/updatedAt (trimmed from the Session 1 schema
// spec). Don't add them here — the smoke test will fail at the Prisma level.
const USER_PUBLIC_FIELDS = {
  id: true,
  email: true,
  role: true,
  assignedUnionId: true,
  twoFactorEnabled: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  disabled: true,
  // DELIBERATELY EXCLUDED:
  // - passwordHash         (never expose, even to admins)
  // - twoFactorSecret      (never expose — would let admin impersonate 2FA)
  // - passwordResetToken   (one-time secret, only returned on creation/reset)
  // - passwordResetExpires (internal)
} as const;

/** Password reset token expiry: 24 hours from generation. */
const PASSWORD_RESET_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can view the user list." },
      { status: 403 },
    );
  }

  const users = await db.user.findMany({
    select: USER_PUBLIC_FIELDS,
    orderBy: { email: "asc" },
  });

  return NextResponse.json({ users });
}

// -----------------------------------------------------------------------------
// POST — create a user
// -----------------------------------------------------------------------------

interface CreateRequestBody {
  email?: unknown;
  role?: unknown;
  assignedUnionId?: unknown;
}

export async function POST(req: NextRequest) {
  // --- 1. Auth check -------------------------------------------------------
  const actor = await getAuthUser(req);
  if (!actor) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (actor.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can create users." },
      { status: 403 },
    );
  }

  // --- 2. Parse + validate the body ---------------------------------------
  let body: CreateRequestBody;
  try {
    body = (await req.json()) as CreateRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  // email — required, must be a non-empty string, format check is light
  // (we don't ship a full email regex; the DB unique constraint catches
  // duplicates, and the set-password route will fail loudly if the email
  // is undeliverable).
  if (
    typeof body.email !== "string" ||
    body.email.trim().length === 0 ||
    !body.email.includes("@")
  ) {
    return NextResponse.json(
      { error: "Field 'email' is required and must be a valid email address." },
      { status: 400 },
    );
  }

  // role — required, must be one of the enum values
  if (
    typeof body.role !== "string" ||
    !["REGISTRAR", "INSPECTOR", "OFFICER", "REPRESENTATIVE"].includes(body.role)
  ) {
    return NextResponse.json(
      { error: "Field 'role' is required and must be one of: REGISTRAR, INSPECTOR, OFFICER, REPRESENTATIVE." },
      { status: 400 },
    );
  }

  // assignedUnionId — required for OFFICER + REPRESENTATIVE, must be null
  // for others. Per spec, Officers and Representatives are scoped to
  // exactly one union; Registrars and Inspectors have no scoping.
  if (body.role === "OFFICER" || body.role === "REPRESENTATIVE") {
    if (
      typeof body.assignedUnionId !== "string" ||
      body.assignedUnionId.trim().length === 0
    ) {
      return NextResponse.json(
        { error: `Field 'assignedUnionId' is required when role is ${body.role}.` },
        { status: 400 },
      );
    }
    // Verify the union exists (404 if not — union existence isn't secret here)
    const unionExists = await db.union.findUnique({
      where: { id: body.assignedUnionId },
      select: { id: true },
    });
    if (!unionExists) {
      return NextResponse.json(
        { error: "The specified assignedUnionId does not match an existing union." },
        { status: 400 },
      );
    }
  } else {
    if (body.assignedUnionId !== undefined && body.assignedUnionId !== null) {
      return NextResponse.json(
        {
          error: `Field 'assignedUnionId' must be null when role is ${body.role}. Only Officers and Representatives are scoped to a union.`,
        },
        { status: 400 },
      );
    }
  }

  const email = body.email.trim().toLowerCase();
  const role = body.role as Role;
  const assignedUnionId =
    role === Role.OFFICER || role === Role.REPRESENTATIVE
      ? (body.assignedUnionId as string)
      : null;

  // --- 3. Check for duplicate email (409 if exists) -------------------------
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists." },
      { status: 409 },
    );
  }

  // --- 4. Generate the password reset token --------------------------------
  // 32 bytes = 256 bits of entropy. Hex-encoded (64 chars). Sufficient
  // for a one-time token — unguessable, and the expiresAt limits the
  // attack window to 24 hours even if intercepted.
  const passwordResetToken = randomBytes(32).toString("hex");
  const passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  // --- 5. Create the user --------------------------------------------------
  // passwordHash is set to a placeholder ("!pending") — the user will
  // replace it via the set-password route. The "!" prefix makes it
  // obviously-not-a-real-hash; the login route will reject it
  // (bcryptjs.verify returns false for any non-bcrypt string).
  const newUser = await db.user.create({
    data: {
      email,
      role,
      assignedUnionId,
      passwordHash: "!pending", // replaced when user sets their password
      passwordResetToken,
      passwordResetExpires,
    },
    select: USER_PUBLIC_FIELDS,
  });

  // --- 6. Audit log entry --------------------------------------------------
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action: "user_create",
      entityType: "User",
      entityId: newUser.id,
      // beforeJson is null (create action — nothing existed before)
      beforeJson: null,
      afterJson: JSON.stringify({
        ...newUser,
        // Don't log the passwordResetToken in the audit trail — it's a
        // one-time secret. The audit trail just records that a create
        // happened and what the user's role/email are.
        // (The token is returned in the API response ONCE, simulating
        // an email send — see comment in the route header.)
      }),
      severity: Severity.INFO,
    },
  });

  // --- 7. Return the new user + the reset token (ONE TIME) -----------------
  // The token is included here because this is the "email send" moment.
  // The frontend will display it once and the user is expected to copy it.
  // Subsequent GET /api/users responses do NOT include the token.
  return NextResponse.json(
    {
      user: newUser,
      // The password reset token — display this once to the admin and
      // the user. In production, this would be sent via email and never
      // returned in the API response. We include it here to simulate
      // the email-send for dev/test.
      passwordResetToken,
      passwordResetExpires,
    },
    { status: 201 },
  );
}
