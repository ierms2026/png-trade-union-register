import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, TaskStatus, Severity } from "@prisma/client";

// =============================================================================
// GET /api/tasks  |  POST /api/tasks
// -----------------------------------------------------------------------------
// Task management for the productivity view.
//
// AUTH MATRIX:
//   - REGISTRAR: see all tasks, create tasks with any unionId/assigneeId.
//   - OFFICER:   see tasks where unionId = their union OR assigneeId = self.
//                On create, unionId is locked to their union, assigneeId
//                can only be self or null.
//   - INSPECTOR: 403 — Inspectors don't use the task system.
//
// GET RESPONSE:
//   { tasks: [...] }
//
// POST RESPONSE:
//   201 with the created task.
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
  if (user.role === Role.INSPECTOR) {
    return NextResponse.json(
      { error: "Inspectors don't have access to tasks." },
      { status: 403 },
    );
  }

  // Officer scoping: tasks where unionId = mine OR assigneeId = mine.
   
  const where: any =
    user.role === Role.OFFICER
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
// POST — create a task
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
  if (user.role === Role.INSPECTOR) {
    return NextResponse.json(
      { error: "Inspectors don't have access to tasks." },
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

  // Officer restrictions: unionId locked, assigneeId = self or null.
   
  const data: any = {
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
    data.assigneeId =
      body.assigneeId === user.id || body.assigneeId === null
        ? body.assigneeId
        : user.id;
    // Officers can't assign to someone else.
    if (body.assigneeId && body.assigneeId !== user.id) {
      return NextResponse.json(
        { error: "Officers can only assign tasks to themselves." },
        { status: 403 },
      );
    }
  } else {
    // Registrar: unionId optional (null for "general" tasks), assigneeId optional.
    if (typeof body.unionId === "string" && body.unionId.length > 0) {
      // Verify the union exists.
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

  const serialized = {
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };

  return NextResponse.json({ task: serialized }, { status: 201 });
}
