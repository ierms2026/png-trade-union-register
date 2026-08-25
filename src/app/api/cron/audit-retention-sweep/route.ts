import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/prisma";
import { Severity } from "@prisma/client";
import { RETENTION_DAYS, runRetentionSweep } from "@/lib/audit-retention";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing or invalid Authorization header." }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const secret = process.env.CRON_SECRET;
  if (!secret || token.length !== secret.length || !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
    return NextResponse.json({ error: "Invalid cron secret." }, { status: 401 });
  }

  const counts = await runRetentionSweep();

  await db.auditLog.create({
    data: {
      actorId: null,
      actorName: "System",
      action: "audit_retention_sweep",
      entityType: "AuditLog",
      entityId: null,
      beforeJson: JSON.stringify({
        policy: { INFO_days: RETENTION_DAYS.INFO, WARNING_days: RETENTION_DAYS.WARNING, CRITICAL: "never" },
        infoCutoff: counts.cutoffs.info.toISOString(),
        warningCutoff: counts.cutoffs.warning.toISOString(),
      }),
      afterJson: JSON.stringify({
        prunedInfo: counts.info,
        prunedWarning: counts.warning,
        prunedCritical: 0,
        totalPruned: counts.info + counts.warning,
      }),
      severity: Severity.INFO,
    },
  });

  return NextResponse.json({
    swept: true,
    policy: { INFO_days: RETENTION_DAYS.INFO, WARNING_days: RETENTION_DAYS.WARNING, CRITICAL: "never" },
    pruned: { info: counts.info, warning: counts.warning, critical: 0 },
    totalPruned: counts.info + counts.warning,
  });
}
