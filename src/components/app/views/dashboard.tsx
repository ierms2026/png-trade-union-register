"use client";

import { Building2, FileText, CheckCircle2, AlertTriangle, XCircle, FileQuestion, Activity, Plus, Upload, ListTodo, ScrollText, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFetch } from "@/components/app/use-fetch";
import { StatsSkeleton, ActivitySkeleton, CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { type LucideIcon } from "lucide-react";
import { STATUS_CONFIG, getTileStatuses, COMPLIANCE_STATUSES, type ComplianceStatus } from "@/lib/dashboard/status-config";
import { type ComplianceCounts, getRequiredVsOnFileByType, sumOnFile, type RequiredVsOnFileEntry, NEEDS_ATTENTION_CAP, getUnionDocMatrix, type UnionDocMatrix, type ComplianceCell, type UnionSummary } from "@/lib/dashboard/metrics";
import { formatDueDate, formatAbsolute } from "@/lib/dashboard/date-utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

// =============================================================================
// Dashboard view — the landing page for authenticated users.
//
// Shows:
//   - 6 stat cards (unions, documents, compliant, expiring, overdue, missing)
//   - Compliance summary (overall rate + breakdown)
//   - Recent activity feed (latest 20 audit log entries)
//
// Each section loads independently — the stats fetch and the activity
// fetch are separate, so a slow activity endpoint doesn't block the
// stats from rendering.
// =============================================================================

interface NeedsAttentionItem {
  unionId: string;
  unionName: string;
  documentType: string;
  status: string;
  expiryDate: string;
}

interface StatsResponse {
  totalUnions: number;
  activeCount: number;
  compliance: {
    compliant: number;
    expiring: number;
    overdue: number;
    missing: number;
    notApplicable: number;
    overallRate: number;
    rate: {
      numerator: number;
      denominator: number;
      percentage: number;
    };
  };
  needsAttention: NeedsAttentionItem[];
}

interface ActivityEntry {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  severity: string;
  createdAt: string;
}

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs">{label}</CardDescription>
          <div className={`rounded-md p-1.5 ${color}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

interface LollipopDatum {
  name: string;
  value: number;
  fill: string;
}

function LollipopChart({ data }: { data: LollipopDatum[] }) {
  if (data.length === 0) return null;
  const maxValue = Math.max(...data.map((d) => d.value));
  const chartMax = Math.max(maxValue + 1, 5);
  const STEM_AREA_WIDTH_PCT = 72;
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => {
        const stemPct = (d.value / chartMax) * STEM_AREA_WIDTH_PCT;
        return (
          <div key={`${d.name}-${i}`} className="flex items-center gap-3">
            <span className="shrink-0 truncate text-xs text-muted-foreground" style={{ width: "28%" }} title={d.name}>
              {d.name}
            </span>
            <div className="relative flex-1" style={{ height: "16px" }}>
              <div className="absolute top-1/2 -translate-y-1/2 rounded-full bg-muted" style={{ width: `${STEM_AREA_WIDTH_PCT}%`, height: "2px" }} />
              <div className="absolute top-1/2 -translate-y-1/2 rounded-full" style={{ width: `${stemPct}%`, height: "2px", backgroundColor: d.fill, opacity: 0.5 }} />
              <div className="absolute top-1/2 -translate-y-1/2 rounded-full border-2 border-background" style={{ left: `calc(${stemPct}% - 7px)`, width: "14px", height: "14px", backgroundColor: d.fill, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }} />
              <span className="absolute top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ left: `calc(${stemPct}% + 12px)`, color: d.fill }}>
                {d.value}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// ComplianceCompositionBar — 100% stacked horizontal bar showing the
// proportional composition of compliance statuses (Compliant / Expiring /
// Overdue / Missing). Replaces the deleted Compliance Status Distribution
// tiles card (chunk 1.3). Uses canonical counts from DashboardMetrics.
//
// Per 1.3 handoff: counts inside this bar's segments are an ACCEPTED
// second appearance of the quartet — they add context. Do not remove KPI
// band counts.
//
// Segment + legend entries are clickable → onFilterCompliance (which
// routes through navigateToComplianceFilter from the 1.3 helper).
// Keyboard: each element is a <button> (focusable, Enter/Space activates).
// Screen readers: visually-hidden list provides full text reading.
// =============================================================================

interface ComplianceCompositionBarProps {
  counts: ComplianceCounts;
  denominator: number;
  totalUnions: number;
  onFilter?: (status: string) => void;
}

function ComplianceCompositionBar({ counts, denominator, totalUnions, onFilter }: ComplianceCompositionBarProps) {
  const tiles = getTileStatuses();

  // Edge: zero denominator → "No requirements configured"
  if (denominator === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Document Compliance Composition</CardTitle>
          <CardDescription>Compliance status breakdown across all unions.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No requirements configured.</p>
        </CardContent>
      </Card>
    );
  }

  // Denominator mismatch guard: sum of applicable counts must equal denominator
  const sum = counts.COMPLIANT + counts.EXPIRING + counts.OVERDUE + counts.MISSING;
  if (sum !== denominator) {
    console.error(
      `[ComplianceCompositionBar] Denominator mismatch: sum of counts (${sum}) != denominator (${denominator}). Not rendering.`,
    );
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Document Compliance Composition</CardTitle>
          <CardDescription>Compliance status breakdown across all unions.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Data inconsistency detected. Please refresh.</p>
        </CardContent>
      </Card>
    );
  }

  // Segments: only non-zero counts render as visible bar segments.
  // Zero-count statuses are omitted from the bar but still appear in the legend.
  const segments = tiles
    .map((status) => ({
      status,
      config: STATUS_CONFIG[status],
      count: counts[status],
      widthPct: (counts[status] / denominator) * 100,
    }))
    .filter((s) => s.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Document Compliance Composition</CardTitle>
        <CardDescription>
          {denominator} required documents across {totalUnions} unions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Visually-hidden screen reader list — full text reading in one pass */}
        <ul className="sr-only">
          {tiles.map((status) => (
            <li key={status}>
              {counts[status]} of {denominator} {STATUS_CONFIG[status].label}
            </li>
          ))}
        </ul>

        {/* Stacked bar: flex row of proportional segments */}
        <TooltipProvider delayDuration={0}>
          <div className="flex h-8 w-full overflow-hidden rounded-lg" role="group" aria-label="Compliance status composition">
            {segments.map((seg) => (
              <Tooltip key={seg.status}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${seg.config.label}: ${seg.count}`}
                    onClick={() => onFilter?.(seg.status)}
                    disabled={!onFilter}
                    className="flex h-full items-center justify-center transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-default"
                    style={{
                      flexBasis: `${seg.widthPct}%`,
                      backgroundColor: seg.config.colorToken,
                    }}
                  >
                    {/* Count inside segment: show only if the segment is wide enough
                        (roughly > 8% of the bar — enough for a 2-digit number) */}
                    {seg.widthPct > 8 && (
                      <span className="text-xs font-semibold text-white mix-blend-difference">
                        {seg.count}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="max-w-xs text-xs">
                    <span className="font-medium">{seg.config.label}: {seg.count}</span>
                    <br />
                    {seg.config.definition}
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>

        {/* Legend row: all 4 statuses including zero-count, clickable */}
        <div className="flex flex-wrap gap-3">
          {tiles.map((status) => {
            const config = STATUS_CONFIG[status];
            const count = counts[status];
            return (
              <TooltipProvider key={status} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${config.label}: ${count}`}
                      onClick={() => onFilter?.(status)}
                      disabled={!onFilter}
                      className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-all hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: config.colorToken }}
                      />
                      <span className="text-muted-foreground">{config.label}</span>
                      <span className="font-medium">{count}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="max-w-xs text-xs">{config.definition}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// RequiredVsOnFileMeters — one meter row per required document type showing
// on-file vs required. Replaces the lollipop chart (chunk 2.2).
//
// Each row: type label + meter track (fill = onFile/required) + text
// "X of Y on file" + "· Z missing" (highlighted using Missing color token).
// Sorted by missing DESC, ties by type name ASC (from the metrics selector).
//
// NOT interactive in this chunk — drill-through deferred to 4.1.
// =============================================================================

function RequiredVsOnFileMeters({
  onFileByType,
  requiredTypes,
  totalUnions,
}: {
  onFileByType: Array<{ documentType: string; count: number }>;
  requiredTypes: string[];
  totalUnions: number;
}) {
  const entries = getRequiredVsOnFileByType(onFileByType, requiredTypes, totalUnions);
  const totalOnFile = sumOnFile(entries);
  const missingColor = STATUS_CONFIG.MISSING.colorToken;

  // Guard: required = 0 for a configured type → omit row + log loudly
  const validEntries = entries.filter((e) => {
    if (e.required === 0) {
      console.error(
        `[RequiredVsOnFileMeters] Type "${e.documentType}" has required=0. Omitting row.`,
      );
      return false;
    }
    if (e.onFile > e.required) {
      console.error(
        `[RequiredVsOnFileMeters] Type "${e.documentType}" has onFile (${e.onFile}) > required (${e.required}). Data inconsistency — rendering without clamping.`,
      );
    }
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Required vs On-File by Type</CardTitle>
        <CardDescription>
          On file vs required across {requiredTypes.length} document types.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5" aria-label="Required vs on-file by document type">
          {validEntries.map((entry) => {
            const fillPct = entry.required > 0 ? (entry.onFile / entry.required) * 100 : 0;
            return (
              <li
                key={entry.documentType}
                aria-label={`${entry.documentType}: ${entry.onFile} of ${entry.required} on file${entry.missing > 0 ? `, ${entry.missing} missing` : ""}`}
                className="space-y-1"
              >
                <div className="flex items-baseline justify-between text-xs">
                  <span className="truncate font-medium" title={entry.documentType}>
                    {entry.documentType}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {entry.onFile} of {entry.required} on file
                    {entry.missing > 0 && (
                      <span style={{ color: missingColor }} className="ml-1 font-medium">
                        · {entry.missing} missing
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(fillPct, 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          {totalOnFile} on file across {requiredTypes.length} types.
        </p>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// NeedsAttentionPanel — "what needs action today": every Overdue and
// Expiring document, most urgent first, with direct links.
//
// Data comes from stats.needsAttention (extracted from the compliance
// matrix by the stats API route). The selector getNeedsAttention() lives
// in the metrics module; the API route uses it to sort. The component
// receives pre-sorted data and only renders.
//
// Rows are NOT interactive in this chunk beyond the link — drill-through
// filtering is deferred to 4.1.
// =============================================================================

function NeedsAttentionPanel({
  items,
  total,
  onNavigate,
}: {
  items: NeedsAttentionItem[];
  total: number;
  onNavigate?: (view: string) => void;
}) {
  const now = new Date();
  const visibleItems = items.slice(0, NEEDS_ATTENTION_CAP);
  const hasMore = total > NEEDS_ATTENTION_CAP;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Needs Attention</CardTitle>
        <CardDescription>Overdue and expiring documents across all unions.</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing needs attention — all required documents are compliant or not yet due.
          </p>
        ) : (
          <>
            <ul className="space-y-2" aria-label="Documents needing attention">
              {visibleItems.map((item, index) => {
                const statusKey = item.status as ComplianceStatus;
                const config = STATUS_CONFIG[statusKey];
                const Icon = config.icon;
                const expiryDate = new Date(item.expiryDate);
                return (
                  <li
                    key={`${item.unionId}-${item.documentType}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon
                        className="h-4 w-4 shrink-0"
                        style={{ color: config.colorToken }}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.documentType}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.unionName}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDueDate(expiryDate, now)}
                      </span>
                      <a
                        href={`/unions/${item.unionId}`}
                        className="text-xs font-medium text-primary hover:underline"
                        aria-label={`View ${item.documentType} for ${item.unionName}`}
                      >
                        View
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
            {hasMore && (
              <div className="mt-3 border-t pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate?.("compliance")}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all {total}
                </button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// ComplianceHeatmap — a color-coded grid (unions × doc types) rendering
// the matrix from 3.2a's selector. Keyboard-navigable with roving tabindex,
// tooltip-explained cells, sticky union-name column.
//
// Cell links: all cells link to /unions/{unionId} (the most specific
// existing route). The union detail page shows documents — the user can
// then find the specific document. No direct document-detail route exists
// (gap logged in handoff for 4.1).
// =============================================================================

interface ComplianceHeatmapProps {
  matrix: UnionDocMatrix;
}

function ComplianceHeatmap({ matrix }: ComplianceHeatmapProps) {
  const now = new Date();

  // Empty state: no unions
  if (matrix.rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compliance Matrix</CardTitle>
          <CardDescription>Union × document type compliance status.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No unions registered.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Compliance Matrix</CardTitle>
        <CardDescription>
          {matrix.rows.length} unions × {matrix.columnTypes.length} document types.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Grid with sticky union column + horizontal scroll */}
        <div className="overflow-x-auto">
          <div role="grid" aria-label="Compliance matrix" className="inline-block min-w-full">
            {/* Column headers */}
            <div role="row" className="flex">
              <div className="sticky left-0 z-20 w-32 shrink-0 bg-card px-2 py-1 text-xs font-medium text-muted-foreground" />
              {matrix.columnTypes.map((docType) => (
                <div
                  key={docType}
                  className="w-16 shrink-0 px-1 py-1 text-center text-[10px] font-medium leading-tight text-muted-foreground"
                  title={docType}
                >
                  {docType.length > 12 ? docType.slice(0, 10) + "…" : docType}
                </div>
              ))}
            </div>

            {/* Body rows */}
            {matrix.rows.map((row, rowIdx) => (
              <div key={row.unionId} role="row" className="flex">
                {/* Sticky union name */}
                <div className="sticky left-0 z-10 flex w-32 shrink-0 items-center bg-card px-2 py-1">
                  <span className="truncate text-xs font-medium" title={row.unionName}>
                    {row.unionName}
                  </span>
                </div>
                {/* Cells */}
                {row.cells.map((cell, colIdx) => {
                  const config = STATUS_CONFIG[cell.status];
                  const isNotRequired = cell.status === "NOT_APPLICABLE";
                  const hasDueDate = cell.dueDate !== null;
                  const accessibleName = `${row.unionName} — ${matrix.columnTypes[colIdx]}: ${config.label}${hasDueDate ? `, due ${formatAbsolute(cell.dueDate!)}` : ""}${cell.status === "MISSING" ? ". No document on file." : ""}`;

                  return (
                    <TooltipProvider key={colIdx} delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={`/unions/${row.unionId}`}
                            role="gridcell"
                            tabIndex={-1} // roving tabindex — only one cell is tabbable at a time via JS
                            aria-label={accessibleName}
                            className="m-0.5 flex h-8 w-16 shrink-0 items-center justify-center rounded transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                            style={{
                              backgroundColor: config.colorToken,
                              opacity: isNotRequired ? 0.3 : 1,
                              backgroundImage: isNotRequired
                                ? "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(128,128,128,0.15) 3px, rgba(128,128,128,0.15) 6px)"
                                : undefined,
                            }}
                            data-row={rowIdx}
                            data-col={colIdx}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-xs">
                            <span className="font-medium">{row.unionName}</span> — {matrix.columnTypes[colIdx]}
                            <br />
                            <span style={{ color: config.colorToken }}>{config.label}</span>: {config.definition}
                            {hasDueDate && (
                              <>
                                <br />
                                Due: {formatDueDate(cell.dueDate!, now)}
                              </>
                            )}
                            {cell.status === "MISSING" && (
                              <>
                                <br />
                                No document on file.
                              </>
                            )}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend — all statuses including zero-count, labels only */}
        <div className="mt-3 flex flex-wrap gap-2">
          {COMPLIANCE_STATUSES.map((status) => (
            <div key={status} className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: STATUS_CONFIG[status].colorToken }}
              />
              <span className="text-xs text-muted-foreground">{STATUS_CONFIG[status].label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  INFO: "bg-primary/10 text-primary",
  WARNING: "bg-accent/20 text-accent-foreground",
  CRITICAL: "bg-destructive/10 text-destructive",
};

const ACTION_LABELS: Record<string, string> = {
  user_login: "signed in",
  user_login_2fa: "signed in (2FA)",
  user_logout: "signed out",
  user_create: "created user",
  user_update: "updated user",
  user_delete: "deleted user",
  user_unlock: "unlocked user",
  user_reset_2fa: "reset 2FA for user",
  user_2fa_enable: "enabled 2FA",
  user_2fa_disable: "disabled 2FA",
  union_update: "updated union",
  compliance_rule_edit: "edited compliance rule",
  api_key_create: "created API key",
  api_key_revoke: "revoked API key",
  retention_dispose: "disposed document",
  retention_snooze: "snoozed disposal",
  document_upload: "uploaded document",
  document_review_approve: "approved document",
  document_review_reject: "rejected document",
  document_restore: "restored document version",
  document_download: "downloaded document",
  document_text_extracted: "extracted text from document",
  document_tamper_detected: "TAMPER DETECTED on document",
  legal_hold_placed: "placed legal hold on document",
  legal_hold_lifted: "lifted legal hold on document",
  disposition_scheduled: "scheduled disposition (14-day cooldown)",
  disposition_cancelled: "cancelled disposition",
  disposition_executed: "EXECUTED disposition — document destroyed",
  disposition_blocked_legal_hold: "disposition blocked by legal hold",
  task_create: "created task",
  task_update: "updated task",
  task_delete: "deleted task",
  session_revoke: "revoked session",
};

export function DashboardView({ user, onNavigate, onFilterCompliance }: {
  user: { role: "REGISTRAR" | "INSPECTOR" | "OFFICER" };
  onNavigate?: (view: string) => void;
  onFilterCompliance?: (status: string) => void;
}) {
  const {
    data: stats,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useFetch<StatsResponse>("/api/dashboard/stats");

  const {
    data: activityData,
    loading: activityLoading,
    error: activityError,
    refetch: refetchActivity,
  } = useFetch<{ activity: ActivityEntry[] }>("/api/dashboard/activity");

  const {
    data: docTypesData,
    loading: docTypesLoading,
    error: docTypesError,
    refetch: refetchDocTypes,
  } = useFetch<{
    documentTypes: Array<{ documentType: string; count: number }>;
    total: number;
    requiredTypes: string[];
    totalUnions: number;
  }>("/api/dashboard/document-types");

  // --- Fetch the full compliance matrix for the heatmap ---
  // The /api/compliance endpoint returns the live matrix with per-cell
  // status, documentId, and expiresAt. We map it to ComplianceCell[] for
  // the getUnionDocMatrix selector.
  const {
    data: complianceMatrixData,
    loading: complianceMatrixLoading,
  } = useFetch<{
    unions: Array<{
      unionId: string;
      unionName: string;
      status: string;
      scores: Array<{
        documentType: string;
        status: ComplianceStatus;
        documentId: string | null;
        expiresAt: string | null;
      }>;
    }>;
    documentTypes: string[];
  }>("/api/compliance");

  // --- Canonical compliance counts from the stats response ---
  // Maps the API's lowercase keys to the canonical ComplianceCounts shape
  // (uppercase, matching STATUS_CONFIG). This is a field mapping, not
  // an aggregation — the counts come from the API route, not computed here.
  const counts: ComplianceCounts | null = stats
    ? {
        COMPLIANT: stats.compliance.compliant,
        EXPIRING: stats.compliance.expiring,
        OVERDUE: stats.compliance.overdue,
        MISSING: stats.compliance.missing,
        NOT_APPLICABLE: stats.compliance.notApplicable,
      }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of the union registry and compliance status.
        </p>
      </div>

      {/* Quick Actions — role-gated per NAV_ITEMS in app-shell.tsx */}
      {onNavigate && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(user.role === "REGISTRAR" || user.role === "INSPECTOR") && (
            <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => onNavigate("unions")}>
              <Plus className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium">Register Union</span>
            </Button>
          )}
          {(user.role === "REGISTRAR" || user.role === "OFFICER") && (
            <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => onNavigate(user.role === "OFFICER" ? "my-union" : "unions")}>
              <Upload className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium">Upload Document</span>
            </Button>
          )}
          {(user.role === "REGISTRAR" || user.role === "OFFICER") && (
            <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => onNavigate("tasks")}>
              <ListTodo className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium">Create Task</span>
            </Button>
          )}
          {(user.role === "REGISTRAR" || user.role === "INSPECTOR") && (
            <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => onNavigate("audit")}>
              <ScrollText className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium">View Audit Log</span>
            </Button>
          )}
        </div>
      )}

      {/* Stat cards */}
      {statsLoading ? (
        <StatsSkeleton />
      ) : statsError ? (
        <ErrorState description={statsError} onRetry={refetchStats} />
      ) : stats ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Unions" value={stats.totalUnions} icon={Building2} color="bg-primary/10 text-primary" />
          <StatCard label="Documents" value={stats.activeCount} icon={FileText} color="bg-primary/10 text-primary" />
          {getTileStatuses().map((status) => (
            <StatCard
              key={status}
              label={STATUS_CONFIG[status].label}
              value={counts![status]}
              icon={STATUS_CONFIG[status].icon}
              color={
                status === "COMPLIANT" ? "bg-chart-3/20 text-chart-3" :
                status === "EXPIRING" ? "bg-accent/20 text-accent-foreground" :
                status === "OVERDUE" ? "bg-destructive/10 text-destructive" :
                "bg-muted text-muted-foreground"
              }
            />
          ))}
        </div>
      ) : null}

      {/* Needs Attention panel — temporary placement below KPI band.
          Final placement is chunk 6.1's responsibility. */}
      {stats && (
        <NeedsAttentionPanel
          items={stats.needsAttention || []}
          total={stats.needsAttention?.length || 0}
          onNavigate={onNavigate}
        />
      )}

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Compliance composition bar — fills the slot vacated by the deleted
            Compliance Status Distribution tiles (chunk 1.3). */}
        {stats && counts && (
          <ComplianceCompositionBar
            counts={counts}
            denominator={stats.compliance.rate.denominator}
            totalUnions={stats.totalUnions}
            onFilter={onFilterCompliance}
          />
        )}

        {/* Required vs On-File meters — replaces the lollipop chart (chunk 2.2) */}
        {docTypesLoading ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Required vs On-File by Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[240px] animate-pulse rounded-md bg-muted" />
            </CardContent>
          </Card>
        ) : docTypesError ? (
          <ErrorState description={docTypesError} onRetry={refetchDocTypes} />
        ) : docTypesData && docTypesData.requiredTypes && docTypesData.requiredTypes.length > 0 ? (
          <RequiredVsOnFileMeters
            onFileByType={docTypesData.documentTypes}
            requiredTypes={docTypesData.requiredTypes}
            totalUnions={docTypesData.totalUnions}
          />
        ) : null}
      </div>

      {/* Compliance Matrix heatmap — temporary placement below the charts row.
          Final placement is chunk 6.1's responsibility. */}
      {!complianceMatrixLoading && complianceMatrixData && (() => {
        // Map the /api/compliance response to ComplianceCell[] for the selector.
        // This is a pure field mapping — no aggregation or status derivation here.
        const cells: ComplianceCell[] = complianceMatrixData.unions.flatMap((row) =>
          row.scores.map((score) => ({
            unionId: row.unionId,
            documentType: score.documentType,
            status: score.status,
            filedAt: null,
            expiryDate: score.expiresAt ? new Date(score.expiresAt) : null,
            documentId: score.documentId,
          })),
        );
        const unions: UnionSummary[] = complianceMatrixData.unions.map((u) => ({
          id: u.unionId,
          name: u.unionName,
          registrationNo: u.status,
          status: u.status as "ACTIVE" | "SUSPENDED" | "DEREGISTERED",
        }));
        const matrix = getUnionDocMatrix(cells, unions, complianceMatrixData.documentTypes);
        return <ComplianceHeatmap matrix={matrix} />;
      })()}

      {/* Compliance summary + Recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Compliance summary */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Compliance Summary</CardTitle>
              <CardDescription>Live compliance status across all unions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">Overall Compliance Rate</p>
                {stats.compliance.rate.denominator === 0 ? (
                  <p className="mt-1 text-xl font-bold text-muted-foreground">No requirements configured</p>
                ) : (
                  <>
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded text-left"
                            aria-label={`${stats.compliance.rate.numerator} of ${stats.compliance.rate.denominator} required documents compliant. ${stats.compliance.rate.percentage} percent.`}
                          >
                            <p className="text-xl font-bold">
                              {stats.compliance.rate.numerator} of {stats.compliance.rate.denominator} required ({stats.compliance.rate.percentage}%)
                            </p>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="max-w-xs text-xs">
                            Percentage of required documents currently compliant. Required = registered unions × required document types.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{ width: `${stats.compliance.rate.percentage}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent activity */}
        {activityLoading ? (
          <ActivitySkeleton />
        ) : activityError ? (
          <ErrorState description={activityError} onRetry={refetchActivity} />
        ) : activityData && activityData.activity.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>Latest actions across the system.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
              {activityData.activity.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {entry.actorName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate">
                      <span className="font-medium">{entry.actorName}</span>{" "}
                      <span className="text-muted-foreground">
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${SEVERITY_COLORS[entry.severity] ?? ""}`}
                  >
                    {entry.severity}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : activityData ? (
          <Card>
            <CardContent className="py-6">
              <EmptyState
                icon={Activity}
                title="No recent activity"
                description="System actions will appear here as users interact with the registry."
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
