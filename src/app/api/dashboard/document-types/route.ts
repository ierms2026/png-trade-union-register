import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";

// =============================================================================
// GET /api/dashboard/document-types
// -----------------------------------------------------------------------------
// Returns the count of documents grouped by documentType — powers the
// "Documents by Type" donut chart on the Dashboard.
//
// Returns: [{ documentType: "Constitution", count: 4 }, ...]
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Count documents per type, excluding disposed docs
  const documents = await db.document.findMany({
    where: { disposedAt: null },
    select: { documentType: true },
  });

  // Aggregate counts in JS (simpler than raw SQL groupBy for SQLite)
  const counts = new Map<string, number>();
  for (const doc of documents) {
    counts.set(doc.documentType, (counts.get(doc.documentType) || 0) + 1);
  }

  // Convert to array sorted by count descending
  const result = Array.from(counts.entries())
    .map(([documentType, count]) => ({ documentType, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    documentTypes: result,
    total: documents.length,
  });
}
