import { NextRequest, NextResponse } from "next/server";
import { staffLinkUrl } from "@/lib/dashboard/vocabulary";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity, NotificationType, Prisma } from "@prisma/client";
import { createNotification, getUserNotificationPrefs } from "@/lib/notifications";

// =============================================================================
// GET /api/tasks  |  POST /api/tasks
// -----------------------------------------------------------------------------
// Task management for the productivity view.
//
// AUTH MATRIX:
//   - REGISTRAR: see all tasks, create tasks with any unionId/assigneeId.
//   - INSPECTOR: see tasks assigned to them (assigneeId = self).
//                Cannot create tasks (read-only access — Inspectors receive
//                tasks from the Registrar, they don't create them).
//   - OFFICER:   see tasks where unionId = their union OR assigneeId = self.
//                On create, unionId is locked to their union, assigneeId
//                can only be self or null.
//
// NOTIFICATIONS:
//   When a task is assigned (POST with assigneeId, or PATCH changing
//   assigneeId), a TASK notification is created for the assignee so they
//   see a bell-icon alert. The dedupKey prevents duplicate notifications
//   if the same task is re-assigned to the same person.
// =============================================================================

// -----------------------------------------------------------------------------
// GET — list tasks (role-scoped)
// -----------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  // Role-based scoping:
  //   REGISTRAR     → all tasks
  //   INSPECTOR     → tasks assigned to them only (assigneeId = self)
  //   OFFICER       → tasks in their union OR assigned to them
  //   REPRESENTATIVE → tasks in their union (chunk 5 — read-only view
  //                   from the union self-service portal; reps don't get
  //                   tasks assigned to them personally)
  const isUnionScopedRole = user.role === Role.OFFICER;
  const where: Record<string, unknown> =
    user.role === Role.REGISTRAR
      ? {}
      : user.role === Role.INSPECTOR
        ? { assigneeId: user.id }
        : isUnionScopedRole
          ? {
              OR: [
                ...(user.assignedUnionId ? [{ unionId: user.assignedUnionId }] : []),
                { assigneeId: user.id },
              ],
            }
          : {};

  const tasks = await db.task.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      union: { select: { unionName: true, registrationNo: true } },
      assignee: { select: { email: true } },
      creator: { select: { email: true } },
    },
  });

  const serialized = tasks.map((t) => ({
    ...t,
    dueDate: t.dueDate?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  return NextResponse.json({ tasks: serialized });
}

// -----------------------------------------------------------------------------
// POST — create a task (REGISTRAR + OFFICER only; INSPECTOR is read-only)
// -----------------------------------------------------------------------------

interface CreateTaskBody {
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  dueDate?: unknown;
  unionId?: unknown;
  assigneeId?: unknown;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  // Inspectors are read-only — they can view tasks assigned to them but
  // cannot create tasks. Only Registrars and Officers can create tasks.
  if (user.role === Role.INSPECTOR) {
    return NextResponse.json(
      { error: "Inspectors have read-only access to tasks. Only Registrars can create tasks." },
      { status: 403 },
    );
  }

  let body: CreateTaskBody;
  try {
    body = (await req.json()) as CreateTaskBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  // title — required
  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return NextResponse.json(
      { error: "Field 'title' is required." },
      { status: 400 },
    );
  }

  const data: Prisma.TaskUncheckedCreateInput = {
    title: body.title.trim(),
    description:
      typeof body.description === "string" ? body.description.trim() : null,
    priority:
      typeof body.priority === "string" && body.priority.trim().length > 0
        ? body.priority.trim()
        : "NORMAL",
    createdById: user.id,
  };

  // dueDate — optional ISO date
  if (typeof body.dueDate === "string" && body.dueDate.length > 0) {
    const d = new Date(body.dueDate);
    if (!isNaN(d.getTime())) data.dueDate = d;
  }

  if (user.role === Role.OFFICER) {
    // unionId locked to their assigned union (or null if they have none).
    data.unionId = user.assignedUnionId;
    // assigneeId can only be self or null.
    if (body.assigneeId && body.assigneeId !== user.id) {
      return NextResponse.json(
        { error: "Officers can only assign tasks to themselves." },
        { status: 403 },
      );
    }
    data.assigneeId = body.assigneeId === user.id ? body.assigneeId : null;
  } else {
    // Registrar: unionId optional (null for "general" tasks), assigneeId optional.
    if (typeof body.unionId === "string" && body.unionId.length > 0) {
      const unionExists = await db.union.findUnique({
        where: { id: body.unionId },
        select: { id: true },
      });
      if (!unionExists) {
        return NextResponse.json(
          { error: "The specified unionId does not exist." },
          { status: 400 },
        );
      }
      data.unionId = body.unionId;
    } else {
      data.unionId = null;
    }

    if (typeof body.assigneeId === "string" && body.assigneeId.length > 0) {
      const assigneeExists = await db.user.findUnique({
        where: { id: body.assigneeId, disabled: false },
        select: { id: true },
      });
      if (!assigneeExists) {
        return NextResponse.json(
          { error: "The specified assigneeId does not match an active user." },
          { status: 400 },
        );
      }
      data.assigneeId = body.assigneeId;
    } else {
      data.assigneeId = null;
    }
  }

  const task = await db.task.create({ data });

  // Audit log
  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "task_create",
      entityType: "Task",
      entityId: task.id,
      afterJson: JSON.stringify({
        title: task.title,
        priority: task.priority,
        unionId: task.unionId,
        assigneeId: task.assigneeId,
      }),
      severity: Severity.INFO,
    },
  });

  // --- Notification on assignment ---
  // If the task is assigned to someone other than the creator, send a
  // bell-icon notification so the assignee discovers the task.
  if (task.assigneeId && task.assigneeId !== user.id) {
    const prefs = await getUserNotificationPrefs(task.assigneeId);
    if (prefs) {
      await createNotification({
        userId: task.assigneeId,
        userEmail: prefs.email,
        emailNotificationsEnabled: prefs.emailNotificationsEnabled,
        type: NotificationType.TASK,
        title: `New task assigned: ${task.title}`,
        body: `Assigned by ${user.email}. Priority: ${task.priority}.`,
        dedupKey: `task:assigned:${task.id}`,
        linkUrl: staffLinkUrl("tasks"),
      });
    }
  }

  const serialized = {
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };

  return NextResponse.json({ task: serialized }, { status: 201 });
}
