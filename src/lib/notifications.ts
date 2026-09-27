import { db } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { sendSMS, truncateForSms } from "@/lib/sms";
import { NotificationType } from "@prisma/client";

// =============================================================================
// Notification helper — the single entry point for creating notifications.
//
// This replaces the scattered `db.notification.create({ ... })` calls across
// 7+ routes with a centralized function that:
//   1. Creates the in-app notification (the bell icon) — with dedupKey
//   2. Sends an email if the user has emailNotificationsEnabled = true
//   3. Sends an SMS if the user has smsNotificationsEnabled = true + phone
//   4. Sends a WhatsApp message if whatsappNotificationsEnabled = true + phone
//   5. Records delivery status for all channels (emailSentAt/emailError,
//      smsSentAt/smsError)
//
// The dedupKey prevents duplicate notifications — if a notification with
// the same dedupKey already exists, the DB unique constraint fires + the
// function returns { created: false }. The caller should treat this as
// a no-op (not an error).
//
// ALL CHANNEL FAILURES ARE NON-FATAL:
//   If email/SMS/WhatsApp sending fails, the in-app notification is still
//   created. The error fields are set for diagnostics.
// =============================================================================

export interface CreateNotificationParams {
  /** The user ID to notify. */
  userId: string;
  /** The user's email address (for sending email). */
  userEmail: string;
  /** Whether the user has email notifications enabled. */
  emailNotificationsEnabled: boolean;
  /** Notification type (COMPLIANCE or TASK). */
  type: NotificationType;
  /** Short title (shown in the bell dropdown + email subject + SMS body). */
  title: string;
  /** Body text (shown in the bell dropdown + email body). */
  body: string;
  /** Unique dedup key — prevents duplicate notifications. */
  dedupKey: string;
  /** Optional link URL (where clicking the notification takes the user). */
  linkUrl?: string;
  // --- SMS/WhatsApp channel params (optional — callers without these skip SMS) ---
  /** User's phone number in E.164 format (e.g. +67512345678). */
  phone?: string | null;
  /** Whether the user has SMS notifications enabled. */
  smsNotificationsEnabled?: boolean;
  /** Whether the user has WhatsApp notifications enabled. */
  whatsappNotificationsEnabled?: boolean;
}

export interface CreateNotificationResult {
  /** Whether a new notification was created (false = dedupKey collision). */
  created: boolean;
  /** The created notification (null if dedup or creation failed). */
  notification: { id: string } | null;
  /** Whether the email was sent successfully (null if not attempted). */
  emailSent: boolean | null;
  /** Email error message (if email was attempted + failed). */
  emailError: string | null;
  /** Whether the SMS was sent successfully (null if not attempted). */
  smsSent: boolean | null;
  /** SMS error message (if SMS was attempted + failed). */
  smsError: string | null;
}

/**
 * Create a notification + send email/SMS/WhatsApp (as enabled).
 *
 * This is the SINGLE function all routes should call instead of
 * `db.notification.create()`. It handles:
 *   - dedupKey uniqueness (returns created: false on collision)
 *   - email sending (if the user has emailNotificationsEnabled)
 *   - SMS sending (if smsNotificationsEnabled + phone provided)
 *   - WhatsApp sending (if whatsappNotificationsEnabled + phone provided)
 *   - delivery tracking (emailSentAt/emailError, smsSentAt/smsError)
 *   - graceful failure (channel errors don't prevent the notification)
 *
 * @returns CreateNotificationResult — never throws.
 */
export async function createNotification(
  params: CreateNotificationParams,
): Promise<CreateNotificationResult> {
  const {
    userId, userEmail, emailNotificationsEnabled,
    phone, smsNotificationsEnabled, whatsappNotificationsEnabled,
    type, title, body, dedupKey, linkUrl,
  } = params;

  // --- 1. Create the in-app notification (with dedup) ---
  let notificationId: string | null = null;
  try {
    const notification = await db.notification.create({
      data: { userId, type, title, body, dedupKey, linkUrl: linkUrl || null },
      select: { id: true },
    });
    notificationId = notification.id;
  } catch {
    // dedupKey unique constraint violation — notification already exists.
    return { created: false, notification: null, emailSent: null, emailError: null, smsSent: null, smsError: null };
  }

  // --- 2. Send email (if enabled) ---
  let emailSent: boolean | null = null;
  let emailError: string | null = null;

  if (emailNotificationsEnabled) {
    const emailResult = await sendEmail({
      to: userEmail,
      subject: title,
      html: renderEmailTemplate(title, body, linkUrl),
      text: `${title}\n\n${body}\n${linkUrl ? `\nView: ${linkUrl}` : ""}`,
    });
    emailSent = emailResult.success;
    emailError = emailResult.success ? null : (emailResult.error || "Unknown error");
  }

  // --- 3. Send SMS (if enabled + phone provided) ---
  let smsSent: boolean | null = null;
  let smsError: string | null = null;

  if (smsNotificationsEnabled && phone) {
    const smsBody = truncateForSms(`${title}\n\n${body}`);
    const smsResult = await sendSMS({ to: phone, body: smsBody, whatsapp: false });
    smsSent = smsResult.success;
    smsError = smsResult.success ? null : (smsResult.error || "Unknown error");
  }

  // --- 4. Send WhatsApp (if enabled + phone provided) ---
  if (whatsappNotificationsEnabled && phone) {
    const waBody = `${title}\n\n${body}${linkUrl ? `\n\nView: ${linkUrl}` : ""}`;
    const waResult = await sendSMS({ to: phone, body: waBody, whatsapp: true });
    // If SMS was also sent, we keep both results. The smsSentAt tracks the
    // last SMS-channel attempt (WhatsApp is technically a separate channel
    // but uses the same Twilio client). For simplicity, we track WhatsApp
    // delivery in the same smsSentAt/smsError fields — if both are enabled,
    // the last one wins. A future schema change could add separate fields.
    if (smsSent === null || !smsSent) {
      smsSent = waResult.success;
      smsError = waResult.success ? null : (waResult.error || "Unknown error");
    }
  }

  // --- 5. Record delivery status for all channels ---
  if (notificationId) {
    try {
      await db.notification.update({
        where: { id: notificationId },
        data: {
          emailSentAt: emailSent ? new Date() : null,
          emailError,
          smsSentAt: smsSent ? new Date() : null,
          smsError,
        },
      });
    } catch {
      // Non-fatal — the notification was still created + messages may have been sent.
    }
  }

  return {
    created: true,
    notification: notificationId ? { id: notificationId } : null,
    emailSent,
    emailError,
    smsSent,
    smsError,
  };
}

/**
 * Render a simple HTML email template.
 *
 * Uses inline styles (not a CSS file) because email clients don't support
 * external stylesheets. The template is intentionally simple — plain
 * white background, system font, a header bar, the body text, and a
 * link button.
 */
function renderEmailTemplate(title: string, body: string, linkUrl?: string): string {
  const linkButton = linkUrl
    ? `<a href="${linkUrl}" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;">View in Dashboard</a>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:#1a1a2e;padding:20px 30px;">
          <p style="margin:0;color:#ffffff;font-size:16px;font-weight:600;">Register of Trade Unions</p>
          <p style="margin:4px 0 0;color:#a0a0b0;font-size:12px;">Office of The Industrial Registrar · Papua New Guinea</p>
        </td></tr>
        <tr><td style="padding:30px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">${escapeHtml(title)}</h1>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#333333;">${escapeHtml(body)}</p>
          ${linkButton}
        </td></tr>
        <tr><td style="padding:20px 30px;background:#f9f9f9;border-top:1px solid #eeeeee;">
          <p style="margin:0;font-size:11px;color:#999999;">This is an automated notification from the Register of Trade Unions staff portal. Do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Helper: fetch a user's notification preferences (email + emailNotificationsEnabled).
 * Used by routes that already have the user ID but need the email + preference.
 */
export async function getUserNotificationPrefs(userId: string): Promise<{
  email: string;
  emailNotificationsEnabled: boolean;
  phone: string | null;
  smsNotificationsEnabled: boolean;
  whatsappNotificationsEnabled: boolean;
} | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      emailNotificationsEnabled: true,
      phone: true,
      smsNotificationsEnabled: true,
      whatsappNotificationsEnabled: true,
    },
  });
  return user;
}

/**
 * Helper: create a notification for multiple users (e.g. all Registrars).
 * Fetches each user's email + preferences, then calls createNotification
 * for each. Returns an array of results.
 */
export async function createNotificationForUsers(
  userIds: string[],
  params: Omit<CreateNotificationParams, "userId" | "userEmail" | "emailNotificationsEnabled" | "phone" | "smsNotificationsEnabled" | "whatsappNotificationsEnabled">,
): Promise<CreateNotificationResult[]> {
  const results: CreateNotificationResult[] = [];
  for (const userId of userIds) {
    const prefs = await getUserNotificationPrefs(userId);
    if (!prefs) continue; // user deleted between fetch + notify
    const result = await createNotification({
      ...params,
      userId,
      userEmail: prefs.email,
      emailNotificationsEnabled: prefs.emailNotificationsEnabled,
      phone: prefs.phone,
      smsNotificationsEnabled: prefs.smsNotificationsEnabled,
      whatsappNotificationsEnabled: prefs.whatsappNotificationsEnabled,
    });
    results.push(result);
  }
  return results;
}
