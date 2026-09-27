// =============================================================================
// SMS/WhatsApp sender — sends mobile notifications via Twilio.
//
// CONFIG (in .env):
//   TWILIO_ACCOUNT_SID    — your Twilio Account SID
//   TWILIO_AUTH_TOKEN     — your Twilio Auth Token
//   TWILIO_SMS_FROM       — your Twilio phone number (E.164, e.g. +14155238886)
//   TWILIO_WHATSAPP_FROM  — your Twilio WhatsApp sender (e.g. whatsapp:+14155238886)
//
// FALLBACK: if Twilio is not configured (any required var missing), the
// sender silently logs to console instead of sending — same pattern as
// src/lib/email.ts. The in-app bell notification still works; SMS/WhatsApp
// is a bonus channel.
//
// SMS vs WHATSAPP:
//   WhatsApp messages are cheaper + richer (templates, media) but require
//   the recipient to have WhatsApp installed + the sender to use an approved
//   template. SMS works on any phone but costs more per message.
//
//   The caller decides which channel(s) to use based on the user's
//   preferences (smsNotificationsEnabled, whatsappNotificationsEnabled).
//
// LAZY IMPORT: the `twilio` package is loaded via dynamic require inside
// getTwilioClient(). This means if twilio isn't installed (dev boxes without
// the optional dep), the module still loads — only SMS sending degrades.
// Without this, any code path that imports notifications.ts (which imports
// sms.ts) would crash at module-load time.
// =============================================================================

// Use `any` for the client type since we can't import the type without the
// package being installed. The runtime check inside getTwilioClient handles
// the missing-package case.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let twilioModule: any = null;

function getTwilioClient(): any | null {
  if (client) return client;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken || accountSid.startsWith("change-this")) {
    return null;
  }

  // Lazy-load the twilio module. If it's not installed, log once + return null.
  if (!twilioModule) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      twilioModule = require("twilio");
    } catch {
      console.warn("[sms] twilio package not installed — SMS/WhatsApp notifications disabled.");
      return null;
    }
  }

  client = twilioModule(accountSid, authToken);
  return client;
}

export interface SendSmsOptions {
  to: string;        // E.164 format (e.g. +67512345678)
  body: string;      // Max 160 chars for SMS; WhatsApp supports longer
  whatsapp?: boolean; // If true, send via WhatsApp instead of SMS
}

export interface SendSmsResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send an SMS or WhatsApp message via Twilio. Returns a result object —
 * never throws.
 *
 * If Twilio is not configured, logs to console + returns success: false.
 */
export async function sendSMS(opts: SendSmsOptions): Promise<SendSmsResult> {
  const c = getTwilioClient();

  if (!c) {
    const channel = opts.whatsapp ? "WhatsApp" : "SMS";
    console.log(`[${channel.toLowerCase()}] (Twilio not configured — logging instead of sending)`);
    console.log(`[${channel.toLowerCase()}] To: ${opts.to}`);
    console.log(`[${channel.toLowerCase()}] Body: ${opts.body}`);
    return { success: false, error: "Twilio not configured" };
  }

  try {
    const from = opts.whatsapp
      ? (process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886")
      : (process.env.TWILIO_SMS_FROM || "+14155238886");

    const to = opts.whatsapp ? `whatsapp:${opts.to}` : opts.to;

    const message = await c.messages.create({
      body: opts.body,
      from,
      to,
    });

    return { success: true, messageId: message.sid };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sms] Failed to send to ${opts.to}:`, message);
    return { success: false, error: message };
  }
}

/**
 * Check if SMS is configured (Twilio vars present).
 */
export function isSmsConfigured(): boolean {
  return getTwilioClient() !== null;
}

/**
 * Check if WhatsApp is configured (Twilio vars + WHATSAPP_FROM present).
 */
export function isWhatsAppConfigured(): boolean {
  return getTwilioClient() !== null && !!process.env.TWILIO_WHATSAPP_FROM;
}

/**
 * Truncate a message body to fit within SMS character limits.
 * Standard SMS: 160 chars. WhatsApp: no practical limit (use 4096).
 */
export function truncateForSms(text: string, maxLen = 160): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + "...";
}
