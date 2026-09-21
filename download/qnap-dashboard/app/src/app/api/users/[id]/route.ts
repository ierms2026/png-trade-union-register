import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";
import { checkLastRegistrar } from "@/lib/last-registrar";

// =============================================================================
// GET /api/users/[id]  |  PUT /api/users/[id]  |  DELETE /api/users/[id]
// -----------------------------------------------------------------------------
// REGISTRAR-only. The three operations share the last-Registrar protection:
// before changing a user's role to non-REGISTRAR, disabling a REGISTRAR, or
// deleting a REGISTRAR, we count ALL OTHER active REGISTRARs in the system.
// If that count is 0, we reject with 403.
//
// WHY THIS MATTERS:
// A single Registrar could lock the entire state out of its own registry.
// If you're the only active Registrar and you disable yourself (or get
// disabled by another admin, or get role-changed to Inspector), the system
// has no admin left — every other admin operation requires a Registrar, so
// the system is bricked. The protection is SYSTEM-WIDE (not a self-check)
// because:
//   1. A self-check would let Registrar A disable Registrar B if B is the
//      only other one (A is still a Registrar, so the self-check passes),
//      bricking the system.
//   2. A system-wide count correctly blocks the action whenever it would
//      leave the system with 0 active Registrars.
//
// INDEPENDENCE FROM OTHER MECHANISMS:
// The last-Registrar protection is INDEPENDENT of:
//   - Lockout (3 failed logins) — a locked Registrar is still "active" for
//     protection purposes (the lock is temporary, 15 minutes).
//   - 2FA reset — doesn't affect role or disabled state.
//   - Password reset — doesn't affect role or disabled state.
// These can all coexist on the same user without triggering last-Registrar.
// =============================================================================

// Sensitive fields stripped from every user response — same set as the
// list route. Defined again here (not imported) because each route is
// independently auditable; if you're reading this file, you see exactly
// what's exposed.
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
} as const;

// last-Registrar protection logic lives in src/lib/last-registrar.ts (imported above).

// -----------------------------------------------------------------------------
// GET — fetch a single user
// -----------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can view user details." },
      { status: 403 },
    );
  }

  const targetUser = await db.user.findUnique({
    where: { id },
    select: USER_PUBLIC_FIELDS,
  });

  if (!targetUser) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ user: targetUser });
}

// -----------------------------------------------------------------------------
// PUT — update a user (role, assignedUnionId, disabled)
// -----------------------------------------------------------------------------

interface UpdateRequestBody {
  role?: unknown;
  assignedUnionId?: unknown;
  disabled?: unknown;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const actor = await getAuthUser(req);
  if (!actor) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (actor.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can update users." },
      { status: 403 },
    );
  }

  // Parse + validate the body
  let body: UpdateRequestBody;
  try {
    body = (await req.json()) as UpdateRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  // Validate each present field
  const updateData: {
    role?: Role;
    assignedUnionId?: string | null;
    disabled?: boolean;
  } = {};

  if (body.role !== undefined) {
    if (typeof body.role !== "string" || !["REGISTRAR", "INSPECTOR", "OFFICER"].includes(body.role)) {
      return NextResponse.json(
        { error: "Field 'role' must be one of: REGISTRAR, INSPECTOR, OFFICER." },
        { status: 400 },
      );
    }
    updateData.role = body.role as Role;
  }

  if (body.assignedUnionId !== undefined) {
    // Allow null (clears the assignment); non-null must be a string
    if (body.assignedUnionId !== null) {
      if (typeof body.assignedUnionId !== "string" || body.assignedUnionId.trim().length === 0) {
        return NextResponse.json(
          { error: "Field 'assignedUnionId' must be a non-empty string or null." },
          { status: 400 },
        );
      }
      // Verify the union exists
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
    }
    updateData.assignedUnionId = body.assignedUnionId as string | null;
  }

  if (body.disabled !== undefined) {
    if (typeof body.disabled !== "boolean") {
      return NextResponse.json(
        { error: "Field 'disabled' must be a boolean." },
        { status: 400 },
      );
    }
    updateData.disabled = body.disabled;
  }

  // At least one updatable field must be present
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "Request body must include at least one of: role, assignedUnionId, disabled." },
      { status: 400 },
    );
  }

  // Verify the target user exists (404 if not)
  // We fetch with USER_PUBLIC_FIELDS only — passwordHash is excluded by default.
  const existingUser = await db.user.findUnique({
    where: { id },
    select: USER_PUBLIC_FIELDS,
  });
  if (!existingUser) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 },
    );
  }

  // --- Last-Registrar protection ----------------------------------------
  // Triggers if the action would leave the system with 0 active Registrars.
  // Two action types can trigger it:
  //   1. role change: REGISTRAR → (INSPECTOR or OFFICER) — the target is
  //      no longer a Registrar, so we lose one.
  //   2. disabled: false → true — the target is still a Registrar but no
  //      longer active.
  // The check function counts OTHER active Registrars; if 0, block.
  const isRoleChangeAwayFromRegistrar =
    updateData.role !== undefined &&
    updateData.role !== Role.REGISTRAR &&
    existingUser.role === Role.REGISTRAR &&
    !existingUser.disabled;

  const isDisablingActiveRegistrar =
    updateData.disabled === true &&
    existingUser.role === Role.REGISTRAR &&
    !existingUser.disabled;

  if (isRoleChangeAwayFromRegistrar || isDisablingActiveRegistrar) {
    const check = await checkLastRegistrar(id);
    if (!check.safe) {
      return NextResponse.json(
        { error: check.error },
        { status: 403 },
      );
    }
  }

  // Apply the update
  const updatedUser = await db.user.update({
    where: { id },
    data: updateData,
    select: USER_PUBLIC_FIELDS,
  });

  // Audit log entry — beforeJson + afterJson capture the actual state change
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action: "user_update",
      entityType: "User",
      entityId: id,
      beforeJson: JSON.stringify(existingUser),
      afterJson: JSON.stringify(updatedUser),
      severity: Severity.WARNING, // user updates are sensitive (role/disabled)
    },
  });

  return NextResponse.json({ user: updatedUser });
}

// -----------------------------------------------------------------------------
// DELETE — delete a user
// -----------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const actor = await getAuthUser(req);
  if (!actor) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (actor.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can delete users." },
      { status: 403 },
    );
  }

  // Verify the target exists (404 if not)
  const existingUser = await db.user.findUnique({
    where: { id },
    select: USER_PUBLIC_FIELDS,
  });
  if (!existingUser) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 },
    );
  }

  // --- Last-Registrar protection ----------------------------------------
  // Deleting an active Registrar would brick the system. Use the same
  // shared helper — it counts OTHER active Registrars.
  const check = await checkLastRegistrar(id);
  if (!check.safe) {
    return NextResponse.json(
      { error: check.error },
      { status: 403 },
    );
  }

  // --- Pre-delete: check for Task.creator constraint ----------------------
  // Task.creator uses onDelete: Restrict (see schema). If the user created
  // any tasks, the DB-level delete will throw a FK constraint error. We
  // detect this BEFORE attempting the delete so we can return a clear 400
  // instead of a 500.
  //
  // The admin's options at this point:
  //   1. Reassign the tasks to another user (via PATCH /api/tasks/[id] with
  //      a new assigneeId — but createdById is immutable, so this doesn't
  //      help; the creator FK stays).
  //   2. Delete the tasks first (via DELETE /api/tasks/[id]).
  //   3. Disable the user instead of deleting (PUT /api/users/[id] with
  //      disabled: true) — this preserves the audit trail + task provenance.
  //
  // Option 3 is the recommended path in most cases — disabling achieves
  // the security goal (user can't log in) without losing provenance.
  const createdTasksCount = await db.task.count({
    where: { createdById: id },
  });
  if (createdTasksCount > 0) {
    return NextResponse.json(
      {
        error:
          `Cannot delete this user because they created ${createdTasksCount} task(s). ` +
          "Task creator is preserved for audit provenance (onDelete: Restrict). " +
          "Either delete those tasks first, or disable the user instead " +
          "(PUT /api/users/[id] with disabled: true).",
        createdTasksCount,
      },
      { status: 400 },
    );
  }

  // Audit log entry BEFORE the delete (so we capture the before-state).
  // The afterJson is null because the entity is gone.
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action: "user_delete",
      entityType: "User",
      entityId: id,
      beforeJson: JSON.stringify(existingUser),
      afterJson: null,
      severity: Severity.WARNING,
    },
  });

  // Delete the user. Cascades per the schema's onDelete rules:
  //   - Session → Cascade (sessions die with the user)
  //   - LoginAttempt → SetNull (userId nulled, row stays for forensics)
  //   - AuditLog → SetNull (actorId nulled, row stays for history)
  //   - ApiKey → SetNull (createdById nulled, key row stays)
  //   - Task.assignee → SetNull (assigneeId nulled, task stays)
  //   - Task.creator → Restrict (guarded above — we'd have returned 400)
  //   - Notification → Cascade (notifications die with the user)
  await db.user.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
