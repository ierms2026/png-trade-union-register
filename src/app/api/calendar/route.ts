import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { getUnionScope } from "@/lib/auth/union-scope";

// =============================================================================
// GET /api/calendar?tab=all|documents|tasks|compliance&month=YYYY-MM
// -----------------------------------------------------------------------------
// Aggregates events from Tasks + Documents (+ compliance issues for the
// compliance tab) for a given month. Available to ALL authenticated roles.
//
// TABS:
//   - all:         tasks + documents + compliance issues (combined)
//   - documents:   document version uploads (uploadedAt)
//   - tasks:       task due dates (dueDate)
//   - compliance:  documents with EXPIRING or OVERDUE status
//
// RESPONSE SHAPE:
//   {
//     events: [
//       { date: "YYYY-MM-DD", type: "task"|"document"|"compliance",
//         title, id, meta?: {...} },
//       ...
//     ]
//   }
//
// MONTH FILTER:
//   `month` is "YYYY-MM" (e.g. "2026-08"). We compute the month's start
//   and end dates and filter events to that range.
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") || "all";
  const monthStr = url.searchParams.get("month");

  // Default to current month if not provided.
  const now = new Date();
  const year = monthStr ? parseInt(monthStr.slice(0, 4), 10) : now.getFullYear();
  const month = monthStr ? parseInt(monthStr.slice(5, 7), 10) - 1 : now.getMonth();

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

   
  const scope = getUnionScope({ role: user.role, assignedUnionId: user.assignedUnionId });
  if (scope.kind === "none") {
    return NextResponse.json({ error: "Forbidden: your account is not assigned to a union." }, { status: 403 });
  }
  const events: any[] = [];

  // --- Tasks (due dates) --------------------------------------------------
  if (tab === "all" || tab === "tasks") {
    const taskWhere = {
      dueDate: { gte: monthStart, lte: monthEnd },
      ...(scope.kind === "union"
        ? {
            OR: [
              { unionId: scope.unionId },
              { assigneeId: user.id },
            ],
          }
        : {}),
    };
    const tasks = await db.task.findMany({
      where: taskWhere,
      select: { id: true, title: true, dueDate: true, status: true },
    });
    for (const t of tasks) {
      if (!t.dueDate) continue;
      events.push({
        date: t.dueDate.toISOString().slice(0, 10),
        type: "task",
        title: t.title,
        id: t.id,
        meta: { status: t.status },
      });
    }
  }

  // --- Documents (version uploads) ----------------------------------------
  if (tab === "all" || tab === "documents") {
    const versions = await db.documentVersion.findMany({
      where: { uploadedAt: { gte: monthStart, lte: monthEnd } },
      select: {
        id: true,
        fileName: true,
        uploadedAt: true,
        versionNumber: true,
        document: {
          select: {
            documentType: true,
            unionId: true,
            union: { select: { unionName: true } },
          },
        },
      },
    });
    for (const v of versions) {
      // Officer scoping
      if (scope.kind === "union" && v.document.unionId !== scope.unionId) {
        continue;
      }
      events.push({
        date: v.uploadedAt.toISOString().slice(0, 10),
        type: "document",
        title: `${v.document.documentType} v${v.versionNumber}`,
        id: v.id,
        meta: {
          unionName: v.document.union.unionName,
          fileName: v.fileName,
        },
      });
    }
  }

  // --- Compliance issues (EXPIRING + OVERDUE) -----------------------------
  if (tab === "all" || tab === "compliance") {
    const data = await fetchMatrixData();
    if (scope.kind === "union") {
      data.unions = data.unions.filter((u) => u.id === scope.unionId);
    }
    const matrix = buildComplianceMatrix(data);
    for (const row of matrix.unions) {
      for (const cell of row.scores) {
        if (cell.status === "EXPIRING" || cell.status === "OVERDUE") {
          if (!cell.expiresAt) continue;
          const expiresAt = new Date(cell.expiresAt);
          if (expiresAt < monthStart || expiresAt > monthEnd) continue;
          events.push({
            date: expiresAt.toISOString().slice(0, 10),
            type: "compliance",
            title: `${row.unionName} — ${cell.documentType}`,
            id: cell.documentId ?? row.unionId,
            meta: { status: cell.status, unionName: row.unionName },
          });
        }
      }
    }
  }

  // Sort by date ascending.
  events.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ events });
}
