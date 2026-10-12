import { createHmac } from "node:crypto";
import { assertPublicDestination } from "@/lib/webhooks/destination-guard";

function toKebabCase(s: string): string { return s.toLowerCase().replace(/_/g, "-"); }
function extractEventTypeFromPayload(payloadJson: string): string {
  try { const parsed = JSON.parse(payloadJson) as { type?: string }; return parsed.type ?? "unknown"; }
  catch { return "unknown"; }
}
import { db } from "@/lib/prisma";
import { WebhookEventType, WebhookDeliveryStatus } from "@prisma/client";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// =============================================================================
// Chunk 9 — Webhook dispatcher.
//
// Delivers event payloads to registered WebhookEndpoints via HTTP POST.
// Each delivery is signed with HMAC-SHA256 using the endpoint's secret so
// the receiver can verify authenticity (prevents forged payloads from
// attackers who can reach the endpoint's URL).
//
// RETRY STRATEGY: exponential backoff — 1min, 5min, 25min, 2h, 10h (5
// attempts max). A delivery row stays PENDING until the first attempt,
// then transitions to DELIVERED (2xx response) or FAILED (after max
// attempts exhausted). The retry cron picks up PENDING rows whose
// nextRetryAt has passed.
//
// DELIVERY FLOW:
//   1. dispatchEvent(eventType, payload) — called from the compliance-sweep
//      cron (or any other event source). Finds all active endpoints that
//      subscribe to this event type, creates a WebhookDelivery row per
//      endpoint (status=PENDING), and attempts immediate delivery.
//   2. attemptDelivery(deliveryId) — performs the HTTP POST, updates the
//      delivery row with the result. On failure, schedules a retry via
//      nextRetryAt (exponential backoff).
//   3. processPendingDeliveries() — called by the webhook-retry cron. Picks
//      up PENDING rows with nextRetryAt <= now and re-attempts them.
//
// SIGNATURE HEADER:
//   X-URM-Signature: sha256=<hex HMAC>
//   X-URM-Event: <event type>
//   X-URM-Delivery: <delivery ID>
//   X-URM-Timestamp: <ISO timestamp>
//
// The receiver verifies by recomputing HMAC-SHA256(payload, secret) and
// comparing to the X-URM-Signature header (constant-time comparison on
// the receiver side — we use timingSafeEqual there; here we just emit).
// =============================================================================

/** Maximum delivery attempts before giving up (exponential backoff). */
const MAX_DELIVERY_ATTEMPTS = 5;

/** Backoff intervals (in milliseconds) for each retry attempt. */
const BACKOFF_INTERVALS_MS = [
  0,                       // attempt 1: immediate
  60 * 1000,               // attempt 2: 1 min
  5 * 60 * 1000,           // attempt 3: 5 min
  25 * 60 * 1000,          // attempt 4: 25 min
  2 * 60 * 60 * 1000,      // attempt 5: 2 hours
  10 * 60 * 60 * 1000,     // attempt 6: 10 hours (final)
];

/** HTTP timeout for outbound webhook delivery (30 seconds). */
const DELIVERY_TIMEOUT_MS = 30_000;

export interface WebhookEvent {
  eventType: WebhookEventType;
  /** The event payload — any JSON-serializable object. */
  payload: Record<string, unknown>;
}

export interface DispatchResult {
  /** Number of endpoints the event was dispatched to. */
  dispatched: number;
  /** Number of deliveries that succeeded immediately (2xx response). */
  deliveredImmediately: number;
  /** Number of deliveries that failed + will be retried. */
  scheduledForRetry: number;
}

/**
 * Dispatch an event to all active webhook endpoints subscribed to it.
 *
 * Called from event sources (e.g., the compliance-sweep cron). Finds all
 * active WebhookEndpoints whose `events` list includes this event type
 * (or whose `events` is empty = "all events"), creates a WebhookDelivery
 * row per endpoint, and attempts immediate delivery.
 *
 * @returns Summary counts for logging/telemetry.
 */
export async function dispatchEvent(event: WebhookEvent): Promise<DispatchResult> {
  // Find all active endpoints that subscribe to this event type.
  // An endpoint with events="" (empty) subscribes to ALL events.
  const endpoints = await db.webhookEndpoint.findMany({
    where: { active: true },
  });

  const subscribedEndpoints = endpoints.filter((ep) => {
    if (!ep.events || ep.events.trim().length === 0) return true; // catch-all
    const eventList = ep.events.split(",").map((e) => e.trim()).filter(Boolean);
    return eventList.includes(event.eventType);
  });

  if (subscribedEndpoints.length === 0) {
    return { dispatched: 0, deliveredImmediately: 0, scheduledForRetry: 0 };
  }

  const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const payloadJson = JSON.stringify({
    id: eventId,
    type: event.eventType,
    createdAt: new Date().toISOString(),
    data: event.payload,
  });

  let deliveredImmediately = 0;
  let scheduledForRetry = 0;

  for (const endpoint of subscribedEndpoints) {
    // Create the delivery row (PENDING)
    const delivery = await db.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        eventId,
        eventType: event.eventType,
        payload: payloadJson,
        status: WebhookDeliveryStatus.PENDING,
        attempts: 0,
        maxAttempts: MAX_DELIVERY_ATTEMPTS,
      },
    });

    // Attempt immediate delivery (best-effort — failure schedules a retry)
    try {
      const result = await attemptDelivery(delivery.id, endpoint, payloadJson, event.eventType);
      if (result.delivered) {
        deliveredImmediately++;
      } else {
        scheduledForRetry++;
      }
    } catch (err) {
      console.error(`[webhooks] Immediate delivery failed for ${delivery.id}:`, err);
      scheduledForRetry++;
    }
  }

  return {
    dispatched: subscribedEndpoints.length,
    deliveredImmediately,
    scheduledForRetry,
  };
}

interface AttemptResult {
  delivered: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Perform a single delivery attempt for a WebhookDelivery row.
 *
 * Updates the delivery row with the result: status (DELIVERED on 2xx,
 * stays PENDING for retry otherwise), attempts count, lastResponseCode,
 * lastError, nextRetryAt (for retries), deliveredAt (on success).
 *
 * @param deliveryId  The WebhookDelivery row ID
 * @param endpoint    The WebhookEndpoint (passed to avoid an extra DB query)
 * @param payloadJson The pre-serialized payload
 */
export async function attemptDelivery(
  deliveryId: string,
  endpoint: { id: string; url: string; secret: string },
  payloadJson: string,
  eventType?: string,
): Promise<AttemptResult> {
  // Rate-limit check: 60 deliveries/min per endpoint (blocks a runaway
  // retry loop from hammering a slow endpoint).
  const rl = checkRateLimit(
    "webhook",
    endpoint.id,
    RATE_LIMITS.webhook.max,
    RATE_LIMITS.webhook.windowMs,
  );
  if (!rl.allowed) {
    // Schedule a retry after the rate-limit window resets
    const retryAt = new Date(Date.now() + 60_000);
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attempts: { increment: 1 },
        lastError: "Rate-limited (60/min per endpoint)",
        nextRetryAt: retryAt,
        firstAttemptAt: await getFirstAttemptAt(deliveryId),
      },
    });
    return { delivered: false, error: "Rate-limited" };
  }

  const timestamp = new Date().toISOString();
  const signature = signPayload(payloadJson, endpoint.secret, timestamp);

  const destCheck = await assertPublicDestination(endpoint.url);
  if (!destCheck.ok) {
    await scheduleRetry(deliveryId, null, `Destination blocked: ${destCheck.reason}`);
    return { delivered: false, error: `Destination blocked: ${destCheck.reason}` };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-URM-Signature": signature,
        "X-URM-Event": toKebabCase(eventType ?? extractEventTypeFromPayload(payloadJson)),
        "X-URM-Delivery": deliveryId,
        "X-URM-Timestamp": timestamp,
        "User-Agent": "URM-Webhook/1.0",
      },
      body: payloadJson,
      signal: controller.signal,
      redirect: "manual",
    });

    clearTimeout(timeout);

    const statusCode = response.status;
    const isSuccess = statusCode >= 200 && statusCode < 300;

    if (isSuccess) {
      await db.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: WebhookDeliveryStatus.DELIVERED,
          attempts: { increment: 1 },
          lastResponseCode: statusCode,
          lastError: null,
          nextRetryAt: null,
          firstAttemptAt: await getFirstAttemptAt(deliveryId),
          deliveredAt: new Date(),
        },
      });
      return { delivered: true, statusCode };
    } else {
      const errorMsg = statusCode >= 300 && statusCode < 400
        ? `HTTP ${statusCode} (redirects not supported — receiver must respond 2xx)`
        : `HTTP ${statusCode}`;
      await scheduleRetry(deliveryId, statusCode, errorMsg);
      return { delivered: false, statusCode, error: errorMsg };
    }
  } catch (err) {
    clearTimeout(timeout);
    const errorMsg = err instanceof Error ? err.message : String(err);
    await scheduleRetry(deliveryId, null, errorMsg);
    return { delivered: false, error: errorMsg };
  }
}

/**
 * Schedule a retry for a failed delivery.
 *
 * Uses exponential backoff: attempt N gets BACKOFF_INTERVALS_MS[N] ms delay.
 * After MAX_DELIVERY_ATTEMPTS, marks the delivery as FAILED (no more retries).
 */
async function scheduleRetry(
  deliveryId: string,
  responseCode: number | null,
  error: string,
): Promise<void> {
  const delivery = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: { attempts: true, maxAttempts: true },
  });
  if (!delivery) return;

  const newAttempts = delivery.attempts + 1;
  const exhausted = newAttempts >= delivery.maxAttempts;

  if (exhausted) {
    // No more retries — mark FAILED
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: WebhookDeliveryStatus.FAILED,
        attempts: newAttempts,
        lastResponseCode: responseCode,
        lastError: error,
        nextRetryAt: null,
        firstAttemptAt: await getFirstAttemptAt(deliveryId),
      },
    });
  } else {
    // Schedule the next retry with exponential backoff
    const backoffMs = BACKOFF_INTERVALS_MS[newAttempts] ?? BACKOFF_INTERVALS_MS[BACKOFF_INTERVALS_MS.length - 1];
    const retryAt = new Date(Date.now() + backoffMs);
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attempts: newAttempts,
        lastResponseCode: responseCode,
        lastError: error,
        nextRetryAt: retryAt,
        firstAttemptAt: await getFirstAttemptAt(deliveryId),
      },
    });
  }
}

/**
 * Get the firstAttemptAt timestamp, preserving it if already set.
 * (Helper — firstAttemptAt should only be set once, on the first attempt.)
 */
async function getFirstAttemptAt(deliveryId: string): Promise<Date> {
  const delivery = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: { firstAttemptAt: true },
  });
  return delivery?.firstAttemptAt ?? new Date();
}

/**
 * Process pending webhook deliveries whose nextRetryAt has passed.
 *
 * Called by the webhook-retry cron. Picks up PENDING rows with
 * nextRetryAt <= now (or null nextRetryAt + attempts < max — covers the
 * edge case where immediate delivery failed before setting nextRetryAt)
 * and re-attempts them.
 *
 * @returns Number of deliveries processed.
 */
export async function processPendingDeliveries(): Promise<number> {
  const now = new Date();
  const pending = await db.webhookDelivery.findMany({
    where: {
      status: WebhookDeliveryStatus.PENDING,
      OR: [
        { nextRetryAt: { lte: now } },
        { nextRetryAt: null, attempts: { lt: 5 } }, // edge case: never attempted
      ],
    },
    include: { endpoint: true },
    take: 50, // process at most 50 per run to avoid blocking
  });

  let processed = 0;
  for (const delivery of pending) {
    if (!delivery.endpoint || !delivery.endpoint.active) {
      // Endpoint was deleted or deactivated — mark as FAILED
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: WebhookDeliveryStatus.FAILED,
          lastError: "Endpoint inactive or deleted",
          nextRetryAt: null,
        },
      });
      continue;
    }

    try {
      await attemptDelivery(delivery.id, delivery.endpoint, delivery.payload, delivery.eventType);
      processed++;
    } catch (err) {
      console.error(`[webhooks] Retry failed for ${delivery.id}:`, err);
    }
  }

  return processed;
}

/**
 * Sign a webhook payload with HMAC-SHA256.
 *
 * The signature covers the payload + timestamp (to prevent replay attacks).
 * Returns the header value: `sha256=<hex>`.
 *
 * @param payload    The JSON-serialized payload string
 * @param secret     The endpoint's signing secret
 * @param timestamp  The ISO timestamp (also sent in X-URM-Timestamp)
 */
export function signPayload(payload: string, secret: string, timestamp: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(`${timestamp}.${payload}`);
  const signature = hmac.digest("hex");
  return `sha256=${signature}`;
}

/**
 * Verify a webhook signature (used by receivers — exported for testing).
 *
 * Recomputes the HMAC and compares it to the provided signature using
 * timingSafeEqual (constant-time comparison to prevent timing attacks).
 */
export function verifySignature(
  payload: string,
  secret: string,
  timestamp: string,
  signatureHeader: string,
): boolean {
  const expected = signPayload(payload, secret, timestamp);
  if (expected.length !== signatureHeader.length) return false;
  const { timingSafeEqual } = require("node:crypto");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/**
 * Generate a new webhook signing secret (32 bytes, hex-encoded).
 * Used at endpoint creation time.
 */
export function generateWebhookSecret(): string {
  const { randomBytes } = require("node:crypto");
  return randomBytes(32).toString("hex");
}
