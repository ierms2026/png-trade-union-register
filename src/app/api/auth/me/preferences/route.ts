import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";

// =============================================================================
// PATCH /api/auth/me/preferences
// -----------------------------------------------------------------------------
// Self-service notification preferences. The logged-in user can toggle
// their own email/SMS/WhatsApp notification settings + update their phone
// number. No admin access needed — each user controls their own prefs.
//
// REQUEST BODY (all fields optional — only included fields are updated):
//   {
//     emailNotificationsEnabled?: boolean,
//     phone?: string | null,         — E.164 format (e.g. +67512345678)
//     smsNotificationsEnabled?: boolean,
//     whatsappNotificationsEnabled?: boolean
//   }
//
// RESPONSE:
//   200 with the updated preferences (all 4 fields)
//
// SECURITY:
//   - The user can only update THEIR OWN preferences (userId from session).
//   - No admin escalation — can't change role, email, disabled, etc.
// =============================================================================

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Build update data — only allow notification-preference fields
  const updateData: Record<string, unknown> = {};

  if (typeof body.emailNotificationsEnabled === "boolean") {
    updateData.emailNotificationsEnabled = body.emailNotificationsEnabled;
  }
  if (typeof body.smsNotificationsEnabled === "boolean") {
    updateData.smsNotificationsEnabled = body.smsNotificationsEnabled;
  }
  if (typeof body.whatsappNotificationsEnabled === "boolean") {
    updateData.whatsappNotificationsEnabled = body.whatsappNotificationsEnabled;
  }
  // Phone: accept string (E.164) or null (to clear)
  if (body.phone !== undefined) {
    if (body.phone === null || (typeof body.phone === "string" && body.phone.trim().length > 0)) {
      updateData.phone = body.phone === null ? null : body.phone.trim();
      // Clear phoneVerifiedAt when phone changes — re-verification needed
      if (body.phone !== null) {
        updateData.phoneVerifiedAt = null;
      }
    } else if (typeof body.phone === "string" && body.phone.trim().length === 0) {
      updateData.phone = null;
      updateData.phoneVerifiedAt = null;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid preference fields provided." }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: updateData,
    select: {
      emailNotificationsEnabled: true,
      phone: true,
      phoneVerifiedAt: true,
      smsNotificationsEnabled: true,
      whatsappNotificationsEnabled: true,
    },
  });

  return NextResponse.json(updated);
}

// GET — return current preferences (for the Account Security UI to load)
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const prefs = await db.user.findUnique({
    where: { id: user.id },
    select: {
      emailNotificationsEnabled: true,
      phone: true,
      phoneVerifiedAt: true,
      smsNotificationsEnabled: true,
      whatsappNotificationsEnabled: true,
    },
  });

  if (!prefs) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json(prefs);
}
