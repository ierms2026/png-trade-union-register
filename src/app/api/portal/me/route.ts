import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";

// =============================================================================
// GET /api/portal/me
// -----------------------------------------------------------------------------
// Returns the rep's assigned union info (id, name, registrationNo, status).
// Used by the PortalShell to render the union badge in the header.
//
// AUTH: REPRESENTATIVE only. Other roles get 403 (they belong on the staff
// app, not here). Unauthenticated gets 401.
// =============================================================================

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "REPRESENTATIVE") {
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

  const union = await db.union.findUnique({
    where: { id: user.assignedUnionId },
    select: {
      id: true,
      unionName: true,
      registrationNo: true,
      status: true,
    },
  });

  if (!union) {
    // The assigned union was deleted. This shouldn't happen (FK is plain
    // String, no cascade) but defensive — return a clear error.
    return NextResponse.json(
      { error: "Assigned union not found. Contact the Registrar." },
      { status: 404 },
    );
  }

  return NextResponse.json({ union });
}
