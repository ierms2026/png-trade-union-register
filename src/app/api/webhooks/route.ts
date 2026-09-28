import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";
import { generateWebhookSecret } from "@/lib/webhooks/dispatcher";

// =============================================================================
// GET  /api/webhooks        — list all webhook endpoints (REGISTRAR only)
// POST /api/webhooks        — register a new webhook endpoint (REGISTRAR only)
// -----------------------------------------------------------------------------
// Chunk 9: Webhook admin API. Session-only (NOT API keys) — managing webhook
// endpoints is an admin action that requires browser auth, not a programmable
// key. This is the same pattern as /api/api-keys (deliberately NO
// api-keys:* scope).
//
// CREATE: the signing secret is generated server-side + returned ONCE in the
// response. The DB stores it in plaintext (we need it to sign outbound
// payloads), but it's only shown to the admin once at creation time — same
// UX as API keys.
// =============================================================================

const ALLOWED_EVENTS = [
  "COMPLIANCE_STATUS_CHANGE",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_REVIEWED",
  "CONTACT_UPDATE_SUBMITTED",
  "CONTACT_UPDATE_REVIEWED",
] as const;

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can manage webhook endpoints." },
      { status: 403 },
    );
  }

  const endpoints = await db.webhookEndpoint.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      name: true,
      events: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      // Deliberately NOT selecting `secret` — it's never returned after creation
      _count: {
        select: {
          deliveries: {
            where: { status: "PENDING" },
          },
        },
      },
    },
  });

  return NextResponse.json({ endpoints });
}

interface CreateBody {
  url?: unknown;
  name?: unknown;
  events?: unknown;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can create webhook endpoints." },
      { status: 403 },
    );
  }

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Validate URL
  if (typeof body.url !== "string" || body.url.trim().length === 0) {
    return NextResponse.json(
      { error: "Field 'url' is required and must be a non-empty string." },
      { status: 400 },
    );
  }
  const url = body.url.trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Must be http or https");
    }
  } catch {
    return NextResponse.json(
      { error: "Field 'url' must be a valid HTTP(S) URL." },
      { status: 400 },
    );
  }

  // Validate name
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json(
      { error: "Field 'name' is required and must be a non-empty string." },
      { status: 400 },
    );
  }
  const name = body.name.trim();

  // Validate events (optional — empty = all events)
  let events = "";
  if (body.events !== undefined && body.events !== null) {
    if (!Array.isArray(body.events)) {
      return NextResponse.json(
        { error: "Field 'events' must be an array of event type strings." },
        { status: 400 },
      );
    }
    const invalid = body.events.filter(
      (e) => typeof e !== "string" || !ALLOWED_EVENTS.includes(e as typeof ALLOWED_EVENTS[number]),
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid events: ${invalid.join(", ")}. Allowed: ${ALLOWED_EVENTS.join(", ")}.` },
        { status: 400 },
      );
    }
    events = body.events.join(",");
  }

  // Generate the signing secret
  const secret = generateWebhookSecret();

  const endpoint = await db.webhookEndpoint.create({
    data: {
      url,
      name,
      events,
      secret,
      active: true,
      createdById: user.id,
    },
    select: {
      id: true,
      url: true,
      name: true,
      events: true,
      active: true,
      createdAt: true,
    },
  });

  // Return the secret ONCE — the admin must save it now (same UX as API keys)
  return NextResponse.json(
    {
      endpoint,
      secret, // shown once — the admin shares it with the receiver
      message: "Save this secret securely. It will not be shown again.",
    },
    { status: 201 },
  );
}
