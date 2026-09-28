import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";

// =============================================================================
// DELETE /api/webhooks/[id]         — delete a webhook endpoint (REGISTRAR)
// PATCH  /api/webhooks/[id]         — toggle active/inactive (REGISTRAR)
// GET    /api/webhooks/[id]/deliveries — view delivery log (REGISTRAR)
// =============================================================================

export async function DELETE(
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
      { error: "Only Registrars can delete webhook endpoints." },
      { status: 403 },
    );
  }

  // Soft-delete by deactivating (preserves delivery history for audit)
  // + hard-delete is also fine since deliveries cascade. We use hard-delete
  // here so the endpoint disappears from the list — the delivery history
  // is preserved via the cascade onDelete.
  try {
    await db.webhookEndpoint.delete({ where: { id } });
    return NextResponse.json({ deleted: true, id });
  } catch {
    return NextResponse.json(
      { error: "Webhook endpoint not found." },
      { status: 404 },
    );
  }
}

interface PatchBody {
  active?: unknown;
  events?: unknown;
}

export async function PATCH(
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
      { error: "Only Registrars can update webhook endpoints." },
      { status: 403 },
    );
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const data: { active?: boolean; events?: string } = {};
  if (typeof body.active === "boolean") {
    data.active = body.active;
  }
  if (typeof body.events === "string") {
    data.events = body.events;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No fields to update. Provide 'active' (boolean) or 'events' (string)." },
      { status: 400 },
    );
  }

  try {
    const updated = await db.webhookEndpoint.update({
      where: { id },
      data,
      select: { id: true, url: true, name: true, events: true, active: true, updatedAt: true },
    });
    return NextResponse.json({ endpoint: updated });
  } catch {
    return NextResponse.json(
      { error: "Webhook endpoint not found." },
      { status: 404 },
    );
  }
}
