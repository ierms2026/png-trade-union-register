import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/prisma";
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
//   CRON_SECRET (set in .env) using a CONSTANT-TIME comparison
//   (timingSafeEqual) to prevent timing side-channels. This is a
//   programmatic endpoint — no browser session, no cookie.
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
  // --- 1. Bearer token auth (constant-time) --------------------------------
  // We use timingSafeEqual instead of plain `===` to prevent timing-side-
  // channel attacks where an attacker probes the secret byte-by-byte by
  // measuring response time. The lengths are compared first (timingSafeEqual
  // throws on length mismatch), and we return the same 401 for any failure
  // so the attacker can't distinguish "wrong length" from "right length,
  // wrong bytes."
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header." },
      { status: 401 },
    );
  }
  const token = authHeader.slice(7);
  const secret =
    process.env.CRON_SECRET ||
    (process.env.NODE_ENV !== "production"
      ? "dev-cron-secret-preview-only"
      : undefined);
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

  // --- 2. Compute the compliance matrix ----------------------------------
  const data = await fetchMatrixData();
  const matrix = buildComplianceMatrix(data);

  // --- 3. Build the list of compliance issues with tiered urgency -------
  type Tier = "T_180_DAYS" | "T_90_DAYS" | "T_30_DAYS" | "T_0_OVERDUE";
  interface Issue {
    unionId: string;
    unionName: string;
    documentType: string;
    tier: Tier;
    expiresAt: string | null;
    renewalYears: number;
    daysUntilExpiry: number | null;
  }
  const issues: Issue[] = [];
  const renewalByType = new Map(data.rules.map((r) => [r.documentType, r.renewalYears]));
  const nowMs = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  for (const row of matrix.unions) {
    for (const cell of row.scores) {
      if (!cell.expiresAt) continue;
      const renewalYears = renewalByType.get(cell.documentType) ?? 1;
      if (renewalYears >= 99) continue;
      const expiryMs = new Date(cell.expiresAt).getTime();
      const daysUntil = Math.floor((expiryMs - nowMs) / msPerDay);
      let tier: Tier | null = null;
      if (daysUntil < 0) tier = "T_0_OVERDUE";
      else if (daysUntil <= 30) tier = "T_30_DAYS";
      else if (daysUntil <= 90) tier = "T_90_DAYS";
      else if (daysUntil <= 180 && renewalYears >= 3) tier = "T_180_DAYS";
      if (tier) {
        issues.push({ unionId: row.unionId, unionName: row.unionName, documentType: cell.documentType, tier, expiresAt: cell.expiresAt, renewalYears, daysUntilExpiry: daysUntil });
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
    const recipients = [
      ...registrars.map((r) => ({ id: r.id, email: r.email })),
      ...(officerByUnion.get(issue.unionId)
        ? [{ id: officerByUnion.get(issue.unionId)!.id, email: officerByUnion.get(issue.unionId)!.email }]
        : []),
    ];
    const cycleLabel = `${issue.renewalYears}-year renewal cycle`;
    const expiryStr = issue.expiresAt
      ? new Date(issue.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
      : "soon";
    const daysLabel = issue.daysUntilExpiry !== null
      ? (issue.daysUntilExpiry < 0 ? `${Math.abs(issue.daysUntilExpiry)} day(s) past expiry` : `${issue.daysUntilExpiry} day(s) remaining`)
      : "";
    for (const recipient of recipients) {
      const dedupKey = `compliance:${recipient.id}:${issue.unionId}:${issue.documentType}:${issue.tier}`;
      let title: string;
      let body: string;
      switch (issue.tier) {
        case "T_180_DAYS":
          title = `${issue.unionName}: ${issue.documentType} — cyclical renewal approaching`;
          body = `The ${issue.documentType} for ${issue.unionName} will expire on ${expiryStr} (${daysLabel}). This document is on a ${cycleLabel}. Please prepare for upcoming cyclical renewal (e.g., schedule elections, renegotiate awards, or arrange secret ballots).`;
          break;
        case "T_90_DAYS":
          title = `${issue.unionName}: ${issue.documentType} expiring ${expiryStr}`;
          body = `The ${issue.documentType} for ${issue.unionName} will expire on ${expiryStr} (${daysLabel}). This document is on a ${cycleLabel}. Please arrange renewal before the expiry date to maintain compliance.`;
          break;
        case "T_30_DAYS":
          title = `URGENT: ${issue.unionName}: ${issue.documentType} expires in ${issue.daysUntilExpiry} days`;
          body = `URGENT RENEWAL WARNING: The ${issue.documentType} for ${issue.unionName} expires on ${expiryStr} (${daysLabel}). This document is on a ${cycleLabel}. Please arrange renewal IMMEDIATELY to avoid non-compliance.`;
          break;
        case "T_0_OVERDUE":
          title = `OVERDUE: ${issue.unionName}: ${issue.documentType} — Notice of Non-Compliance`;
          body = `The ${issue.documentType} for ${issue.unionName} is past its renewal date (${expiryStr}, ${daysLabel}) and is now OVERDUE. A Notice of Non-Compliance has been generated. This document is on a ${cycleLabel}. The Industrial Registrar has been notified to initiate enforcement protocols.`;
          break;
      }
      try {
        await db.notification.create({
          data: { userId: recipient.id, type: NotificationType.COMPLIANCE, title, body, dedupKey, linkUrl: `/compliance` },
        });
        notificationsCreated++;
      } catch { /* dedup */ }
    }
    // For OVERDUE issues, create a Non-Compliance task
    if (issue.tier === "T_0_OVERDUE" && registrars.length > 0) {
      const existingTask = await db.task.findFirst({ where: { title: { contains: `Non-Compliance: ${issue.documentType} — ${issue.unionName}` }, status: { in: ["PENDING", "IN_PROGRESS"] } } });
      if (!existingTask) {
        try {
          await db.task.create({
            data: {
              title: `Non-Compliance: ${issue.documentType} — ${issue.unionName}`,
              description: `The ${issue.documentType} for ${issue.unionName} is OVERDUE (expired ${expiryStr}). A Notice of Non-Compliance has been generated. Please initiate enforcement protocols per the Industrial Organizations Act 1962.`,
              status: "PENDING", priority: "HIGH", unionId: issue.unionId, createdById: registrars[0].id,
            },
          });
        } catch { /* task creation failure shouldn't block sweep */ }
      }
    }
    }
  }

  return NextResponse.json({
    swept: true,
    issuesFound: issues.length,
    notificationsCreated,
  });
}
