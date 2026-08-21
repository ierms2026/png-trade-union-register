import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";

// =============================================================================
// GET /api/audit
// -----------------------------------------------------------------------------
// Paginated, filterable audit log. REGISTRAR + INSPECTOR only (Officers
// don't have audit access — they're scoped to a single union and
// shouldn't see system-wide activity).
//
// FILTERS (all optional, query params):
//   - entityType: string (e.g., "User", "Union", "ComplianceRule")
//   - action:     string (e.g., "user_create", "union_update")
//   - actor:      string — matches actorName (substring) OR "System"
//                 (which we interpret as actorId=null AND actorName="System")
//   - startDate:  ISO date — entries created on or after this date
//   - endDate:    ISO date — entries created on or before this date
//   - page:       integer ≥ 1 (default 1)
//   - limit:      integer 1-100 (default 20)
//
// RESPONSE SHAPE:
//   {
//     entries: [...],  // includes beforeJson + afterJson for the diff view
//     total: number,   // total matching rows (for pagination UI)
//     page: number,
//     limit: number
//   }
// =============================================================================

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== Role.REGISTRAR && user.role !== Role.INSPECTOR) {
    return NextResponse.json(
      { error: "Only Registrars and Inspectors can view the audit log." },
      { status: 403 },
    );
  }

  // --- 1. Parse + validate query params ----------------------------------
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType")?.trim() || undefined;
  const action = url.searchParams.get("action")?.trim() || undefined;
  const actor = url.searchParams.get("actor")?.trim() || undefined;
  const startDateStr = url.searchParams.get("startDate") || undefined;
  const endDateStr = url.searchParams.get("endDate") || undefined;
  const pageStr = url.searchParams.get("page") || "1";
  const limitStr = url.searchParams.get("limit") || String(DEFAULT_LIMIT);

  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(limitStr, 10) || DEFAULT_LIMIT),
  );

  // --- 2. Build the Prisma `where` clause --------------------------------
   
  const where: any = {};

  if (entityType) where.entityType = entityType;
  if (action) where.action = action;

  // "System" actor = actorId=null AND actorName="System". Any other
  // actor value is a substring match on actorName.
  if (actor) {
    if (actor.toLowerCase() === "system") {
      where.AND = [
        { actorId: null },
        { actorName: "System" },
      ];
    } else {
      where.actorName = { contains: actor };
    }
  }

  // Date range. SQLite stores DateTime as ISO strings, so we can
  // compare with gte/lte on ISO strings.
  if (startDateStr || endDateStr) {
    where.createdAt = {};
    if (startDateStr) {
      const d = new Date(startDateStr);
      if (!isNaN(d.getTime())) where.createdAt.gte = d;
    }
    if (endDateStr) {
      const d = new Date(endDateStr);
      if (!isNaN(d.getTime())) where.createdAt.lte = d;
    }
  }

  // --- 3. Run the query + count in parallel ------------------------------
  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        actorId: true,
        actorName: true,
        action: true,
        entityType: true,
        entityId: true,
        beforeJson: true,
        afterJson: true,
        severity: true,
        createdAt: true,
      },
    }),
    db.auditLog.count({ where }),
  ]);

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
