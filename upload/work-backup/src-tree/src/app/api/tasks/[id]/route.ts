import { NextRequest, NextResponse } from "next/server";
import { staffLinkUrl } from "@/lib/dashboard/vocabulary";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, TaskStatus, Severity, NotificationType } from "@prisma/client";
import { createNotification, getUserNotificationPrefs } from "@/lib/notifications";

// =============================================================================
// PATCH /api/tasks/[id]  |  DELETE /api/tasks/[id]
// -----------------------------------------------------------------------------
// PATCH:
//   - Status cycle: PENDING → IN_PROGRESS → COMPLETED.
//   - Field updates: title, description, priority, dueDate, unionId,
//     assigneeId.
//   - INSPECTOR: can only update status on tasks assigned to them
//     (assigneeId = self). Cannot change any other field.
//   - OFFICER: can update tasks in their union OR assigned to them.
//     Cannot change unionId or reassign to other users.
//   - REGISTRAR: full access to all fields on all tasks.
//
// DELETE:
//   - REGISTRAR: can delete any task.
//   - OFFICER: can only delete their OWN tasks (createdById = self).
//   - INSPECTOR: cannot delete tasks (403).
//
// NOTIFICATIONS:
//   When a task is reassigned (PATCH changing assigneeId to a different
//   user), a TASK notification is created for the new assignee.
// =============================================================================

const VALID_STATUSES: TaskStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED"];

// -----------------------------------------------------------------------------
// PATCH
// -----------------------------------------------------------------------------

interface PatchTaskBody {
  title?: unknown;
  description?: unknown;
  status?: unknown;
  priority?: unknown;
  dueDate?: unknown;
  unionId?: unknown;
  assigneeId?: unknown;
}

export async function PATCH(
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

  const existing = await db.task.findUnique({
    where: { id },
    include: {
      union: { select: { unionName: true } },
      assignee: { select: { email: true } },
    },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Task not found." },
      { status: 404 },
    );
  }

  // Role-based access control:
  //   INSPECTOR: can only update status on tasks assigned to them
  //   OFFICER:   can update tasks in their union OR assigned to them
  //   REGISTRAR: full access
  if (user.role === Role.INSPECTOR) {
    // Inspector can only touch tasks assigned to them
    if (existing.assigneeId !== user.id) {
      return NextResponse.json(
        { error: "You can only update tasks assigned to you." },
        { status: 403 },
      );
    }
  } else if (user.role === Role.OFFICER) {
    const owns =
      existing.assigneeId === user.id ||
      existing.unionId === user.assignedUnionId;
    if (!owns) {
      return NextResponse.json(
        { error: "You can only update tasks in your union or assigned to you." },
        { status: 403 },
      );
    }
  }

  let body: PatchTaskBody;
  try {
    body = (await req.json()) as PatchTaskBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const updateData: Record<string, unknown> = {};

  // --- Inspector restriction: status-only updates ---
  // Inspectors can ONLY change the status field. Any attempt to change
  // other fields (title, description, priority, dueDate, unionId,
  // assigneeId) is silently ignored — the task's content stays as the
  // Registrar set it.
  if (user.role === Role.INSPECTOR) {
    if (typeof body.status === "string" && VALID_STATUSES.includes(body.status as TaskStatus)) {
      updateData.status = body.status as TaskStatus;
    }
    // All other fields are ignored for Inspectors.
  } else {
    // Officer + Registrar: full field updates allowed (with Officer
    // restrictions on unionId + assigneeId below).
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length === 0) {
        return NextResponse.json({ error: "Field 'title' must be a non-empty string." }, { status: 400 });
      }
      updateData.title = body.title.trim();
    }
    if (body.description !== undefined) {
      updateData.description = typeof body.description === "string" ? body.description.trim() : null;
    }
    if (body.priority !== undefined) {
      if (typeof body.priority !== "string" || body.priority.trim().length === 0) {
        return NextResponse.json({ error: "Field 'priority' must be a non-empty string." }, { status: 400 });
      }
      updateData.priority = body.priority.trim();
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate === null) {
        updateData.dueDate = null;
      } else if (typeof body.dueDate === "string") {
        const d = new Date(body.dueDate);
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: "Field 'dueDate' must be a valid ISO date." }, { status: 400 });
        }
        updateData.dueDate = d;
      }
    }
    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !VALID_STATUSES.includes(body.status as TaskStatus)) {
        return NextResponse.json({ error: `Field 'status' must be one of: ${VALID_STATUSES.join(", ")}.` }, { status: 400 });
      }
      updateData.status = body.status as TaskStatus;
    }

    // Union assignment — Officers can't change this.
    if (body.unionId !== undefined) {
      if (user.role === Role.OFFICER) {
        return NextResponse.json({ error: "Officers cannot change a task's union." }, { status: 403 });
      }
      if (body.unionId === null) {
        updateData.unionId = null;
      } else if (typeof body.unionId === "string") {
        const unionExists = await db.union.findUnique({ where: { id: body.unionId }, select: { id: true } });
        if (!unionExists) {
          return NextResponse.json({ error: "The specified unionId does not exist." }, { status: 400 });
        }
        updateData.unionId = body.unionId;
      }
    }

    // Assignee — Officers can only set to self or null.
    if (body.assigneeId !== undefined) {
      if (user.role === Role.OFFICER) {
        if (body.assigneeId !== null && body.assigneeId !== user.id) {
          return NextResponse.json({ error: "Officers can only assign tasks to themselves." }, { status: 403 });
        }
        updateData.assigneeId = body.assigneeId;
      } else {
        if (body.assigneeId === null) {
          updateData.assigneeId = null;
        } else if (typeof body.assigneeId === "string") {
          const assigneeExists = await db.user.findUnique({ where: { id: body.assigneeId, disabled: false }, select: { id: true } });
          if (!assigneeExists) {
            return NextResponse.json({ error: "The specified assigneeId does not match an active user." }, { status: 400 });
          }
          updateData.assigneeId = body.assigneeId;
        }
      }
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "Request body must include at least one updatable field." }, { status: 400 });
  }

  const updated = await db.task.update({
    where: { id },
    data: updateData,
    include: {
      union: { select: { unionName: true, registrationNo: true } },
      assignee: { select: { email: true } },
    },
  });

  // Audit log
  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "task_update",
      entityType: "Task",
      entityId: id,
      beforeJson: JSON.stringify({
        title: existing.title, status: existing.status, priority: existing.priority,
        unionId: existing.unionId, assigneeId: existing.assigneeId,
      }),
      afterJson: JSON.stringify({
        title: updated.title, status: updated.status, priority: updated.priority,
        unionId: updated.unionId, assigneeId: updated.assigneeId,
      }),
      severity: Severity.INFO,
    },
  });

  // --- Notification on reassignment ---
  // If the assignee changed AND the new assignee isn't the current user,
  // notify the new assignee.
  if (
    updated.assigneeId &&
    updated.assigneeId !== existing.assigneeId &&
    updated.assigneeId !== user.id
  ) {
    const prefs = await getUserNotificationPrefs(updated.assigneeId);
    if (prefs) {
      await createNotification({
        userId: updated.assigneeId,
        userEmail: prefs.email,
        emailNotificationsEnabled: prefs.emailNotificationsEnabled,
        type: NotificationType.TASK,
        title: `Task assigned to you: ${updated.title}`,
        body: `Assigned by ${user.email}. Priority: ${updated.priority}.`,
        dedupKey: `task:assigned:${updated.id}:${updated.assigneeId}`,
        linkUrl: staffLinkUrl("tasks"),
      });
    }
  }

  const serialized = {
    ...updated,
    dueDate: updated.dueDate?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };

  return NextResponse.json({ task: serialized });
}

// -----------------------------------------------------------------------------
// DELETE — REGISTRAR + OFFICER only (Inspectors cannot delete)
// -----------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  // Inspectors cannot delete tasks — they have read + status-update access only.
  if (user.role === Role.INSPECTOR) {
    return NextResponse.json({ error: "Inspectors cannot delete tasks." }, { status: 403 });
  }

  const existing = await db.task.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  // Officers can only delete their OWN tasks.
  if (user.role === Role.OFFICER && existing.createdById !== user.id) {
    return NextResponse.json({ error: "Officers can only delete tasks they created." }, { status: 403 });
  }

  await db.auditLog.create({
    data: {
      actorId: user.id, actorName: user.email, action: "task_delete",
      entityType: "Task", entityId: id,
      beforeJson: JSON.stringify({ title: existing.title, status: existing.status, unionId: existing.unionId }),
      severity: Severity.INFO,
    },
  });

  await db.task.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
