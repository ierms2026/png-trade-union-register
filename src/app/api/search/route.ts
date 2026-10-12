import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, ReviewStatus } from "@prisma/client";
import {
  checkRateLimit,
  rateLimitedResponse,
  rateLimitHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { extractSnippet } from "@/lib/search/search-utils";
import { getUnionScope } from "@/lib/auth/union-scope";

// =============================================================================
// GET /api/search?q=...&union=ID&documentType=X&reviewStatus=Y&page=N&limit=M
// -----------------------------------------------------------------------------
// Full-text search across all document contents, with filters + pagination.
//
// FILTERS:
//   ?union=ID           — restrict to a specific union (by union ID)
//   ?documentType=X     — restrict to a specific document type (e.g.
//                         "Constitution", "Financial Return")
//   ?reviewStatus=Y     — restrict to a review status (PENDING / APPROVED /
//                         REJECTED). Case-insensitive.
//
// PAGINATION:
//   ?page=N   — 1-indexed page number (default 1)
//   ?limit=M  — results per page (default 20, max 50)
//
// Searches the DocumentVersion.textContent field using SQLite's LIKE operator
// (ASCII case-insensitive). Returns matching documents with a snippet of the
// matching text (~150 chars centered on the first match, with ellipses).
//
// AUTH: Any authenticated role. Role-based scoping:
//   - REGISTRAR + INSPECTOR → search across ALL unions' documents
//   - OFFICER → scoped to their assigned union only. The ?union= filter
//     is IGNORED for OFFICERs (they can only search their own union).
//     (REPRESENTATIVE was removed in D7; OFFICER is the only union-scoped
//     staff role.)
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
//     count: number,         // results on THIS page
//     total: number,         // total matching results across all pages
//     page: number,          // current page (1-indexed)
//     limit: number,         // page size
//     totalPages: number,    // ceil(total / limit)
//     query: string
//   }
//
// The `snippet` is a ~150-char excerpt with the query highlighted (the
// frontend uses highlightMatches() to render <mark> tags). Each result also
// includes the `versionId` so the frontend can construct a download URL.
// =============================================================================

/** Default results per page. */
const DEFAULT_LIMIT = 20;
/** Maximum results per page (prevents a user from requesting limit=10000). */
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope = getUnionScope({ role: user.role, assignedUnionId: user.assignedUnionId });
  if (scope.kind === "none") {
    return NextResponse.json({ error: "Forbidden: your account is not assigned to a union." }, { status: 403 });
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
  const unionFilter = url.searchParams.get("union"); // union ID
  const documentTypeFilter = url.searchParams.get("documentType");
  const reviewStatusFilter = url.searchParams.get("reviewStatus");

  // Pagination params
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));

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
  const documentWhere: Record<string, unknown> = {
    disposedAt: null,
  };

  // --- Apply filters ------------------------------------------------------
  // Role-based scoping:
  //   REGISTRAR + INSPECTOR → all unions (the ?union= filter is honored)
  //   OFFICER → their assigned union only (the ?union= filter is IGNORED
  //   — they can only search their own union)
  if (scope.kind === "union") {
    documentWhere.unionId = scope.unionId;
  } else if (unionFilter) {
    // Registrar/Inspector: honor the ?union= filter if set.
    documentWhere.unionId = unionFilter;
  }

  // Document type filter
  if (documentTypeFilter) {
    documentWhere.documentType = documentTypeFilter;
  }

  // Review status filter (validate against the Prisma enum)
  if (reviewStatusFilter) {
    const upperStatus = reviewStatusFilter.toUpperCase();
    if (Object.values(ReviewStatus).includes(upperStatus as ReviewStatus)) {
      documentWhere.reviewStatus = upperStatus;
    }
  }

  // IA-3: search across document content (textContent), document type
  // (documentType), and file name (fileName). The OR clause matches any of
  // the three; the document-level where (scoping + filters) is ANDed on top.
  const whereClause: Record<string, unknown> = {
    OR: [
      { textContent: { contains: whitespaceFlexibleQuery } },
      { fileName: { contains: whitespaceFlexibleQuery } },
      { document: { ...documentWhere, documentType: { contains: whitespaceFlexibleQuery } } },
    ],
    document: documentWhere,
  };

  // --- Get total count (for pagination) ----------------------------------
  // We need the total matching count to compute totalPages + show
  // "Showing 1–20 of 150 results". This is a separate count query —
  // Prisma's findMany with skip/take doesn't return the total.
  const total = await db.documentVersion.count({ where: whereClause });

  // --- Search DocumentVersion rows with matching textContent -------------
  const skip = (page - 1) * limit;
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
    skip,
    take: limit,
  });

  // --- Build result array with snippets ----------------------------------
  // IA-3: when the match is on documentType or fileName (not textContent),
  // the extractSnippet won't find it in the text content. In that case we
  // show a synthetic snippet indicating where the match was.
  const results = versions.map((v) => {
    const { snippet, matchStart, matchLength } = extractSnippet(
      v.textContent || "",
      trimmedQuery,
    );
    // If the textContent had no match, check if the match was on documentType
    // or fileName — show a synthetic snippet for those.
    let finalSnippet = snippet;
    let finalMatchStart = matchStart;
    let finalMatchLength = matchLength;
    if (matchLength === 0) {
      const lowerQuery = trimmedQuery.toLowerCase();
      if (v.document.documentType.toLowerCase().includes(lowerQuery)) {
        finalSnippet = `[Document type: ${v.document.documentType}]`;
        finalMatchStart = 16; // position of the type name in the snippet
        finalMatchLength = v.document.documentType.length;
      } else if (v.fileName.toLowerCase().includes(lowerQuery)) {
        finalSnippet = `[File: ${v.fileName}]`;
        finalMatchStart = 7;
        finalMatchLength = v.fileName.length;
      }
    }
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
      snippet: finalSnippet,
      matchStart: finalMatchStart,
      matchLength: finalMatchLength,
      uploadedAt: v.uploadedAt.toISOString(),
    };
  });

  const totalPages = Math.ceil(total / limit);

  return NextResponse.json(
    {
      results,
      count: results.length,
      total,
      page,
      limit,
      totalPages,
      query: trimmedQuery,
    },
    { headers: rlHeaders },
  );
}
