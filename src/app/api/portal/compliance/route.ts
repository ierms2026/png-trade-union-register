import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/auth-guard";

// =============================================================================
// GET /api/portal/compliance
// -----------------------------------------------------------------------------
// The Representative role has been removed (D7). This route now returns 403
// for all authenticated users. The portal is no longer accessible.
// =============================================================================

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { error: "This endpoint is for union representatives only." },
    { status: 403 },
  );
}
