import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, WebhookDeliveryStatus } from "@prisma/client";

// =============================================================================
// GET /api/webhooks/[id]/deliveries?status=PENDING|DELIVERED|FAILED&limit=50
// -----------------------------------------------------------------------------
// Chunk 9: View the delivery log for a webhook endpoint. REGISTRAR only.
//
// Returns the most recent deliveries (default 50, max 200) with status,
// attempts, response codes, + timestamps. Useful for debugging why a
// webhook isn't being received by the external system.
// =============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can view webhook delivery logs." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

  // Validate status param
  const where: { endpointId: string; status?: WebhookDeliveryStatus } = { endpointId: id };
  if (statusParam && statusParam !== "ALL") {
    const validStatuses = ["PENDING", "DELIVERED", "FAILED"];
    if (!validStatuses.includes(statusParam)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}, ALL.` },
        { status: 400 },
      );
    }
    where.status = statusParam as WebhookDeliveryStatus;
  }

  const deliveries = await db.webhookDelivery.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      eventId: true,
      eventType: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      lastResponseCode: true,
      lastError: true,
      nextRetryAt: true,
      firstAttemptAt: true,
      deliveredAt: true,
      createdAt: true,
      // Deliberately NOT selecting `payload` — it can be large + may contain
      // sensitive data. The admin can fetch a specific delivery's payload
      // via a separate endpoint if needed.
    },
  });

  return NextResponse.json({ deliveries, count: deliveries.length });
}
