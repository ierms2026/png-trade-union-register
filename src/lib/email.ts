import nodemailer from "nodemailer";

// =============================================================================
// Email sender — sends transactional emails via SMTP.
//
// CONFIG (in .env):
//   SMTP_HOST       — e.g. smtp.gmail.com
//   SMTP_PORT       — e.g. 587 (STARTTLS) or 465 (SSL)
//   SMTP_USER       — SMTP username
//   SMTP_PASSWORD   — SMTP password (use an app-specific password for Gmail)
//   SMTP_FROM_NAME  — display name in the From field
//   SMTP_FROM_EMAIL — from email address
//
// FALLBACK: if SMTP_HOST is not configured (or any required var is missing),
// the sender silently logs to console instead of sending. This lets the app
// run without email configured (dev/test environments) — notifications are
// still created in the DB (the bell icon works); email is a bonus channel.
//
// RETRY: no automatic retry. If the SMTP send fails, the error is logged +
// the notification's emailError field is set. A future cron could retry
// failed emails by querying notifications where emailSentAt IS NULL AND
// emailError IS NOT NULL.
// =============================================================================

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !port || !user || !pass) {
    return null; // Email not configured — silent fallback
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(port, 10),
    secure: parseInt(port, 10) === 465,
    auth: { user, pass },
  });

  return transporter;
}

function getFromAddress(): string {
  const name = process.env.SMTP_FROM_NAME || "Register of Trade Unions";
  const email = process.env.SMTP_FROM_EMAIL || "noreply@localhost";
  return `${name} <${email}>`;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string; // plain-text fallback (auto-generated from HTML if not provided)
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send an email via SMTP. Returns a result object — never throws.
 *
 * If SMTP is not configured, logs to console + returns success: false
 * with error "SMTP not configured". The caller decides whether to treat
 * this as a hard failure (it shouldn't — email is best-effort).
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const t = getTransporter();

  if (!t) {
    // Email not configured — log to console (dev mode) + return gracefully
    console.log(`[email] (SMTP not configured — logging instead of sending)`);
    console.log(`[email] To: ${opts.to}`);
    console.log(`[email] Subject: ${opts.subject}`);
    console.log(`[email] Body: ${opts.text || opts.html.replace(/<[^>]*>/g, "")}`);
    return { success: false, error: "SMTP not configured" };
  }

  try {
    const info = await t.sendMail({
      from: getFromAddress(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text || opts.html.replace(/<[^>]*>/g, ""),
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] Failed to send to ${opts.to}:`, message);
    return { success: false, error: message };
  }
}

/**
 * Check if email is configured (SMTP vars present).
 * Used by the notification helper to decide whether to attempt sending.
 */
export function isEmailConfigured(): boolean {
  return getTransporter() !== null;
}
