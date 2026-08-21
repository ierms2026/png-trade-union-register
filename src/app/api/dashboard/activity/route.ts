import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";

// =============================================================================
// GET /api/dashboard/activity
// -----------------------------------------------------------------------------
// Latest 20 audit log entries for the "Recent Activity" feed on the
// Dashboard. Available to ALL authenticated roles.
//
// RESPONSE SHAPE:
//   {
//     activity: [
//       {
//         id, actorName, action, entityType, severity, createdAt
//       },
//       ...
//     ]
//   }
//
// DELIBERATELY EXCLUDES beforeJson/afterJson:
//   - The dashboard feed is a quick glance at "what's happening" — the
//     full JSON diff is too verbose for a feed card and belongs in the
//     Audit Log view (which has expandable rows).
//   - Excluding the JSON blobs also keeps the response payload small
//     (the dashboard is the most-hit page).
// =============================================================================

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const entries = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      actorName: true,
      action: true,
      entityType: true,
      entityId: true,
      severity: true,
      createdAt: true,
    },
  });

  // Serialize the Date — NextResponse.json doesn't auto-serialize Date
  // objects (they become {} in the JSON output without this).
  const activity = entries.map((e) => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
  }));

  return NextResponse.json({ activity });
}
