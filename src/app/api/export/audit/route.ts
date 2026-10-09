import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/prisma";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { toCsv, CSV_HEADERS } from "@/lib/csv";

// =============================================================================
// GET /api/export/audit — CSV export of audit log entries
// REGISTRAR/INSPECTOR: all entries. OFFICER: own actions only.
// Query params: entityType, action, actor, startDate, endDate (same filters
// as the Audit view)
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasScope(user, "audit:read")) return NextResponse.json({ error: "Your API key does not have the 'audit:read' scope." }, { status: 403 });

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType") || undefined;
  const action = url.searchParams.get("action") || undefined;
  const actor = url.searchParams.get("actor") || undefined;
  const startDate = url.searchParams.get("startDate") || undefined;
  const endDate = url.searchParams.get("endDate") || undefined;

  const where: Record<string, unknown> = {};
  if (entityType) where.entityType = entityType;
  if (action) where.action = { contains: action };
  if (actor) where.actorName = { contains: actor };
  if (startDate || endDate) {
    const created: Record<string, Date> = {};
    if (startDate) created.gte = new Date(startDate);
    if (endDate) created.lte = new Date(endDate);
    where.createdAt = created;
  }

  // Officer scoping: only their own actions
  if (user.role === Role.OFFICER) {
    where.actorId = user.id;
  }

  const entries = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000, // safety cap
  });

  const rows = entries.map((e) => ({
    "Date": e.createdAt.toISOString(),
    "Actor": e.actorName,
    "Action": e.action,
    "Entity Type": e.entityType,
    "Entity ID": e.entityId || "",
    "Severity": e.severity,
    "Before": e.beforeJson || "",
    "After": e.afterJson || "",
  }));

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      ...CSV_HEADERS,
      "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
