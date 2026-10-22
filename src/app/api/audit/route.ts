import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";

export const runtime = "nodejs";

// =============================================================================
// GET /api/audit
// -----------------------------------------------------------------------------
// Paginated, filterable audit log endpoint. Powers the Audit view + the
// Union Hub's "History" tab + the document-detail inline audit trail.
//
// QUERY PARAMS:
//   entityType, action, actor (actor name substring), startDate, endDate,
//   unionId (IA-2: filter to a specific union's audit entries),
//   entityId (Wave 2: filter to a specific entity, e.g. a document ID),
//   page (1-based, default 1), limit (default 20, max 100)
//
// RESPONSE:
//   { entries: AuditEntry[], total: number, page: number, limit: number }
//
// AUTH: REGISTRAR + INSPECTOR only (Officers can't view the audit log —
// the Union Hub's History tab is hidden for Officers).
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role === Role.OFFICER) {
    return NextResponse.json(
      { error: "Audit log access requires Registrar or Inspector role." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType") || undefined;
  const entityId = url.searchParams.get("entityId") || undefined;
  const action = url.searchParams.get("action") || undefined;
  const actor = url.searchParams.get("actor") || undefined;
  const startDate = url.searchParams.get("startDate") || undefined;
  const endDate = url.searchParams.get("endDate") || undefined;
  const unionId = url.searchParams.get("unionId") || undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

  // Build the where clause from filters
  const where: Record<string, unknown> = {};
  if (entityType) where.entityType = entityType;
  // Wave 2: entityId filter — used by the document-detail inline audit trail
  // to show only entries for THIS document (e.g. reviews, retention approvals).
  if (entityId) where.entityId = entityId;
  if (action) where.action = { contains: action , mode: "insensitive" };
  if (actor) where.actorName = { contains: actor , mode: "insensitive" };
  if (unionId) where.unionId = unionId;
  if (startDate || endDate) {
    const created: Record<string, Date> = {};
    if (startDate) created.gte = new Date(startDate);
    if (endDate) created.lte = new Date(endDate);
    where.createdAt = created;
  }

  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.auditLog.count({ where }),
  ]);

  // Serialize Date fields
  const serialized = entries.map((e) => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
  }));

  return NextResponse.json({
    entries: serialized,
    total,
    page,
    limit,
  });
}
