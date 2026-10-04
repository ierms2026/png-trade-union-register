import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processPendingDeliveries } from "@/lib/webhooks/dispatcher";

// =============================================================================
// POST /api/cron/webhook-retry
// -----------------------------------------------------------------------------
// Chunk 9: Retry pending webhook deliveries whose nextRetryAt has passed.
//
// Runs every 5 minutes (recommended schedule). Picks up PENDING deliveries
// with exponential backoff and re-attempts them. After MAX_DELIVERY_ATTEMPTS
// (5), deliveries are marked FAILED (no more retries).
//
// AUTH: Bearer token via CRON_SECRET (same pattern as the other cron routes).
//
// RECOMMENDED SCHEDULE: every 5 minutes
//   */5 * * * * ./scripts/cron.sh webhook-retry >> /var/log/urm-webhook-retry.log 2>&1
// =============================================================================

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: "Invalid cron secret." }, { status: 401 });
  }

  const processed = await processPendingDeliveries();

  return NextResponse.json({
    retryRun: true,
    deliveriesProcessed: processed,
    at: new Date().toISOString(),
  });
}
