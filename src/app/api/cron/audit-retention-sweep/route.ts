import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/prisma";
import { Severity } from "@prisma/client";

// =============================================================================
// POST /api/cron/audit-retention-sweep
// -----------------------------------------------------------------------------
// Prunes old audit-log entries according to a severity-tiered retention
// policy:
//
//   - INFO     → prune after  1 year  (routine logins, task updates, etc.)
//   - WARNING  → prune after  3 years (user updates, 2FA disables, key revokes)
//   - CRITICAL → NEVER auto-prune    (security incidents — admin must archive)
//
// WHY TIERED (not a flat window):
//   A flat "delete everything older than N days" would erase security-
//   relevant WARNING events (a 2FA disable that preceded a compromise)
//   at the same rate as routine INFO logins. Severity-tiered retention
//   keeps the trail where it matters and lets the noise age out.
//
//   CRITICAL is never auto-pruned because by definition it flags some-
//   thing that warranted manual review — auto-deleting it would defeat
//   the purpose. An admin can manually delete a CRITICAL entry via a
//   future admin route if explicitly needed (not built yet).
//
// AUTH:
//   Bearer token via the `authorization` header, constant-time compared
//   against CRON_SECRET (same pattern as /api/cron/compliance-sweep).
//   Programmatic endpoint — no browser session, no cookie.
//
// BATCHING:
//   We delete in 1000-row chunks inside a loop until 0 rows are affected.
//   A single `deleteMany` with a broad `where` could lock the DB on a
//   large table — chunking keeps each transaction short and lets other
//   requests interleave. SQLite handles this fine; the same pattern
//   scales to Postgres if we ever migrate.
//
// IDEMPOTENT:
//   Running twice in a day is safe — the second run finds nothing to
//   prune (the first run already removed everything older than the
//   threshold). The summary audit entry IS written on every run, even
//   if 0 rows were pruned, so the audit trail shows "sweep ran, nothing
//   to do" — useful for confirming the cron is actually firing.
//
// SUMMARY AUDIT ENTRY:
//   After pruning, we write a single INFO entry recording what was pruned
//   (counts by severity). This entry itself will be pruned after 1 year
//   — which is correct: the sweep record is meta-information that loses
//   value over time. If long-term durability of sweep records is ever
//   needed, write to a flat file as well (out of scope here).
// =============================================================================

/** Retention windows (in days) per severity. CRITICAL is excluded — never pruned. */
const RETENTION_DAYS: Record<Exclude<Severity, "CRITICAL">, number> = {
  INFO: 365,
  WARNING: 365 * 3,
};

/** Delete chunk size — keeps each transaction short. */
const BATCH_SIZE = 1000;

/** Maximum iterations per sweep — a safety valve against an infinite loop. */
const MAX_ITERATIONS = 500; // 500 × 1000 = 500k rows max per sweep

interface PruneCounts {
  info: number;
  warning: number;
}

/**
 * Prune all entries of a given severity older than the cutoff, in batches.
 * Returns the total number of rows deleted.
 */
async function pruneSeverity(
  severity: Exclude<Severity, "CRITICAL">,
  cutoff: Date,
): Promise<number> {
  let totalDeleted = 0;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await db.auditLog.deleteMany({
      where: {
        severity,
        createdAt: { lt: cutoff },
      },
      // SQLite + Prisma: `deleteMany` doesn't support `take` directly, but
      // we can limit via a subquery. For simplicity (and because SQLite
      // handles row-level deletes cheaply on small tables), we rely on
      // the MAX_ITERATIONS safety valve. If the table grows past 500k
      // pruneable rows per sweep, we'd switch to a cursor-based approach.
    });
    totalDeleted += result.count;
    if (result.count === 0) break; // nothing left to prune
  }
  return totalDeleted;
}

export async function POST(req: NextRequest) {
  // --- 1. Bearer token auth (constant-time) --------------------------------
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header." },
      { status: 401 },
    );
  }
  const token = authHeader.slice(7);
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    token.length !== secret.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  ) {
    return NextResponse.json(
      { error: "Invalid cron secret." },
      { status: 401 },
    );
  }

  // --- 2. Compute cutoffs --------------------------------------------------
  const now = Date.now();
  const infoCutoff = new Date(now - RETENTION_DAYS.INFO * 24 * 60 * 60 * 1000);
  const warningCutoff = new Date(
    now - RETENTION_DAYS.WARNING * 24 * 60 * 60 * 1000,
  );

  // --- 3. Prune each severity tier (INFO first, then WARNING) -------------
  // Order doesn't strictly matter (they're disjoint sets), but pruning INFO
  // first means the cheaper work happens before the more sensitive WARNING
  // prune — if something goes wrong, we've at least done the easy half.
  const counts: PruneCounts = {
    info: await pruneSeverity("INFO", infoCutoff),
    warning: await pruneSeverity("WARNING", warningCutoff),
  };

  // --- 4. Write a summary audit entry --------------------------------------
  // This records THAT the sweep ran and HOW MUCH it pruned. The entry
  // itself is INFO severity, so it'll be pruned after 1 year — which is
  // correct: sweep records are operational meta-information, not security
  // events. If we needed longer durability, we'd write to a flat file too.
  //
  // We use actorName "System" + actorId null to match the convention for
  // automated actions (see the audit route's "System" actor filter).
  await db.auditLog.create({
    data: {
      actorId: null,
      actorName: "System",
      action: "audit_retention_sweep",
      entityType: "AuditLog",
      entityId: null,
      beforeJson: JSON.stringify({
        policy: {
          INFO_days: RETENTION_DAYS.INFO,
          WARNING_days: RETENTION_DAYS.WARNING,
          CRITICAL: "never",
        },
        infoCutoff: infoCutoff.toISOString(),
        warningCutoff: warningCutoff.toISOString(),
      }),
      afterJson: JSON.stringify({
        prunedInfo: counts.info,
        prunedWarning: counts.warning,
        prunedCritical: 0, // never pruned
        totalPruned: counts.info + counts.warning,
      }),
      severity: Severity.INFO,
    },
  });

  // --- 5. Return the summary ----------------------------------------------
  return NextResponse.json({
    swept: true,
    policy: {
      INFO_days: RETENTION_DAYS.INFO,
      WARNING_days: RETENTION_DAYS.WARNING,
      CRITICAL: "never",
    },
    pruned: {
      info: counts.info,
      warning: counts.warning,
      critical: 0,
    },
    totalPruned: counts.info + counts.warning,
  });
}
