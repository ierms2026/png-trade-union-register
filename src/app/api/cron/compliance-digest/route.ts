import { NextRequest, NextResponse } from "next/server";
import { staffLinkUrl } from "@/lib/dashboard/vocabulary";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/prisma";
import { Role, NotificationType } from "@prisma/client";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { collectDigestIssues, type DigestItem } from "@/lib/compliance/digest-issues";
import { createNotification, getUserNotificationPrefs } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";

// =============================================================================
// POST /api/cron/compliance-digest
// -----------------------------------------------------------------------------
// Weekly compliance digest email. Sends each Registrar + Officer a summary
// of all upcoming + overdue compliance issues across the system (Registrars)
// or their union (Officers).
//
// SCHEDULE: weekly (Monday 09:00 UTC recommended in cron.sh)
// AUTH: same Bearer token pattern as the other cron routes.
//
// DIGEST CONTENTS:
//   - Overdue documents (past due, sorted by days overdue DESC)
//   - Expiring within 30 days (urgent)
//   - Expiring within 31–90 days (warning)
//   - Summary count at the top
//
// DEDUPKEY: `compliance-digest:{recipientId}:{YYYY-Www}` — fires once per
// week per recipient. Running the digest twice in the same week won't
// duplicate.
// =============================================================================

export async function POST(req: NextRequest) {
  // --- 1. Bearer token auth ---
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing or invalid Authorization header." }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const secret = process.env.CRON_SECRET;
  if (!secret || token.length !== secret.length || !timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
    return NextResponse.json({ error: "Invalid cron secret." }, { status: 401 });
  }

  // --- 2. Compute the compliance matrix ---
  const now = new Date();
  const data = await fetchMatrixData();
  const matrix = buildComplianceMatrix(data);

  // --- 3. Build system-wide issue list ---
  // The issue-collection logic lives in collectDigestIssues() so it can be
  // unit-tested directly. The route passes the built matrix + rules map +
  // current time; the function returns the three buckets.
  const renewalByType = new Map(data.rules.map((r) => [r.documentType, r.renewalYears]));
  const { overdue, expiring30, expiring90 } = collectDigestIssues(matrix, renewalByType, now);

  const totalIssues = overdue.length + expiring30.length + expiring90.length;

  if (totalIssues === 0) {
    return NextResponse.json({ digested: true, recipients: 0, issues: 0, message: "No compliance issues — no digest sent." });
  }

  // --- 4. Get the ISO week key for dedup ---
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const weekKey = `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;

  // --- 5. Send digest to all Registrars + Officers ---
  const recipients = await db.user.findMany({
    where: {
      role: { in: [Role.REGISTRAR, Role.OFFICER] },
      disabled: false,
      emailNotificationsEnabled: true,
    },
    select: { id: true, email: true, role: true, assignedUnionId: true },
  });

  let digestsSent = 0;

  for (const recipient of recipients) {
    // For Officers: filter to their union only
    let recipientOverdue = overdue;
    let recipientExpiring30 = expiring30;
    let recipientExpiring90 = expiring90;

    if (recipient.role === Role.OFFICER && recipient.assignedUnionId) {
      // Find the union name for this officer
      const officerUnion = matrix.unions.find((u) => u.unionId === recipient.assignedUnionId);
      if (!officerUnion) continue; // union not in the matrix
      const unionName = officerUnion.unionName;
      recipientOverdue = overdue.filter((i) => i.unionName === unionName);
      recipientExpiring30 = expiring30.filter((i) => i.unionName === unionName);
      recipientExpiring90 = expiring90.filter((i) => i.unionName === unionName);
    }

    const recipientTotal = recipientOverdue.length + recipientExpiring30.length + recipientExpiring90.length;
    if (recipientTotal === 0) continue; // nothing to report for this recipient

    // Build the digest email
    const subject = recipient.role === Role.REGISTRAR
      ? `Weekly Compliance Digest: ${recipientTotal} issue${recipientTotal !== 1 ? "s" : ""} across ${matrix.unions.length} unions`
      : `Weekly Compliance Digest: ${recipientTotal} issue${recipientTotal !== 1 ? "s" : ""} for your union`;

    const html = renderDigestEmail({
      recipientName: recipient.email,
      isRegistrar: recipient.role === Role.REGISTRAR,
      totalIssues: recipientTotal,
      overdue: recipientOverdue,
      expiring30: recipientExpiring30,
      expiring90: recipientExpiring90,
    });

    // Create the in-app notification (with weekly dedup)
    const dedupKey = `compliance-digest:${recipient.id}:${weekKey}`;
    const notifResult = await createNotification({
      userId: recipient.id,
      userEmail: recipient.email,
      emailNotificationsEnabled: true,
      type: NotificationType.COMPLIANCE,
      title: subject,
      body: `${recipientTotal} compliance issue${recipientTotal !== 1 ? "s" : ""} requiring attention. ${recipientOverdue.length} overdue, ${recipientExpiring30.length} expiring within 30 days, ${recipientExpiring90.length} expiring within 90 days.`,
      dedupKey,
      linkUrl: staffLinkUrl("compliance"),
    });

    // Send the email directly (with the rich HTML digest template)
    if (notifResult.created) {
      const emailResult = await sendEmail({
        to: recipient.email,
        subject,
        html,
      });

      // Update the notification's email status
      if (notifResult.notification) {
        try {
          await db.notification.update({
            where: { id: notifResult.notification.id },
            data: {
              emailSentAt: emailResult.success ? new Date() : null,
              emailError: emailResult.success ? null : (emailResult.error || "Unknown error"),
            },
          });
        } catch { /* non-fatal */ }
      }

      if (emailResult.success) digestsSent++;
    }
  }

  return NextResponse.json({
    digested: true,
    weekKey,
    totalIssues,
    recipients: recipients.length,
    digestsSent,
    breakdown: {
      overdue: overdue.length,
      expiring30: expiring30.length,
      expiring90: expiring90.length,
    },
  });
}

// =============================================================================
// Digest email template — renders a bucketed summary with tables.
// =============================================================================

interface DigestEmailParams {
  recipientName: string;
  isRegistrar: boolean;
  totalIssues: number;
  overdue: DigestItem[];
  expiring30: DigestItem[];
  expiring90: DigestItem[];
}

function renderDigestEmail(params: DigestEmailParams): string {
  const { recipientName, isRegistrar, totalIssues, overdue, expiring30, expiring90 } = params;

  const scopeText = isRegistrar
    ? `across all ${overdue.length + expiring30.length + expiring90.length > 0 ? "registered" : ""} unions`
    : "for your union";

  const renderTable = (items: DigestItem[], label: string, color: string) => {
    if (items.length === 0) return "";
    const rows = items.map((item) => {
      const daysLabel = item.daysUntilExpiry < 0
        ? `${Math.abs(item.daysUntilExpiry)} days overdue`
        : `${item.daysUntilExpiry} days remaining`;
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(item.unionName)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(item.documentType)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(item.expiryDate)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:${color};font-weight:600;">${daysLabel}</td>
      </tr>`;
    }).join("");
    return `
      <h3 style="margin:24px 0 8px;font-size:15px;color:${color};">${label} (${items.length})</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #ddd;border-radius:4px;overflow:hidden;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#666;">Union</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#666;">Document Type</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#666;">Expiry Date</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#666;">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  };

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:#1a1a2e;padding:20px 30px;">
          <p style="margin:0;color:#ffffff;font-size:16px;font-weight:600;">Register of Trade Unions</p>
          <p style="margin:4px 0 0;color:#a0a0b0;font-size:12px;">Weekly Compliance Digest · Office of The Industrial Registrar</p>
        </td></tr>
        <tr><td style="padding:30px;">
          <h1 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">Weekly Compliance Digest</h1>
          <p style="margin:0 0 20px;font-size:14px;color:#666;">Hello ${escapeHtml(recipientName)},</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#333;">
            There ${totalIssues !== 1 ? "are" : "is"} <strong>${totalIssues}</strong> compliance issue${totalIssues !== 1 ? "s" : ""} ${scopeText} requiring attention this week.
          </p>

          <div style="background:#f9f9f9;border-radius:6px;padding:16px;margin-bottom:20px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;">
              <span style="color:#c0392b;font-weight:600;">Overdue: ${overdue.length}</span>
              <span style="color:#e67e22;font-weight:600;">Expiring ≤30 days: ${expiring30.length}</span>
              <span style="color:#f39c12;font-weight:600;">Expiring 31–90 days: ${expiring90.length}</span>
            </div>
          </div>

          ${renderTable(overdue, "Overdue Documents", "#c0392b")}
          ${renderTable(expiring30, "Expiring Within 30 Days", "#e67e22")}
          ${renderTable(expiring90, "Expiring Within 31–90 Days", "#f39c12")}

          <a href="/compliance" style="display:inline-block;margin-top:24px;padding:10px 24px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;">View Compliance Dashboard</a>
        </td></tr>
        <tr><td style="padding:20px 30px;background:#f9f9f9;border-top:1px solid #eeeeee;">
          <p style="margin:0;font-size:11px;color:#999999;">This is an automated weekly digest from the Register of Trade Unions staff portal. Do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
