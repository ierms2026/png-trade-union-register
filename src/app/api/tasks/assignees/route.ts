import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";

// =============================================================================
// GET /api/tasks/assignees
// -----------------------------------------------------------------------------
// Lists non-disabled users available for task assignment.
//
// Used by the task create dialog's "Assignee" dropdown. We return only
// the fields the dropdown needs (id + email), and we filter out disabled
// users (a disabled user can't log in to see the task).
//
// AUTH:
//   REGISTRAR only. Officers see the dropdown too but they can only
//   assign to themselves, so they don't need this endpoint (the frontend
//   hardcodes their own user as the only option). Inspectors don't have
//   task access at all.
// =============================================================================

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
      { error: "Only Registrars can view the assignee list." },
      { status: 403 },
    );
  }

  const users = await db.user.findMany({
    where: { disabled: false },
    select: { id: true, email: true, role: true },
    orderBy: { email: "asc" },
  });

  return NextResponse.json({ users });
}
