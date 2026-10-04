import { sendEmail } from "@/lib/email";

// =============================================================================
// Email templates — transactional email content for key user flows.
//
// Each function builds an HTML email + calls sendEmail(). The templates share
// a common branded wrapper (dark header, "Register of Trade Unions" branding)
// for visual consistency with the in-app notification emails.
//
// All emails are BEST-EFFORT: sendEmail never throws, + the caller doesn't
// depend on the email being delivered. If SMTP isn't configured, the email
// is logged to console (dev mode) + the function returns { success: false }.
// =============================================================================

/** Common HTML wrapper with branded header + footer. */
function emailWrapper(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;padding:20px 10px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0">
        <tr><td style="color:#ffffff;font-size:20px;font-weight:bold;">Register of Trade Unions</td></tr>
        <tr><td style="color:#a0a0b8;font-size:12px;">Office of The Industrial Registrar · Papua New Guinea</td></tr>
      </table>
    </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 10px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:30px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td>
          <h1 style="margin:0 0 20px 0;font-size:22px;color:#1a1a2e;">${escapeHtml(title)}</h1>
          ${bodyHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 10px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0">
        <tr><td style="color:#71717a;font-size:12px;text-align:center;">
          This is an automated message from the Register of Trade Unions system.<br>
          Do not reply to this email. For questions, contact the Industrial Registrar's office.
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

// =============================================================================
// Password reset email — sent when a user is created OR when an admin resets
// their password. Contains a one-time link to set their password.
// =============================================================================

export interface PasswordResetEmailParams {
  to: string;
  userName?: string;
  setPasswordUrl: string;
  expiresAt: Date;
  createdByEmail: string;
  isNewUser: boolean;
}

export async function sendPasswordResetEmail(
  params: PasswordResetEmailParams,
): Promise<{ success: boolean; error?: string }> {
  const { to, userName, setPasswordUrl, expiresAt, createdByEmail, isNewUser } = params;

  const title = isNewUser ? "Your Account Has Been Created" : "Your Password Has Been Reset";
  const greeting = userName ? `Hello ${escapeHtml(userName)},` : "Hello,";
  const actionText = isNewUser
    ? "An account has been created for you on the Register of Trade Unions system. You need to set your password to activate the account."
    : "Your password has been reset by an administrator. You need to set a new password to log in again.";

  const expiresInHours = Math.round(
    (expiresAt.getTime() - Date.now()) / (60 * 60 * 1000),
  );

  const bodyHtml = `
    <p>${greeting}</p>
    <p>${actionText}</p>
    <p style="margin:30px 0;">
      <a href="${escapeHtml(setPasswordUrl)}"
         style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">
        Set Your Password
      </a>
    </p>
    <p style="font-size:14px;color:#71717a;">
      Or copy this link into your browser:<br>
      <a href="${escapeHtml(setPasswordUrl)}" style="color:#1a1a2e;word-break:break-all;">${escapeHtml(setPasswordUrl)}</a>
    </p>
    <p style="font-size:14px;color:#71717a;">
      This link expires in ${expiresInHours} hour${expiresInHours === 1 ? "" : "s"} (at ${expiresAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}).
    </p>
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:25px 0;">
    <p style="font-size:13px;color:#71717a;">
      This action was performed by <strong>${escapeHtml(createdByEmail)}</strong>.
      If you did not expect this, please contact the Industrial Registrar's office immediately.
    </p>
  `;

  const html = emailWrapper(title, bodyHtml);
  const text = `${greeting}\n\n${actionText}\n\nSet your password at: ${setPasswordUrl}\n\nThis link expires in ${expiresInHours} hour(s).\n\nThis action was performed by ${createdByEmail}.`;

  const result = await sendEmail({ to, subject: title, html, text });
  return { success: result.success, error: result.error };
}

// =============================================================================
// Login notification email — sent when a user logs in from a new device/IP.
// =============================================================================

export interface LoginNotificationEmailParams {
  to: string;
  userEmail: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

export async function sendLoginNotificationEmail(
  params: LoginNotificationEmailParams,
): Promise<{ success: boolean; error?: string }> {
  const { to, userEmail, timestamp, ipAddress, userAgent } = params;

  const title = "New Login to Your Account";
  const bodyHtml = `
    <p>A new login was detected for your account.</p>
    <table style="width:100%;font-size:14px;margin:20px 0;">
      <tr><td style="padding:5px 0;color:#71717a;">Email:</td><td style="padding:5px 0;">${escapeHtml(userEmail)}</td></tr>
      <tr><td style="padding:5px 0;color:#71717a;">Time:</td><td style="padding:5px 0;">${timestamp.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}</td></tr>
      ${ipAddress ? `<tr><td style="padding:5px 0;color:#71717a;">IP Address:</td><td style="padding:5px 0;">${escapeHtml(ipAddress)}</td></tr>` : ""}
      ${userAgent ? `<tr><td style="padding:5px 0;color:#71717a;">Browser/Device:</td><td style="padding:5px 0;">${escapeHtml(userAgent)}</td></tr>` : ""}
    </table>
    <p style="font-size:14px;color:#71717a;">
      If this was you, no action is needed. If you did not log in, please contact the Industrial Registrar's office immediately + change your password.
    </p>
  `;

  const html = emailWrapper(title, bodyHtml);
  const text = `A new login was detected for your account.\n\nEmail: ${userEmail}\nTime: ${timestamp.toISOString()}\n${ipAddress ? `IP: ${ipAddress}\n` : ""}\nIf this was not you, contact the Industrial Registrar immediately.`;

  const result = await sendEmail({ to, subject: title, html, text });
  return { success: result.success, error: result.error };
}
