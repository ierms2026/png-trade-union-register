import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, NotificationType } from "@prisma/client";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";

// =============================================================================
// POST /api/cron/compliance-sweep
// -----------------------------------------------------------------------------
// BJS-01: Daily compliance sweep. Generates notifications for users about
// EXPIRING and OVERDUE compliance issues.
//
// AUTH:
//   Bearer token via the `authorization` header. The token must match
//   CRON_SECRET (set in .env). This is a programmatic endpoint — no
//   browser session, no cookie.
//
//   The endpoint also enforces role-based notification routing:
//   - REGISTRAR + OFFICER receive compliance notifications.
//   - INSPECTOR is EXCLUDED (Inspectors don't act on compliance issues —
//     they just observe).
//
// IDEMPOTENCY (critical):
//   The dedupKey on the Notification table is unique. We build the key as:
//     `compliance:{userId}:{unionId}:{documentType}:{status}`
//   This means: for a given (user, union, docType, status) tuple, there's at
//   most ONE notification. Running the sweep twice in a day doesn't
//   create duplicate notifications — the second run's INSERTs hit the
//   unique constraint and are skipped.
//
//   userId is part of the key because the Notification table stores one row
//   per recipient — without userId, only the FIRST recipient would get the
//   notification; all others would be deduped against the first.
//
//   The status is part of the key because a doc can transition from
//   EXPIRING → OVERDUE, and those are DIFFERENT notifications (the
//   OVERDUE one is more urgent). Without status in the key, the OVERDUE
//   notification would be deduped against the EXPIRING one and never
//   sent.
//
// NOTIFICATION TARGETS:
//   For each compliance issue, we notify:
//   - The Officer assigned to that union (if any).
//   - ALL Registrars (they have system-wide oversight).
//   We do NOT notify Inspectors (per the spec).
// =============================================================================

export async function POST(req: NextRequest) {
  // --- 1. Bearer token auth ----------------------------------------------
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header." },
      { status: 401 },
    );
  }
  const token = authHeader.slice(7);
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Invalid cron secret." },
      { status: 401 },
    );
  }

  // --- 2. Compute the compliance matrix ----------------------------------
  const data = await fetchMatrixData();
  const matrix = buildComplianceMatrix(data);

  // --- 3. Build the list of compliance issues (EXPIRING + OVERDUE) -------
  interface Issue {
    unionId: string;
    unionName: string;
    documentType: string;
    status: "EXPIRING" | "OVERDUE";
    expiresAt: string | null;
  }
  const issues: Issue[] = [];
  for (const row of matrix.unions) {
    for (const cell of row.scores) {
      if (cell.status === "EXPIRING" || cell.status === "OVERDUE") {
        issues.push({
          unionId: row.unionId,
          unionName: row.unionName,
          documentType: cell.documentType,
          status: cell.status,
          expiresAt: cell.expiresAt,
        });
      }
    }
  }

  if (issues.length === 0) {
    return NextResponse.json({
      swept: true,
      issuesFound: 0,
      notificationsCreated: 0,
    });
  }

  // --- 4. Load notification recipients -----------------------------------
  // Registrars (all of them) + the Officer assigned to each affected union.
  // Inspectors are excluded.
  const registrars = await db.user.findMany({
    where: { role: Role.REGISTRAR, disabled: false },
    select: { id: true, email: true },
  });

  // Build a map of unionId → officer (for per-union officer notification).
  const officers = await db.user.findMany({
    where: { role: Role.OFFICER, disabled: false, assignedUnionId: { not: null } },
    select: { id: true, email: true, assignedUnionId: true },
  });
  const officerByUnion = new Map(
    officers.map((o) => [o.assignedUnionId, o]),
  );

  // --- 5. Generate notifications (idempotent via dedupKey) ---------------
  let notificationsCreated = 0;

  for (const issue of issues) {
    // The recipients for this issue:
    // - All Registrars
    // - The Officer assigned to this union (if any)
    const recipients = [
      ...registrars.map((r) => ({ id: r.id, email: r.email })),
      ...(officerByUnion.get(issue.unionId)
        ? [
            {
              id: officerByUnion.get(issue.unionId)!.id,
              email: officerByUnion.get(issue.unionId)!.email,
            },
          ]
        : []),
    ];

    for (const recipient of recipients) {
      // Include userId in the dedupKey so each recipient gets their own
      // notification row. The dedupKey is globally unique (per the schema),
      // so without userId here, the second recipient's insert would fail
      // the unique constraint. With userId, re-running the sweep is still
      // idempotent per-user: the same (user, union, docType, status) tuple
      // only ever produces one notification.
      const dedupKey = `compliance:${recipient.id}:${issue.unionId}:${issue.documentType}:${issue.status}`;
      const title =
        issue.status === "OVERDUE"
          ? `${issue.unionName}: ${issue.documentType} is OVERDUE`
          : `${issue.unionName}: ${issue.documentType} expiring soon`;
      const body =
        issue.status === "OVERDUE"
          ? `The ${issue.documentType} for ${issue.unionName} is past its renewal date and is now OVERDUE.`
          : `The ${issue.documentType} for ${issue.unionName} will expire within 90 days. Please arrange renewal.`;

      try {
        await db.notification.create({
          data: {
            userId: recipient.id,
            type: NotificationType.COMPLIANCE,
            title,
            body,
            dedupKey,
            linkUrl: `/compliance`,
          },
        });
        notificationsCreated++;
      } catch {
        // Unique constraint violation → notification already exists
        // (idempotent). Silently skip — this is the expected case on
        // re-runs of the sweep.
      }
    }
  }

  return NextResponse.json({
    swept: true,
    issuesFound: issues.length,
    notificationsCreated,
  });
}
