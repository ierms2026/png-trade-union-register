import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, TaskStatus, Severity } from "@prisma/client";

// =============================================================================
// PATCH /api/tasks/[id]  |  DELETE /api/tasks/[id]
// -----------------------------------------------------------------------------
// PATCH:
//   - Status cycle: PENDING → IN_PROGRESS → COMPLETED (forward only in
//     the UI's click-to-cycle, but PATCH accepts any valid status).
//   - Field updates: title, description, priority, dueDate, unionId,
//     assigneeId. Officers can only update tasks they own or that are
//     in their union, and can't reassign to other users.
//   - Officers CANNOT change unionId (their tasks stay in their union).
//
// DELETE:
//   - Officers can only delete their OWN tasks (createdById = self).
//   - Registrars can delete any task.
//
// AUTH:
//   REGISTRAR + OFFICER (Inspectors 403).
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
  if (user.role === Role.INSPECTOR) {
    return NextResponse.json(
      { error: "Inspectors don't have access to tasks." },
      { status: 403 },
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

  // Officer scoping: can only update tasks in their union OR assigned to them.
  if (user.role === Role.OFFICER) {
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

   
  const updateData: any = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return NextResponse.json(
        { error: "Field 'title' must be a non-empty string." },
        { status: 400 },
      );
    }
    updateData.title = body.title.trim();
  }
  if (body.description !== undefined) {
    updateData.description =
      typeof body.description === "string" ? body.description.trim() : null;
  }
  if (body.priority !== undefined) {
    if (typeof body.priority !== "string" || body.priority.trim().length === 0) {
      return NextResponse.json(
        { error: "Field 'priority' must be a non-empty string." },
        { status: 400 },
      );
    }
    updateData.priority = body.priority.trim();
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate === null) {
      updateData.dueDate = null;
    } else if (typeof body.dueDate === "string") {
      const d = new Date(body.dueDate);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Field 'dueDate' must be a valid ISO date." },
          { status: 400 },
        );
      }
      updateData.dueDate = d;
    }
  }
  if (body.status !== undefined) {
    if (
      typeof body.status !== "string" ||
      !VALID_STATUSES.includes(body.status as TaskStatus)
    ) {
      return NextResponse.json(
        { error: `Field 'status' must be one of: ${VALID_STATUSES.join(", ")}.` },
        { status: 400 },
      );
    }
    updateData.status = body.status as TaskStatus;
  }

  // Union assignment — Officers can't change this.
  if (body.unionId !== undefined) {
    if (user.role === Role.OFFICER) {
      return NextResponse.json(
        { error: "Officers cannot change a task's union." },
        { status: 403 },
      );
    }
    if (body.unionId === null) {
      updateData.unionId = null;
    } else if (typeof body.unionId === "string") {
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
      updateData.unionId = body.unionId;
    }
  }

  // Assignee — Officers can only set to self or null.
  if (body.assigneeId !== undefined) {
    if (user.role === Role.OFFICER) {
      if (body.assigneeId !== null && body.assigneeId !== user.id) {
        return NextResponse.json(
          { error: "Officers can only assign tasks to themselves." },
          { status: 403 },
        );
      }
      updateData.assigneeId = body.assigneeId;
    } else {
      if (body.assigneeId === null) {
        updateData.assigneeId = null;
      } else if (typeof body.assigneeId === "string") {
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
        updateData.assigneeId = body.assigneeId;
      }
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "Request body must include at least one updatable field." },
      { status: 400 },
    );
  }

  const updated = await db.task.update({
    where: { id },
    data: updateData,
    include: {
      union: { select: { unionName: true, registrationNo: true } },
      assignee: { select: { email: true } },
    },
  });

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "task_update",
      entityType: "Task",
      entityId: id,
      beforeJson: JSON.stringify({
        title: existing.title,
        status: existing.status,
        priority: existing.priority,
        unionId: existing.unionId,
        assigneeId: existing.assigneeId,
      }),
      afterJson: JSON.stringify({
        title: updated.title,
        status: updated.status,
        priority: updated.priority,
        unionId: updated.unionId,
        assigneeId: updated.assigneeId,
      }),
      severity: Severity.INFO,
    },
  });

  const serialized = {
    ...updated,
    dueDate: updated.dueDate?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };

  return NextResponse.json({ task: serialized });
}

// -----------------------------------------------------------------------------
// DELETE
// -----------------------------------------------------------------------------

export async function DELETE(
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
  if (user.role === Role.INSPECTOR) {
    return NextResponse.json(
      { error: "Inspectors don't have access to tasks." },
      { status: 403 },
    );
  }

  const existing = await db.task.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Task not found." },
      { status: 404 },
    );
  }

  // Officers can only delete their OWN tasks.
  if (user.role === Role.OFFICER && existing.createdById !== user.id) {
    return NextResponse.json(
      { error: "Officers can only delete tasks they created." },
      { status: 403 },
    );
  }

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "task_delete",
      entityType: "Task",
      entityId: id,
      beforeJson: JSON.stringify({
        title: existing.title,
        status: existing.status,
        unionId: existing.unionId,
      }),
      severity: Severity.INFO,
    },
  });

  await db.task.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
