import { NextRequest, NextResponse } from "next/server";
import { staffLinkUrl } from "@/lib/dashboard/vocabulary";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { ContactUpdateStatus, Role, Severity, NotificationType } from "@prisma/client";
import { createNotificationForUsers } from "@/lib/notifications";

// =============================================================================
// POST /api/portal/contact/requests
// -----------------------------------------------------------------------------
// Chunk 5: Rep submits a contact-info update request. The request enters
// PENDING state — Registrar approves/rejects from the staff Reviews view.
//
// ONLY the four allowed fields are accepted:
//   address, contactPerson, contactEmail, contactPhone
//
// All are optional (a rep can update just one field). The request row
// stores NULL for fields the rep didn't change — the approval route applies
// only non-null values to the Union row.
//
// ONE PENDING REQUEST AT A TIME: if the rep already has a PENDING request,
// this endpoint returns 409 with the existing request's id. The rep must
// wait for the Registrar to act on it (or contact the Registrar to withdraw).
// This prevents a pile-up of overlapping requests.
//
// NOTIFICATION: on submission, all Registrars get a TASK notification
// ("Union X submitted a contact-info update for review"). Same pattern as
// document uploads.
//
// AUDIT: an INFO entry is written (action: "contact_update_request_submitted").
// =============================================================================

interface CreateRequestBody {
  address?: unknown;
  contactPerson?: unknown;
  contactEmail?: unknown;
  contactPhone?: unknown;
}

const ALLOWED_FIELDS = ["address", "contactPerson", "contactEmail", "contactPhone"] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== Role.REPRESENTATIVE) {
    return NextResponse.json(
      { error: "This endpoint is for union representatives only." },
      { status: 403 },
    );
  }
  if (!user.assignedUnionId) {
    return NextResponse.json(
      { error: "No assigned union. Contact the Registrar." },
      { status: 400 },
    );
  }

  // --- 1. Parse + validate body -------------------------------------------
  let body: CreateRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  // Validate each field — must be string or null. Empty strings are
  // treated as null (no change requested for that field).
  const updates: Record<AllowedField, string | null> = {
    address: null,
    contactPerson: null,
    contactEmail: null,
    contactPhone: null,
  };
  for (const field of ALLOWED_FIELDS) {
    const v = body[field];
    if (v === undefined) continue; // field not in payload → no change requested
    if (!isStringOrNull(v)) {
      return NextResponse.json(
        { error: `Field '${field}' must be a string or null.` },
        { status: 400 },
      );
    }
    if (v === null || v.trim().length === 0) {
      updates[field] = null;
    } else {
      updates[field] = v.trim();
    }
  }

  // Reject if ALL fields are null (no-op request).
  const hasAnyChange = Object.values(updates).some((v) => v !== null);
  if (!hasAnyChange) {
    return NextResponse.json(
      { error: "No changes requested. Provide at least one field to update." },
      { status: 400 },
    );
  }

  // --- 2. Check for existing PENDING request ------------------------------
  const existing = await db.contactUpdateRequest.findFirst({
    where: { unionId: user.assignedUnionId, status: ContactUpdateStatus.PENDING },
    select: { id: true, createdAt: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error:
          "You already have a pending contact-update request. Wait for the Registrar to review it before submitting another.",
        existingRequestId: existing.id,
        existingRequestCreatedAt: existing.createdAt,
      },
      { status: 409 },
    );
  }

  // --- 3. Create the request ----------------------------------------------
  const [union, request] = await db.$transaction(async (tx) => {
    const u = await tx.union.findUnique({
      where: { id: user.assignedUnionId! },
      select: { unionName: true, registrationNo: true },
    });
    if (!u) {
      throw new Error("Union not found");
    }
    const r = await tx.contactUpdateRequest.create({
      data: {
        unionId: user.assignedUnionId!,
        requestedById: user.id,
        address: updates.address,
        contactPerson: updates.contactPerson,
        contactEmail: updates.contactEmail,
        contactPhone: updates.contactPhone,
        status: ContactUpdateStatus.PENDING,
      },
    });
    return [u, r] as const;
  });

  // --- 4. Side effects: notify Registrars + audit log ---------------------
  // Best-effort — failure here doesn't roll back the request creation.
  try {
    const registrars = await db.user.findMany({
      where: { role: Role.REGISTRAR, disabled: false },
      select: { id: true },
    });
    const changedFields = ALLOWED_FIELDS.filter((f) => updates[f] !== null);
    for (const registrar of registrars) {
      await createNotificationForUsers([registrar.id], {
        type: NotificationType.TASK,
        title: `${union.unionName}: contact-info update requested`,
        body: `A union representative submitted a contact-info update for ${union.unionName} (${union.registrationNo}). Fields changed: ${changedFields.join(", ")}. Review it in the Contact Update Requests queue.`,
        dedupKey: `contact-update:${request.id}:${registrar.id}`,
        linkUrl: staffLinkUrl("contact-requests"),
      });
    }
    await db.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.email,
        action: "contact_update_request_submitted",
        entityType: "ContactUpdateRequest",
        entityId: request.id,
        afterJson: JSON.stringify({
          unionId: user.assignedUnionId,
          unionName: union.unionName,
          changedFields,
          requestId: request.id,
        }),
        severity: Severity.INFO,
      },
    });
  } catch (sideEffectErr) {
    console.error("[portal/contact/requests] Side-effect failed:", sideEffectErr);
  }

  return NextResponse.json(
    {
      requestId: request.id,
      status: request.status,
      createdAt: request.createdAt,
      changes: updates,
    },
    { status: 201 },
  );
}
