import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";

// =============================================================================
// GET /api/search?q=...
// -----------------------------------------------------------------------------
// Full-text search across all document contents.
//
// Searches the DocumentVersion.textContent field using SQLite's LIKE operator.
// Returns matching documents with the union name, document type, and a
// snippet of the matching text (100 chars around the first match).
//
// AUTH: Any authenticated role. Officer scoping applies (only their union's
// documents are searchable).
//
// Returns:
//   {
//     results: [{
//       documentId, documentType, unionId, unionName,
//       versionNumber, fileName, snippet, uploadedAt
//     }],
//     count: number
//   }
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const query = url.searchParams.get("q") || "";

  if (query.trim().length < 2) {
    return NextResponse.json(
      { error: "Search query must be at least 2 characters." },
      { status: 400 },
    );
  }

  // Build the WHERE clause for text content search
  // SQLite LIKE is case-insensitive for ASCII by default
  const whereClause: Record<string, unknown> = {
    textContent: { contains: query.trim() },
  };

  // Officer scoping — only search their union's documents
  if (user.role === Role.OFFICER && user.assignedUnionId) {
    whereClause.document = { unionId: user.assignedUnionId };
  }

  // Search DocumentVersion rows with matching textContent
  const versions = await db.documentVersion.findMany({
    where: whereClause,
    select: {
      id: true,
      versionNumber: true,
      fileName: true,
      textContent: true,
      uploadedAt: true,
      document: {
        select: {
          id: true,
          documentType: true,
          union: {
            select: { id: true, unionName: true },
          },
        },
      },
    },
    orderBy: { uploadedAt: "desc" },
    take: 50, // Cap at 50 results
  });

  // Build result array with snippets
  const results = versions.map((v) => {
    const text = v.textContent || "";
    const matchIndex = text.toLowerCase().indexOf(query.toLowerCase());

    // Extract a snippet: 50 chars before + 100 chars after the match
    let snippet = "";
    if (matchIndex >= 0) {
      const start = Math.max(0, matchIndex - 50);
      const end = Math.min(text.length, matchIndex + query.length + 100);
      snippet = (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
    }

    return {
      documentId: v.document.id,
      documentType: v.document.documentType,
      unionId: v.document.union.id,
      unionName: v.document.union.unionName,
      versionNumber: v.versionNumber,
      fileName: v.fileName,
      snippet,
      uploadedAt: v.uploadedAt.toISOString(),
    };
  });

  return NextResponse.json({
    results,
    count: results.length,
    query,
  });
}
