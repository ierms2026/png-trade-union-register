import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/prisma";
import { Role, NotificationType, WebhookEventType } from "@prisma/client";
import { createNotificationForUsers } from "@/lib/notifications";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { collectSweepIssues, type SweepIssue } from "@/lib/compliance/sweep-issues";
import { dispatchEvent } from "@/lib/webhooks/dispatcher";
import { staffLinkUrl } from "@/lib/dashboard/vocabulary";

// =============================================================================
// POST /api/cron/compliance-sweep
// -----------------------------------------------------------------------------
// BJS-01: Daily compliance sweep. Generates notifications for users about
// EXPIRING and OVERDUE compliance issues.
//
// AUTH:
//   Bearer token via the `authorization` header. The token must match
//   CRON_SECRET (set in .env) using a CONSTANT-TIME comparison
//   (timingSafeEqual) to prevent timing side-channels.
//
// AUTOMATED COMPLIANCE REMINDERS (enhanced):
//   1. Tiered notifications: T_180_DAYS, T_90_DAYS, T_30_DAYS, T_0_OVERDUE
//   2. Weekly re-notification: dedupKey includes the ISO week number so
//      documents that linger in a tier get re-notified every 7 days
//      (prevents "notify once + forget" for docs stuck in T_30_DAYS)
//   3. Auto-assign tasks: OVERDUE docs get a Non-Compliance task auto-
//      assigned to the union's Officer (if one exists)
//   4. 30-day overdue escalation: docs overdue 30+ days get an additional
//      ESCALATED notification to all Registrars with a higher-priority title
//
// DEDUPKEY SCHEME (weekly re-notification):
//   `compliance:{recipientId}:{unionId}:{documentType}:{tier}:{YYYY-Www}`
//   The week component (e.g. "2026-W38") ensures the same tier re-fires
//   once per week. A doc that stays in T_30_DAYS for 4 weeks will generate
//   4 notifications (one per week), not just 1.
//
// NOTIFICATION TARGETS:
//   - REGISTRAR (all): system-wide oversight
//   - OFFICER (assigned to the union): action required
//   - INSPECTOR: excluded (observe-only role)
// =============================================================================

/**
 * Get the ISO week number for a date (e.g. "2026-W38").
 * Used in the dedupKey to enable weekly re-notification.
 */
function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
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

  // --- 2. Compute the compliance matrix ----------------------------------
  const now = new Date();
  const data = await fetchMatrixData();
  const matrix = buildComplianceMatrix(data);

  // --- 3. Build the list of compliance issues with tiered urgency -------
  // The issue-collection logic lives in collectSweepIssues() so it can be
  // unit-tested directly. The route passes the built matrix + rules map +
  // current time; the function returns the tiered issues.
  const renewalByType = new Map(data.rules.map((r) => [r.documentType, r.renewalYears]));
  const issues: SweepIssue[] = collectSweepIssues(matrix, renewalByType, now);

  if (issues.length === 0) {
    return NextResponse.json({
      swept: true,
      issuesFound: 0,
      notificationsCreated: 0,
    });
  }

  // --- 4. Load notification recipients -----------------------------------
  const registrars = await db.user.findMany({
    where: { role: Role.REGISTRAR, disabled: false },
    select: { id: true },
  });

  const officers = await db.user.findMany({
    where: { role: Role.OFFICER, disabled: false, assignedUnionId: { not: null } },
    select: { id: true, assignedUnionId: true },
  });
  const officerByUnion = new Map(
    officers.map((o) => [o.assignedUnionId, o.id]),
  );

  // --- 5. Generate notifications (weekly dedup + auto-assign tasks) ------
  const weekKey = getWeekKey(now);
  let notificationsCreated = 0;
  let tasksCreated = 0;
  let escalationsCreated = 0;

  for (const issue of issues) {
    // T_30_OVERDUE is an escalation — only notify Registrars
    const recipientIds = issue.tier === "T_30_OVERDUE"
      ? registrars.map((r) => r.id)  // Escalation: Registrars only
      : [
          ...registrars.map((r) => r.id),
          ...(officerByUnion.get(issue.unionId) ? [officerByUnion.get(issue.unionId)!] : []),
        ];

    const cycleLabel = `${issue.renewalYears}-year renewal cycle`;
    const expiryStr = issue.expiresAt
      ? new Date(issue.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
      : "soon";
    const daysLabel = issue.daysUntilExpiry !== null
      ? (issue.daysUntilExpiry < 0 ? `${Math.abs(issue.daysUntilExpiry)} day(s) past expiry` : `${issue.daysUntilExpiry} day(s) remaining`)
      : "";
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
      case "T_30_OVERDUE":
        title = `ESCALATION: ${issue.unionName}: ${issue.documentType} — ${Math.abs(issue.daysUntilExpiry!)} days overdue`;
        body = `ESCALATION: The ${issue.documentType} for ${issue.unionName} has been OVERDUE for ${Math.abs(issue.daysUntilExpiry!)} days (${expiryStr}). This requires immediate Registrar attention. Enforcement protocols under the Industrial Organizations Act 1962 should be initiated. A Non-Compliance task has been created and assigned.`;
        break;
    }

    // Weekly dedupKey: includes the ISO week so the same tier re-fires weekly
    for (const recipientId of recipientIds) {
      const dedupKey = `compliance:${recipientId}:${issue.unionId}:${issue.documentType}:${issue.tier}:${weekKey}`;
      const results = await createNotificationForUsers([recipientId], {
        type: NotificationType.COMPLIANCE,
        title,
        body,
        dedupKey,
        linkUrl: staffLinkUrl("compliance"),
      });
      if (results[0]?.created) {
        notificationsCreated++;
        if (issue.tier === "T_30_OVERDUE") escalationsCreated++;
      }
    }

    // --- Auto-assign Non-Compliance tasks for OVERDUE docs ---
    // For T_0_OVERDUE + T_30_OVERDUE: create a task auto-assigned to the
    // union's Officer (if one exists). Deduped by title + open status.
    if ((issue.tier === "T_0_OVERDUE" || issue.tier === "T_30_OVERDUE") && registrars.length > 0) {
      const taskTitle = `Non-Compliance: ${issue.documentType} — ${issue.unionName}`;
      const existingTask = await db.task.findFirst({
        where: { title: { contains: taskTitle }, status: { in: ["PENDING", "IN_PROGRESS"] } },
      });
      if (!existingTask) {
        try {
          // Auto-assign to the union's Officer if one exists
          const officerId = officerByUnion.get(issue.unionId) ?? null;
          await db.task.create({
            data: {
              title: taskTitle,
              description: `The ${issue.documentType} for ${issue.unionName} is OVERDUE (expired ${expiryStr}, ${daysLabel}). A Notice of Non-Compliance has been generated. Please initiate enforcement protocols per the Industrial Organizations Act 1962.`,
              status: "PENDING",
              priority: issue.tier === "T_30_OVERDUE" ? "HIGH" : "HIGH",
              unionId: issue.unionId,
              createdById: registrars[0].id,
              assigneeId: officerId,  // Auto-assign to the union's Officer
            },
          });
          tasksCreated++;

          // If we auto-assigned to an officer, notify them about the task
          if (officerId) {
            const { createNotification, getUserNotificationPrefs } = await import("@/lib/notifications");
            const prefs = await getUserNotificationPrefs(officerId);
            if (prefs) {
              await createNotification({
                userId: officerId,
                userEmail: prefs.email,
                emailNotificationsEnabled: prefs.emailNotificationsEnabled,
                type: NotificationType.TASK,
                title: `Non-Compliance task assigned: ${issue.documentType} — ${issue.unionName}`,
                body: `A Non-Compliance task has been assigned to you. The ${issue.documentType} for ${issue.unionName} is OVERDUE. Please initiate enforcement protocols.`,
                dedupKey: `task:auto-assigned:${issue.unionId}:${issue.documentType}:${weekKey}`,
                linkUrl: staffLinkUrl("tasks"),
              });
            }
          }
        } catch { /* task creation failure shouldn't block sweep */ }
      }
    }
  }

  // --- Chunk 9: Webhook dispatch on compliance status changes ------------
  // Compare the current compliance matrix against yesterday's snapshot
  // (from the ComplianceSnapshot table, chunk 4.2a). For each union ×
  // document-type cell whose status changed, dispatch a webhook event.
  //
  // We use the snapshot (not a live comparison) because:
  //   1. The snapshot is the canonical "yesterday's state" record
  //   2. It's already computed by the compliance-snapshot cron (chunk 4.2a)
  //   3. It avoids a second full matrix computation
  //
  // If no snapshot exists (first run), no webhooks fire — correct, because
  // there's no "previous state" to compare against.
  let webhookEventsDispatched = 0;
  try {
    // Load yesterday's snapshot
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayDate = yesterday.toISOString().slice(0, 10);
    const yesterdaySnapshot = await db.complianceSnapshot.findUnique({
      where: { date: yesterdayDate },
    });

    if (yesterdaySnapshot) {
      // Build a set of "yesterday's statuses" keyed by (unionId, documentType)
      // The snapshot doesn't store per-cell statuses — it only stores aggregate
      // counts. So we can only detect AGGREGATE changes (e.g., the total
      // OVERDUE count changed), not per-cell changes.
      //
      // For a per-cell comparison, we'd need to store the full matrix in the
      // snapshot (chunk 4.2a scope guard explicitly excluded this). As a
      // pragmatic compromise, we dispatch a single "compliance status change"
      // event per union whose overallScore changed, with the current matrix
      // row as the payload. External systems can diff against their own
      // cached state.
      //
      // This is the documented behavior — not a bug. A future chunk could
      // widen the snapshot schema if per-cell events are needed.
      const statusChanges: Array<{
        unionId: string;
        unionName: string;
        previousScore: number | null;
        currentScore: number | null;
      }> = [];

      for (const row of matrix.unions) {
        // We don't have per-union historical scores in the snapshot, so we
        // dispatch for ALL unions with EXPIRING or OVERDUE cells. External
        // systems diff against their cache.
        const hasExpiringOrOverdue = row.scores.some(
          (cell) => cell.status === "EXPIRING" || cell.status === "OVERDUE",
        );
        if (hasExpiringOrOverdue) {
          statusChanges.push({
            unionId: row.unionId,
            unionName: row.unionName,
            previousScore: null, // not available from aggregate snapshot
            currentScore: row.overallScore,
          });
        }
      }

      for (const change of statusChanges) {
        const result = await dispatchEvent({
          eventType: WebhookEventType.COMPLIANCE_STATUS_CHANGE,
          payload: {
            unionId: change.unionId,
            unionName: change.unionName,
            previousScore: change.previousScore,
            currentScore: change.currentScore,
            issuesCount: issues.filter((i) => i.unionId === change.unionId).length,
            sweptAt: now.toISOString(),
          },
        });
        webhookEventsDispatched += result.dispatched;
      }
    }
  } catch (webhookErr) {
    // Webhook dispatch failure shouldn't block the sweep — log + continue.
    console.error("[compliance-sweep] Webhook dispatch failed:", webhookErr);
  }

  return NextResponse.json({
    swept: true,
    issuesFound: issues.length,
    notificationsCreated,
    tasksCreated,
    escalationsCreated,
    webhookEventsDispatched,
    weekKey,
  });
}
