"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { ScrollText, Search, ChevronDown, ChevronRight, Filter, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useFetch } from "@/components/app/use-fetch";
import { TableSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";

// =============================================================================
// Audit view — filterable table with expandable before/after JSON diff.
//
// URL-AWARE FILTERS:
//   All filter state (?entityType, ?action, ?actor, ?startDate, ?endDate,
//   ?page) is synced to the URL. This means:
//     - Refresh keeps the filters (the URL is read on mount)
//     - Back/Forward preserves the filters (popstate re-reads the URL)
//     - Sharing a URL reproduces the exact filtered view
//     - Bookmarks work (the URL captures the full filter state)
//
// The filter INPUTS update local state immediately (for responsive UX). The
// URL is only pushed when the user clicks "Apply filters" or "Clear" — so
// typing in a filter box doesn't create a history entry per keystroke.
//
// Page changes (Previous/Next) push to the URL immediately — each page is
// a history entry, so Back returns to the previous page.
// =============================================================================

interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  severity: string;
  createdAt: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  INFO: "bg-primary/10 text-primary",
  WARNING: "bg-accent/20 text-accent-foreground",
  CRITICAL: "bg-destructive/10 text-destructive",
};

function formatJson(json: string | null): string {
  if (!json) return "—";
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

/** Read audit filter state from the URL search params. */
function readAuditFiltersFromUrl(urlParams: URLSearchParams) {
  return {
    entityType: urlParams.get("entityType") ?? "",
    action: urlParams.get("action") ?? "",
    actor: urlParams.get("actor") ?? "",
    startDate: urlParams.get("startDate") ?? "",
    endDate: urlParams.get("endDate") ?? "",
    page: parseInt(urlParams.get("page") ?? "1", 10) || 1,
  };
}

/** Read the initial filter state from the URL (for lazy useState initializer). */
function readInitialAuditFilters() {
  if (typeof window === "undefined") {
    return { entityType: "", action: "", actor: "", startDate: "", endDate: "", page: 1 };
  }
  return readAuditFiltersFromUrl(new URLSearchParams(window.location.search));
}

export function AuditView() {
  // --- Initialize filter state from the URL on mount -----------------------
  // We use lazy initializers (useState(() => ...)) to read the URL on the
  // FIRST render only. This avoids the "setState in effect" anti-pattern
  // + avoids a flash of the default filters before the URL is read.
  //
  // This makes refresh + shared links reproduce the exact filtered view:
  //   /?view=audit&action=user_login  →  action filter pre-filled
  //   /?view=audit&page=3             →  starts on page 3
  const initial = readInitialAuditFilters();
  const [entityType, setEntityType] = useState(initial.entityType);
  const [action, setAction] = useState(initial.action);
  const [actor, setActor] = useState(initial.actor);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [page, setPage] = useState(initial.page);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // --- Listen for Back/Forward + pushState ---------------------------------
  // When the URL changes (via browser Back/Forward, or another component
  // pushing a new URL), re-read the audit filter params and update state.
  // This keeps the view in sync with the URL — the URL is the source of
  // truth.
  useEffect(() => {
    function handleUrlChange() {
      const urlParams = new URLSearchParams(window.location.search);
      // Only react if we're still on the audit view. If the URL changed
      // to a different view, this component is about to unmount — skip
      // the state update to avoid an unnecessary refetch.
      const view = urlParams.get("view");
      if (view !== "audit") return;
      const filters = readAuditFiltersFromUrl(urlParams);
      setEntityType(filters.entityType);
      setAction(filters.action);
      setActor(filters.actor);
      setStartDate(filters.startDate);
      setEndDate(filters.endDate);
      setPage(filters.page);
    }
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("urlchange", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("urlchange", handleUrlChange);
    };
  }, []);

  const limit = 20;

  // Build the API query string from the current filter state.
  const params = new URLSearchParams();
  if (entityType) params.set("entityType", entityType);
  if (action) params.set("action", action);
  if (actor) params.set("actor", actor);
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  params.set("page", String(page));
  params.set("limit", String(limit));

  const { data, loading, error, refetch } = useFetch<{ entries: AuditEntry[]; total: number; page: number; limit: number }>(
    `/api/audit?${params.toString()}`,
  );

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  // --- Push the current filter state to the URL ----------------------------
  // Called by "Apply filters" + "Clear". Builds a URL with ?view=audit +
  // all non-empty filter params, then pushes it. The pushState monkey-patch
  // in page.tsx dispatches `urlchange`, which triggers our listener above —
  // but since the state already matches, it's a no-op.
  const pushFiltersToUrl = useCallback(() => {
    const url = new URL(window.location.origin + "/");
    url.searchParams.set("view", "audit");
    if (entityType) url.searchParams.set("entityType", entityType);
    if (action) url.searchParams.set("action", action);
    if (actor) url.searchParams.set("actor", actor);
    if (startDate) url.searchParams.set("startDate", startDate);
    if (endDate) url.searchParams.set("endDate", endDate);
    if (page > 1) url.searchParams.set("page", String(page));
    window.history.pushState({}, "", url.toString());
  }, [entityType, action, actor, startDate, endDate, page]);

  function handleFilterSubmit(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    // Push to URL after page is set to 1. We use a setTimeout(0) to ensure
    // the state update has flushed before reading it in pushFiltersToUrl.
    // (React batches state updates; the pushFiltersToUrl callback reads
    // the current state via its dependency array, so it will have the
    // updated page=1 on the next render. But we want to push NOW, not on
    // the next render. So we defer to the next tick.)
    setTimeout(() => pushFiltersToUrl(), 0);
  }

  function handleClear() {
    setEntityType(""); setAction(""); setActor(""); setStartDate(""); setEndDate(""); setPage(1);
    // Push a clean ?view=audit URL (no filter params).
    setTimeout(() => {
      const url = new URL(window.location.origin + "/");
      url.searchParams.set("view", "audit");
      window.history.pushState({}, "", url.toString());
    }, 0);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    // Push the new page to the URL immediately — each page is a history
    // entry, so Back returns to the previous page.
    setTimeout(() => pushFiltersToUrl(), 0);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit</h1>
          <p className="text-sm text-muted-foreground">
            Complete record of all system actions. Filterable by entity, action, actor, and date range.
          </p>
        </div>
        <a href={`/api/export/audit?entityType=${encodeURIComponent(entityType)}&action=${encodeURIComponent(action)}&actor=${encodeURIComponent(actor)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" className="gap-2">
            <FileDown className="h-4 w-4" />
            Export CSV
          </Button>
        </a>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleFilterSubmit} className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="entityType" className="text-xs">Entity Type</Label>
              <Input id="entityType" value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="User, Union, ..." />
            </div>
            <div className="space-y-1">
              <Label htmlFor="action" className="text-xs">Action</Label>
              <Input id="action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="user_create, ..." />
            </div>
            <div className="space-y-1">
              <Label htmlFor="actor" className="text-xs">Actor</Label>
              <Input id="actor" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="email or System" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="startDate" className="text-xs">Start Date</Label>
              <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate" className="text-xs">End Date</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="flex items-end gap-2 md:col-span-3 lg:col-span-5">
              <Button type="submit" size="sm">
                <Search className="mr-2 h-4 w-4" />
                Apply filters
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleClear}>
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <TableSkeleton rows={8} />
      ) : error ? (
        <ErrorState description={error} onRetry={refetch} />
      ) : data && data.entries.length > 0 ? (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} of {data.total} entries
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
                Previous
              </Button>
              <span className="flex items-center px-2 text-xs">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>
                Next
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="hidden grid-cols-[160px_1fr_160px_120px_100px_24px] items-center gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
                <span>Timestamp</span><span>Actor</span><span>Action</span><span>Entity</span><span className="text-center">Severity</span><span />
              </div>
              <div className="divide-y">
                {data.entries.map((entry) => (
                  <div key={entry.id}>
                    <button className="grid w-full grid-cols-[160px_1fr_160px_120px_100px_24px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 border-l-2 border-solid border-l-transparent hover:border-l-accent" onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                      <span className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{entry.actorName}</p><p className="truncate text-xs text-muted-foreground lg:hidden">{entry.action} · {entry.entityType}</p></div>
                      <span className="hidden truncate text-sm text-muted-foreground lg:inline">{entry.action}</span>
                      <span className="hidden truncate text-sm text-muted-foreground lg:inline">{entry.entityType}</span>
                      <span className="hidden justify-self-center lg:flex lg:justify-center"><Badge variant="outline" className={`text-xs ${SEVERITY_COLORS[entry.severity] ?? ""}`}>{entry.severity}</Badge></span>
                      <span className="hidden justify-self-end text-muted-foreground lg:block">{expandedId === entry.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
                    </button>
                    {expandedId === entry.id && (
                      <div className="grid gap-4 border-t bg-muted/20 px-4 py-4 md:grid-cols-2">
                        <div><p className="mb-2 text-xs font-medium text-muted-foreground">BEFORE</p><pre className="overflow-x-auto rounded bg-card p-3 text-xs">{formatJson(entry.beforeJson)}</pre></div>
                        <div><p className="mb-2 text-xs font-medium text-muted-foreground">AFTER</p><pre className="overflow-x-auto rounded bg-card p-3 text-xs">{formatJson(entry.afterJson)}</pre></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : data ? (
        <EmptyState
          icon={ScrollText}
          title="No audit entries found"
          description="Try adjusting your filters, or clear them to see all entries."
        />
      ) : null}
    </div>
  );
}
