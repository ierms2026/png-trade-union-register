import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";

// =============================================================================
// PATCH /api/notifications/[id]/read
// -----------------------------------------------------------------------------
// Marks a notification as read. Idempotent — calling it on an already-read
// notification returns 200 (no error, no DB write).
//
// OWNERSHIP CHECK:
//   The notification must belong to the current user. We filter the
//   updateMany on BOTH `id` AND `userId` — if the ID belongs to another
//   user, the update affects 0 rows and we return 404 (not 403, to
//   avoid leaking "this notification exists but isn't yours").
//
// IDEMPOTENT:
//   The `where` clause includes `readAt: null` — if the notification is
//   already read, the update affects 0 rows, but we still return 200
//   (the end state — "read" — is the same).
// =============================================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  // Idempotent: only update if readAt is null. The `userId` filter
  // enforces ownership — a notification belonging to another user
  // won't match, so we return 404.
  const result = await db.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  if (result.count === 0) {
    // Either doesn't exist, isn't owned by this user, or is already read.
    // We return 404 to avoid leaking existence/ownership — the caller
    // treats all of these as "nothing to do."
    return NextResponse.json(
      { error: "Notification not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
