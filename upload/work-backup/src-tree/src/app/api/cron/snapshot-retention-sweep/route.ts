import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/prisma";
import { Severity } from "@prisma/client";
import {
  runSnapshotRetentionSweep,
  SNAPSHOT_RETENTION_DAYS,
} from "@/lib/dashboard/snapshot";

// =============================================================================
// POST /api/cron/snapshot-retention-sweep
// -----------------------------------------------------------------------------
// Chunk 4.3: Prune compliance snapshots older than SNAPSHOT_RETENTION_DAYS
// (365). Anything older is invisible to the trend chart (sliceTrendToWindow
// drops it), so keeping it just bloats the ComplianceSnapshot table.
//
// AUTH: Bearer token via CRON_SECRET (constant-time comparison). Same pattern
// as the sibling cron routes:
//   - /api/cron/compliance-sweep        (chunk 4)
//   - /api/cron/audit-retention-sweep   (chunk 9-a)
//   - /api/cron/compliance-snapshot     (chunk 4.2a)
//
// IDEMPOTENT: re-running finds nothing to prune. A summary audit entry is
// written on every run (even 0-prune runs) so the audit trail confirms the
// cron is firing.
//
// RECOMMENDED SCHEDULE: weekly (Sunday 2:30 AM — 30 minutes after the audit
// retention sweep). Daily would be excessive for pruning; weekly keeps the
// table tidy without unnecessary churn. See scripts/cron.sh.
//
// RESPONSE SHAPE:
//   {
//     swept: true,
//     policy: { retentionDays: 365 },
//     cutoff: "2025-09-25",
//     pruned: 42,
//   }
// =============================================================================

export async function POST(req: NextRequest) {
  // --- 1. Authenticate via CRON_SECRET (constant-time comparison) ---------
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header." },
      { status: 401 },
    );
  }
  const token = authHeader.slice(7);
  const secret = process.env.CRON_SECRET;
  // Length pre-check (timingSafeEqual throws on length mismatch) + constant-
  // time comparison. This closes the timing side-channel that a plain `!==`
  // comparison would create (short-circuits on the first non-matching byte).
  if (
    !secret ||
    token.length !== secret.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  ) {
    return NextResponse.json({ error: "Invalid cron secret." }, { status: 401 });
  }

  // --- 2. Run the sweep ---------------------------------------------------
  const result = await runSnapshotRetentionSweep(new Date());

  // --- 3. Write a summary audit entry -------------------------------------
  // Same pattern as audit-retention-sweep: the sweep itself records that it
  // ran, with the policy + counts. INFO severity — this is operational meta-
  // information, not a security event. (Per chunk 9-a's policy, INFO entries
  // age out after 365 days — appropriate for sweep records.)
  await db.auditLog.create({
    data: {
      actorId: null,
      actorName: "System",
      action: "snapshot_retention_sweep",
      entityType: "ComplianceSnapshot",
      entityId: null,
      beforeJson: JSON.stringify({
        policy: { retentionDays: SNAPSHOT_RETENTION_DAYS },
        cutoff: result.cutoff,
      }),
      afterJson: JSON.stringify({
        pruned: result.pruned,
      }),
      severity: Severity.INFO,
    },
  });

  // --- 4. Respond ---------------------------------------------------------
  return NextResponse.json({
    swept: true,
    policy: { retentionDays: SNAPSHOT_RETENTION_DAYS },
    cutoff: result.cutoff,
    pruned: result.pruned,
  });
}
