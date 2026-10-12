"use client";

import { useState, useEffect, useMemo, Fragment, type FormEvent } from "react";
import {
  Search, Loader2, FileText, Building2, AlertCircle, XCircle,
  ChevronLeft, ChevronRight, Filter,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFetch } from "@/components/app/use-fetch";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { Highlight } from "@/components/app/highlight";
import { REVIEW_STATUS_CONFIG, groupDocumentTypesByCategory } from "@/lib/dashboard/vocabulary";

// =============================================================================
// SearchView — full-text search with filters + pagination.
//
// Renders at /?view=search. Shows:
//   - Search bar (pre-filled from URL ?q=)
//   - Filter dropdowns: Union, Document Type, Review Status
//   - Result count + query echo
//   - Result cards with snippet highlighting
//   - Pagination controls (Previous / page numbers / Next)
//
// URL-AWARENESS:
//   All state (query, filters, page) is synced to the URL so refresh,
//   Back/Forward, and sharing all work:
//     ?view=search&q=ballot&union=ID&documentType=Constitution&reviewStatus=APPROVED&page=2
//
//   The query input updates local state immediately (responsive UX). The
//   URL is pushed when the user clicks "Search" or changes a filter/page.
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
  count: number;      // results on this page
  total: number;      // total matching across all pages
  page: number;
  limit: number;
  totalPages: number;
  query: string;
}

interface Union {
  id: string;
  unionName: string;
  registrationNo: string;
}

interface UnionsResponse {
  unions: Union[];
}

interface ComplianceResponse {
  documentTypes: string[];
}

const PAGE_SIZE = 20;

// =============================================================================
// Read initial state from the URL (lazy initializer — avoids setState-in-effect
// + avoids a flash of the wrong state on first render).
// =============================================================================

function readInitialState() {
  if (typeof window === "undefined") {
    return { q: "", union: "all", documentType: "all", reviewStatus: "all", page: 1 };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") ?? "",
    union: params.get("union") ?? "all",
    documentType: params.get("documentType") ?? "all",
    reviewStatus: params.get("reviewStatus") ?? "all",
    page: Math.max(1, parseInt(params.get("page") || "1", 10) || 1),
  };
}

export function SearchView() {
  // --- Initialize state from the URL (lazy) -------------------------------
  const initial = readInitialState();
  const [inputValue, setInputValue] = useState(initial.q);
  const [submittedQuery, setSubmittedQuery] = useState(initial.q);
  const [unionFilter, setUnionFilter] = useState(initial.union);
  const [typeFilter, setTypeFilter] = useState(initial.documentType);
  const [statusFilter, setStatusFilter] = useState(initial.reviewStatus);
  const [page, setPage] = useState(initial.page);

  // --- Fetch unions + document types for the filter dropdowns -------------
  // Same pattern as the Documents view: fetch the union list + the
  // compliance matrix (for document types). These are lightweight payloads.
  const { data: unionsData } = useFetch<UnionsResponse>("/api/unions");
  const { data: complianceData } = useFetch<ComplianceResponse>("/api/compliance");
  const unions = unionsData?.unions ?? [];
  const documentTypes = complianceData?.documentTypes ?? [];

  // --- Build the API query string -----------------------------------------
  // The API is fetched whenever submittedQuery or any filter/page changes.
  const shouldFetch = submittedQuery.trim().length >= 2;
  const apiQuery = useMemo(() => {
    if (!shouldFetch) return null;
    const params = new URLSearchParams();
    params.set("q", submittedQuery.trim());
    if (unionFilter !== "all") params.set("union", unionFilter);
    if (typeFilter !== "all") params.set("documentType", typeFilter);
    if (statusFilter !== "all") params.set("reviewStatus", statusFilter);
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    return `/api/search?${params.toString()}`;
  }, [shouldFetch, submittedQuery, unionFilter, typeFilter, statusFilter, page]);

  const { data, loading, error, refetch } = useFetch<SearchResponse>(apiQuery);

  // --- Listen for Back/Forward + pushState --------------------------------
  // When the URL changes (browser Back/Forward), re-read all params + update
  // state. This keeps the view in sync with the URL.
  useEffect(() => {
    function handleUrlChange() {
      const params = new URLSearchParams(window.location.search);
      if (params.get("view") !== "search") return;
      const state = readInitialState();
      setInputValue(state.q);
      setSubmittedQuery(state.q);
      setUnionFilter(state.union);
      setTypeFilter(state.documentType);
      setStatusFilter(state.reviewStatus);
      setPage(state.page);
    }
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("urlchange", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("urlchange", handleUrlChange);
    };
  }, []);

  // --- Push the current state to the URL ----------------------------------
  // Called by "Search" submit, filter changes, and page changes. Builds a
  // fresh URL with all params, then pushes it.
  function pushToUrl(overrides: { q?: string; union?: string; documentType?: string; reviewStatus?: string; page?: number }) {
    const q = overrides.q ?? submittedQuery;
    const union = overrides.union ?? unionFilter;
    const documentType = overrides.documentType ?? typeFilter;
    const reviewStatus = overrides.reviewStatus ?? statusFilter;
    const newPage = overrides.page ?? page;
    const url = new URL(window.location.origin + "/");
    url.searchParams.set("view", "search");
    if (q.trim()) url.searchParams.set("q", q.trim());
    if (union !== "all") url.searchParams.set("union", union);
    if (documentType !== "all") url.searchParams.set("documentType", documentType);
    if (reviewStatus !== "all") url.searchParams.set("reviewStatus", reviewStatus);
    if (newPage > 1) url.searchParams.set("page", String(newPage));
    window.history.pushState({}, "", url.toString());
  }

  // --- Handlers -----------------------------------------------------------
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = inputValue.trim();
    if (q.length < 2) return;
    setSubmittedQuery(q);
    setPage(1); // reset to page 1 on a new search
    pushToUrl({ q, page: 1 });
  }

  function handleClear() {
    setInputValue("");
    setSubmittedQuery("");
    // Keep filters when clearing the query — the user might want to re-search
    // within the same filter context. Just clear ?q= + ?page=.
    setPage(1);
    const url = new URL(window.location.origin + "/");
    url.searchParams.set("view", "search");
    if (unionFilter !== "all") url.searchParams.set("union", unionFilter);
    if (typeFilter !== "all") url.searchParams.set("documentType", typeFilter);
    if (statusFilter !== "all") url.searchParams.set("reviewStatus", statusFilter);
    window.history.pushState({}, "", url.toString());
  }

  function handleUnionChange(value: string) {
    setUnionFilter(value);
    setPage(1);
    pushToUrl({ union: value, page: 1 });
  }

  function handleTypeChange(value: string) {
    setTypeFilter(value);
    setPage(1);
    pushToUrl({ documentType: value, page: 1 });
  }

  function handleStatusChange(value: string) {
    setStatusFilter(value);
    setPage(1);
    pushToUrl({ reviewStatus: value, page: 1 });
  }

  function handleClearFilters() {
    setUnionFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
    setPage(1);
    pushToUrl({ union: "all", documentType: "all", reviewStatus: "all", page: 1 });
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    pushToUrl({ page: newPage });
    // Scroll to top of results so the user sees the new page
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const hasFilters = unionFilter !== "all" || typeFilter !== "all" || statusFilter !== "all";
  const results = data?.results ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const currentPage = data?.page ?? page;

  // --- Pagination render helpers ------------------------------------------
  function renderPageNumbers() {
    const pages: (number | "...")[] = [];
    const maxVisible = 5; // max page numbers shown at once
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      // Always show page 1, the current page ± 1, and the last page.
      // Insert "..." where there's a gap.
      pages.push(1);
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      if (start > 2) pages.push("...");
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }

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

      {/* Filters */}
      {shouldFetch && (
        <Fragment>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>Filters:</span>
          </div>
          {/* Union filter */}
          <div className="w-48">
            <Select value={unionFilter} onValueChange={handleUnionChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All unions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All unions</SelectItem>
                {unions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.unionName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Document type filter — IA-3: grouped by category */}
          <div className="w-48">
            <Select value={typeFilter} onValueChange={handleTypeChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {groupDocumentTypesByCategory(documentTypes).map((cat) => (
                  <SelectGroup key={cat.label}>
                    <SelectLabel>{cat.label}</SelectLabel>
                    {cat.documentTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Review status filter */}
          <div className="w-40">
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="PENDING">Pending Review</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Clear filters */}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-9">
              Clear filters
            </Button>
          )}
        </div>

        {/* IA-3: category chips — quick-filter by document-type category. */}
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground">Categories:</span>
          {groupDocumentTypesByCategory(documentTypes).map((cat) => {
            const isCategoryActive = cat.documentTypes.includes(typeFilter);
            return (
              <button
                key={cat.label}
                type="button"
                onClick={() => {
                  if (isCategoryActive) {
                    setTypeFilter("all");
                  } else if (cat.documentTypes.length > 0) {
                    setTypeFilter(cat.documentTypes[0]);
                  }
                }}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  isCategoryActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </Fragment>
      )}

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
          {/* Result count + pagination info */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{total}</span> result{total === 1 ? "" : "s"} for{" "}
              <span className="font-medium text-foreground">&ldquo;{submittedQuery}&rdquo;</span>
              {total > 0 && (
                <span className="ml-1">
                  · Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)}
                </span>
              )}
            </p>
          </div>

          {/* Result cards */}
          <div className="space-y-3">
            {results.map((r) => (
              <ResultCard key={`${r.documentId}-${r.versionId}`} result={r} query={submittedQuery} />
            ))}
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              {renderPageNumbers().map((p, i) =>
                p === "..." ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-sm text-muted-foreground">...</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(p)}
                    className="min-w-[2.5rem]"
                  >
                    {p}
                  </Button>
                ),
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
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
              href={`/?view=document-detail&id=${result.documentId}`}
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
// =============================================================================

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
