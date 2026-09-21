import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";

// =============================================================================
// GET /api/notifications
// -----------------------------------------------------------------------------
// Lists unread notifications for the current user.
//
// The notification bell in the app shell polls this endpoint on mount
// (and could poll on an interval in a future enhancement). The response
// is small (just unread count + the notifications themselves) so it's
// cheap to call frequently.
//
// RESPONSE SHAPE:
//   {
//     notifications: [
//       { id, type, title, body, linkUrl, createdAt },
//       ...
//     ],
//     unreadCount: number
//   }
//
// UNREAD = readAt IS NULL:
//   We filter on `readAt: null` so only unread notifications come back.
//   Once a notification is marked read (via /api/notifications/[id]/read),
//   it disappears from this list.
// =============================================================================

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  // Fetch unread notifications (capped at 50 for the dropdown display)
  const notifications = await db.notification.findMany({
    where: {
      userId: user.id,
      readAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      linkUrl: true,
      createdAt: true,
    },
  });

  // Separate count query for the TRUE unread count (not capped at 50).
  // The bell badge needs the actual total, not the capped list length.
  const trueUnreadCount = await db.notification.count({
    where: {
      userId: user.id,
      readAt: null,
    },
  });

  const serialized = notifications.map((n) => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
  }));

  return NextResponse.json({
    notifications: serialized,
    unreadCount: trueUnreadCount,
  });
}
