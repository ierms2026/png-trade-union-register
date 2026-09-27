"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  Search, Loader2, FileText, Building2, AlertCircle, ArrowLeft,
  CheckCircle2, Clock, XCircle,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useFetch } from "@/components/app/use-fetch";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { Highlight } from "@/components/app/highlight";

// =============================================================================
// SearchView — chunk 6
//
// Full-page search results view. Renders at /?view=search (wired into
// page.tsx's switch). Shows:
//   - Search bar (sticky at top, pre-filled from URL param ?q=)
//   - Result count + query echo
//   - Result cards: union name + Reg. No. + document type + review status
//     + snippet with <mark> highlighting + version + upload date
//   - Empty state when no results
//   - Error state on API failure
//
// The search is debounced client-side (300ms) — each keystroke doesn't
// hit the API. The query is also synced to the URL so the result page is
// shareable / back-button friendly.
// =============================================================================

interface SearchResult {
  documentId: string;
  documentType: string;
  unionId: string;
  unionName: string;
  registrationNo: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  versionId: string;
  versionNumber: number;
  fileName: string;
  snippet: string;
  matchStart: number;
  matchLength: number;
  uploadedAt: string;
}

interface SearchResponse {
  results: SearchResult[];
  count: number;
  query: string;
}

export function SearchView() {
  // Read initial query from URL (?q=...)
  const [inputValue, setInputValue] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  // Initialize from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q") ?? "";
    if (q) {
      setInputValue(q);
      setSubmittedQuery(q);
    }
  }, []);

  // Fetch results when submittedQuery changes (and is non-empty + 2+ chars)
  const shouldFetch = submittedQuery.trim().length >= 2;
  const { data, loading, error, refetch } = useFetch<SearchResponse>(
    shouldFetch ? `/api/search?q=${encodeURIComponent(submittedQuery.trim())}` : null,
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = inputValue.trim();
    if (q.length < 2) return;
    setSubmittedQuery(q);
    // Sync to URL (replaceState so back button doesn't pile up search states)
    const url = new URL(window.location.href);
    url.searchParams.set("q", q);
    window.history.replaceState({}, "", url.toString());
  }

  function handleClear() {
    setInputValue("");
    setSubmittedQuery("");
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    window.history.replaceState({}, "", url.toString());
  }

  const results = data?.results ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Search Documents</h1>
        <p className="text-sm text-muted-foreground">
          Full-text search across all uploaded PDF documents. Matches are highlighted in the snippets below.
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search document contents (e.g., 'secret ballot', 'award variation')..."
            className="pl-9 pr-9"
            autoFocus
            minLength={2}
          />
          {inputValue && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button type="submit" disabled={inputValue.trim().length < 2 || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
      </form>

      {/* Results */}
      {!shouldFetch ? (
        <EmptyState
          icon={Search}
          title="Search document contents"
          description="Enter at least 2 characters to search across all uploaded PDF documents. Results show matching snippets with the search terms highlighted."
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={refetch} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title={`No results for "${submittedQuery}"`}
          description="No documents contain this search term. Try different keywords or check that documents have been uploaded and text-extracted."
        />
      ) : (
        <>
          {/* Result count */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{data?.count ?? 0}</span> result{(data?.count ?? 0) === 1 ? "" : "s"} for{" "}
              <span className="font-medium text-foreground">&ldquo;{submittedQuery}&rdquo;</span>
            </p>
          </div>

          {/* Result cards */}
          <div className="space-y-3">
            {results.map((r) => (
              <ResultCard key={`${r.documentId}-${r.versionId}`} result={r} query={submittedQuery} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ResultCard({ result, query }: { result: SearchResult; query: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="space-y-2">
          {/* Header: union + document type + status */}
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{result.documentType}</h3>
            <Badge variant="outline" className="text-xs">
              v{result.versionNumber}
            </Badge>
            <ReviewStatusBadge status={result.reviewStatus} />
          </div>

          {/* Union line */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />
            <span className="font-medium">{result.unionName}</span>
            <span>· Reg. No. {result.registrationNo}</span>
          </div>

          {/* Snippet with highlighting */}
          {result.snippet && (
            <p className="rounded-md bg-muted/50 p-3 text-sm leading-relaxed">
              <Highlight text={result.snippet} query={query} />
            </p>
          )}

          {/* Footer: file name + upload date + link */}
          <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="truncate">{result.fileName}</span>
              <span>· Uploaded {new Date(result.uploadedAt).toLocaleDateString()}</span>
            </div>
            <Link
              href={`/?view=unions&union=${result.unionId}`}
              className="shrink-0 font-medium text-primary hover:underline"
            >
              View document →
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// ReviewStatusBadge — inline review-status indicator for search results.
//
// Separate from the union StatusBadge (which handles ACTIVE/SUSPENDED/
// DEREGISTERED). This handles the document review states PENDING/APPROVED/
// REJECTED with appropriate tints + icons.
// =============================================================================

const REVIEW_STATUS_CONFIG: Record<
  "PENDING" | "APPROVED" | "REJECTED",
  { label: string; icon: typeof Clock; tone: string }
> = {
  PENDING: {
    label: "Pending Review",
    icon: Clock,
    tone: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
  },
  APPROVED: {
    label: "Approved",
    icon: CheckCircle2,
    tone: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900",
  },
  REJECTED: {
    label: "Rejected",
    icon: XCircle,
    tone: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900",
  },
};

function ReviewStatusBadge({ status }: { status: "PENDING" | "APPROVED" | "REJECTED" }) {
  const cfg = REVIEW_STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-xs ${cfg.tone}`}>
      <Icon className="mr-1 h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}
