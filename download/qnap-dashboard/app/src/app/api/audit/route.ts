import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";

export const runtime = "nodejs"; // Required: uses Prisma (Node.js-only)

// =============================================================================
// GET /api/audit
// -----------------------------------------------------------------------------
// Paginated, filterable audit log endpoint. Powers the Audit view.
//
// QUERY PARAMS:
//   entityType, action, actor (actor name substring), startDate, endDate
//   page (1-based, default 1), limit (default 20)
//
// RESPONSE:
//   { entries: AuditEntry[], total: number, page: number, limit: number }
//
// AUTH: REGISTRAR + INSPECTOR only (Officers can't view the audit log).
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role === "OFFICER") {
    return NextResponse.json(
      { error: "Audit log access requires Registrar or Inspector role." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType") || undefined;
  const action = url.searchParams.get("action") || undefined;
  const actor = url.searchParams.get("actor") || undefined;
  const startDate = url.searchParams.get("startDate") || undefined;
  const endDate = url.searchParams.get("endDate") || undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

  // Build the where clause from filters
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
