"use client";

import { useState, type FormEvent } from "react";
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
// FILTERS:
//   - entityType, action, actor, startDate, endDate
//   - Pagination via page + limit
//
// EXPANDABLE ROWS:
//   Each row has a expand/collapse toggle. When expanded, shows the
//   beforeJson + afterJson side-by-side for diff inspection.
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

export function AuditView() {
  // Filter state
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const limit = 20;

  // Build the query string
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

  function handleFilterSubmit(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    refetch();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
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
              <Button type="button" variant="outline" size="sm" onClick={() => {
                setEntityType(""); setAction(""); setActor(""); setStartDate(""); setEndDate(""); setPage(1);
              }}>
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
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="flex items-center px-2 text-xs">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
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
