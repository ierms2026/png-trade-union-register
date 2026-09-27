import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";
import {
  checkRateLimit,
  rateLimitedResponse,
  rateLimitHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { extractSnippet } from "@/lib/search/search-utils";

// =============================================================================
// GET /api/search?q=...
// -----------------------------------------------------------------------------
// Chunk 6: Full-text search across all document contents.
//
// Searches the DocumentVersion.textContent field using SQLite's LIKE operator
// (ASCII case-insensitive). Returns matching documents with a snippet of the
// matching text (~150 chars centered on the first match, with ellipses).
//
// AUTH: Any authenticated role. Role-based scoping:
//   - REGISTRAR + INSPECTOR → search across ALL unions' documents
//   - OFFICER + REPRESENTATIVE → scoped to their assigned union only
//     (same pattern as /api/tasks — see chunk 5)
//
// RATE LIMIT: 30 queries/min per user (search bucket). X-RateLimit-* headers
// on every response so polite clients can self-throttle.
//
// RESPONSE SHAPE:
//   {
//     results: [{
//       documentId, documentType, unionId, unionName,
//       versionNumber, versionId, fileName, snippet, uploadedAt
//     }],
//     count: number,
//     query: string
//   }
//
// The `snippet` is a ~150-char excerpt with the query highlighted (the
// frontend uses highlightMatches() to render <mark> tags). Each result also
// includes the `versionId` so the frontend can construct a download URL.
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Rate limit: 30/min per user ---------------------------------------
  const rl = checkRateLimit(
    "search",
    user.id,
    RATE_LIMITS.search.max,
    RATE_LIMITS.search.windowMs,
  );
  if (!rl.allowed) {
    return rateLimitedResponse(rl);
  }
  const rlHeaders = rateLimitHeaders(rl);

  const url = new URL(req.url);
  const query = url.searchParams.get("q") || "";

  if (query.trim().length < 2) {
    return NextResponse.json(
      { error: "Search query must be at least 2 characters." },
      { status: 400, headers: rlHeaders },
    );
  }

  const trimmedQuery = query.trim();

  // --- Build the WHERE clause --------------------------------------------
  // SQLite LIKE is case-insensitive for ASCII by default (matches our
  // highlightMatches() behavior). For non-ASCII (Unicode) content, LIKE is
  // case-sensitive — but this registry's documents are English-only.
  //
  // WHITESPACE FLEXIBILITY (chunk 7): OCR output + pdftotext -layout both
  // insert line breaks at word-wrap boundaries. A search for "secret ballot"
  // should match text containing "secret\nballot" (line-wrapped). We replace
  // spaces in the query with "%" so LIKE matches any characters between words
  // (including newlines, tabs, multiple spaces).
  //
  // Example: "secret ballot" → Prisma contains("secret%ballot") →
  // SQL LIKE '%secret%ballot%' matches:
  //   - "secret ballot" (single space)
  //   - "secret\nballot" (line break — common in OCR output)
  //   - "secret  ballot" (double space)
  //   - "secret \n ballot" (space + newline + space)
  //
  // NOTE: we don't escape LIKE special chars (%, _) in the query because
  // SQLite LIKE has no default escape character + Prisma's `contains`
  // doesn't expose an ESCAPE clause. A literal "%" in the query would act
  // as a wildcard — acceptable for an authed search endpoint (users rarely
  // search for literal %, and the worst case is a slightly broader match).
  const whitespaceFlexibleQuery = trimmedQuery.replace(/\s+/g, "%");
  const whereClause: Record<string, unknown> = {
    textContent: { contains: whitespaceFlexibleQuery },
    // Exclude disposed documents — they're "gone from active views" per the
    // codebase's own comment in calculator.ts. The Document row stays for
    // audit history, but search shouldn't surface it.
    document: { disposedAt: null },
  };

  // Role-based scoping:
  //   REGISTRAR + INSPECTOR → all unions
  //   OFFICER + REPRESENTATIVE → their assigned union only
  const isUnionScopedRole = user.role === Role.OFFICER || user.role === Role.REPRESENTATIVE;
  if (isUnionScopedRole && user.assignedUnionId) {
    (whereClause.document as Record<string, unknown>).unionId = user.assignedUnionId;
  }

  // --- Search DocumentVersion rows with matching textContent -------------
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
          reviewStatus: true,
          union: {
            select: { id: true, unionName: true, registrationNo: true },
          },
        },
      },
    },
    orderBy: { uploadedAt: "desc" },
    take: 50, // Cap at 50 results
  });

  // --- Build result array with snippets ----------------------------------
  const results = versions.map((v) => {
    const { snippet, matchStart, matchLength } = extractSnippet(
      v.textContent || "",
      trimmedQuery,
    );
    return {
      documentId: v.document.id,
      documentType: v.document.documentType,
      unionId: v.document.union.id,
      unionName: v.document.union.unionName,
      registrationNo: v.document.union.registrationNo,
      reviewStatus: v.document.reviewStatus,
      versionId: v.id,
      versionNumber: v.versionNumber,
      fileName: v.fileName,
      snippet,
      matchStart,
      matchLength,
      uploadedAt: v.uploadedAt.toISOString(),
    };
  });

  return NextResponse.json(
    {
      results,
      count: results.length,
      query: trimmedQuery,
    },
    { headers: rlHeaders },
  );
}
