"use client";

import { getComplianceStatusLabel, COMPLIANCE_STATUS_CONFIG, VIEW_TITLES, groupDocumentTypesByCategory } from "@/lib/dashboard/vocabulary";
// IA-2: Compare + ConfigureRules are now tabs inside ComplianceView.
import { CompareView } from "@/components/app/views/compare";
import { ConfigureRulesView } from "@/components/app/views/configure-rules";
import { type ComplianceStatus } from "@/lib/dashboard/status-config";
import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, FileQuestion, Ban, FileText, Loader2, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFetch } from "@/components/app/use-fetch";
import { TableSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Legend } from "recharts";

// =============================================================================
// Compliance view — the live compliance matrix.
//
// Shows every union × every document type, with each cell colored by
// its live-computed compliance status. A filter dropdown lets the user
// filter to a specific status (e.g., "show me only OVERDUE cells").
// A legend explains the color coding.
// =============================================================================

interface ComplianceCell {
  documentType: string;
  status: ComplianceStatus;
  documentId: string | null;
  expiresAt: string | null;
}

interface ComplianceRow {
  unionId: string;
  unionName: string;
  status: string;
  scores: ComplianceCell[];
  overallScore: number | null;
}

interface ComplianceMatrixResponse {
  unions: ComplianceRow[];
  documentTypes: string[];
  generatedAt: string;
}

type StatusFilter = "ALL" | "COMPLIANT" | "EXPIRING" | "OVERDUE" | "AWAITING_REVIEW" | "MISSING" | "NOT_APPLICABLE";

// Visual tokens only — labels come from COMPLIANCE_STATUS_CONFIG (single source).
// STEP 6 (polish): WCAG-AA-compliant tailwind color pairs. Matches
// COMPLIANCE_STATUS_CONFIG.cell in vocabulary.ts.
const STATUS_VISUAL: Record<string, { cell: string; dot: string; icon: typeof CheckCircle2 }> = {
  COMPLIANT: { cell: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900", dot: "bg-chart-3", icon: CheckCircle2 },
  EXPIRING: { cell: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900", dot: "bg-chart-4", icon: AlertTriangle },
  OVERDUE: { cell: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900", dot: "bg-destructive", icon: XCircle },
  AWAITING_REVIEW: { cell: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900", dot: "bg-blue-500", icon: Clock },
  MISSING: { cell: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground/40", icon: FileQuestion },
  NOT_APPLICABLE: { cell: "bg-muted/50 text-muted-foreground border-border", dot: "bg-muted-foreground/20", icon: Ban },
};

// IA-2: Compliance view now has tabs: Overview, Compare, Rules.
// - Overview: the existing matrix (this component's original content)
// - Compare: the existing CompareView (no new scoring logic, same /api/compliance)
// - Rules: the existing ConfigureRulesView (registrar only; includes retention periods)
type ComplianceTab = "overview" | "compare" | "rules";

const COMPLIANCE_TAB_LABELS: Record<ComplianceTab, string> = {
  overview: "Overview",
  compare: "Compare",
  rules: "Rules",
};

export function ComplianceView({
  initialFilter,
  initialTab,
  user,
  onNavigate,
}: {
  initialFilter?: string | null;
  initialTab?: string | null;
  user?: { role: string };
  onNavigate?: (view: string, params?: { unionId?: string; unionTab?: string }) => void;
}) {
  // IA-2: tab state. Rules tab is REGISTRAR-only — if a non-registrar
  // lands on ?tab=rules via URL, fall back to overview.
  const isRegistrar = user?.role === "REGISTRAR";
  const validInitialTab: ComplianceTab =
    initialTab === "compare" ? "compare" :
    initialTab === "rules" && isRegistrar ? "rules" :
    "overview";
  const [tab, setTab] = useState<ComplianceTab>(validInitialTab);

  const tabs: ComplianceTab[] = isRegistrar
    ? ["overview", "compare", "rules"]
    : ["overview", "compare"];

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-md border p-1">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              tab === t
                ? "bg-accent/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {COMPLIANCE_TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "overview" && <ComplianceOverviewTab initialFilter={initialFilter} />}
      {tab === "compare" && <CompareView />}
      {tab === "rules" && isRegistrar && <ConfigureRulesView />}
    </div>
  );
}

// =============================================================================
// ComplianceOverviewTab — the original ComplianceView content (matrix,
// charts, legend, filter, generate report). Extracted as a tab component.
// =============================================================================

function ComplianceOverviewTab({ initialFilter }: { initialFilter?: string | null }) {
  const { data, loading, error, refetch } = useFetch<ComplianceMatrixResponse>("/api/compliance");
  const [filter, setFilter] = useState<StatusFilter>(
    (initialFilter as StatusFilter) || "ALL"
  );
  const [generatingReport, setGeneratingReport] = useState(false);

  async function handleGenerateReport() {
    setGeneratingReport(true);
    try {
      const res = await fetch("/api/export/compliance-report", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to generate report.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Compliance report downloaded.");
    } catch {
      toast.error("Network error.");
    } finally {
      setGeneratingReport(false);
    }
  }

  // --- Chart data: union status distribution (donut) ---
  // Uses design-system chart tokens + semantic status colors.
  const STATUS_COLORS: Record<string, string> = {
    ACTIVE: "var(--status-compliant)",
    SUSPENDED: "var(--status-expiring)",
    DEREGISTERED: "var(--status-missing)",
  };
  const unionStatusData = data
    ? Object.entries(
        data.unions.reduce((acc, u) => {
          acc[u.status] = (acc[u.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      ).map(([status, count]) => ({ name: status, value: count, fill: STATUS_COLORS[status] || "var(--status-missing)" }))
    : [];

  // --- Chart data: per-union compliance breakdown (stacked bar) ---
  const COMPLIANCE_COLORS: Record<string, string> = {
    COMPLIANT: "var(--status-compliant)",
    EXPIRING: "var(--status-expiring)",
    OVERDUE: "var(--status-overdue)",
    MISSING: "var(--status-missing)",
    NOT_APPLICABLE: "var(--muted)",
  };
  // Aggregate compliance counts across ALL unions — drives the summary bar chart.
  // This replaces the per-union stacked bar (which didn't scale) with 4 fixed
  // horizontal bars showing the registry-wide status distribution.
  const summaryBarData = data
    ? (() => {
        const totals = { COMPLIANT: 0, EXPIRING: 0, OVERDUE: 0, AWAITING_REVIEW: 0, MISSING: 0 };
        for (const u of data.unions) {
          for (const s of u.scores) {
            if (s.status in totals) totals[s.status as keyof typeof totals]++;
          }
        }
        return [
          { name: COMPLIANCE_STATUS_CONFIG.COMPLIANT.label, count: totals.COMPLIANT, fill: "var(--status-compliant)" },
          { name: COMPLIANCE_STATUS_CONFIG.EXPIRING.label, count: totals.EXPIRING, fill: "var(--status-expiring)" },
          { name: COMPLIANCE_STATUS_CONFIG.OVERDUE.label, count: totals.OVERDUE, fill: "var(--status-overdue)" },
          { name: COMPLIANCE_STATUS_CONFIG.AWAITING_REVIEW.label, count: totals.AWAITING_REVIEW, fill: "var(--status-review)" },
          { name: COMPLIANCE_STATUS_CONFIG.MISSING.label, count: totals.MISSING, fill: "var(--status-missing)" },
        ];
      })()
    : [];

  const summaryBarConfig: ChartConfig = {
    count: { label: "Documents" },
  };

  if (loading) return <TableSkeleton rows={6} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data || data.unions.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No unions to display"
        description="Once unions are registered and documents are filed, the compliance matrix will appear here."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* IA-2: h1 removed — the tab bar above replaces the page heading.
          The breadcrumb still shows "Compliance" for the page title. */}
      <div className="flex items-start justify-end gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateReport}
            disabled={generatingReport}
            className="gap-2"
          >
            {generatingReport ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Generate Report
          </Button>
          <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="COMPLIANT">{COMPLIANCE_STATUS_CONFIG.COMPLIANT.label} only</SelectItem>
            <SelectItem value="EXPIRING">{COMPLIANCE_STATUS_CONFIG.EXPIRING.label} only</SelectItem>
            <SelectItem value="OVERDUE">{COMPLIANCE_STATUS_CONFIG.OVERDUE.label} only</SelectItem>
            <SelectItem value="AWAITING_REVIEW">{COMPLIANCE_STATUS_CONFIG.AWAITING_REVIEW.label} only</SelectItem>
            <SelectItem value="MISSING">{COMPLIANCE_STATUS_CONFIG.MISSING.label} only</SelectItem>
            <SelectItem value="NOT_APPLICABLE">{COMPLIANCE_STATUS_CONFIG.NOT_APPLICABLE.shortLabel} only</SelectItem>
          </SelectContent>
        </Select>
        </div>
      </div>

      {/* Legend — dots only, no text badges. Each item has a tooltip with
          the canonical definition from COMPLIANCE_STATUS_CONFIG (single source
          of truth — same definitions as the Dashboard + the Help glossary). */}
      <div className="flex flex-wrap gap-4">
        {Object.entries(STATUS_VISUAL).map(([status, cfg]) => {
          const statusKey = status as keyof typeof COMPLIANCE_STATUS_CONFIG;
          const definition = COMPLIANCE_STATUS_CONFIG[statusKey]?.definition;
          const label = COMPLIANCE_STATUS_CONFIG[statusKey]?.label ?? status;
          return (
            <TooltipProvider key={status} delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex cursor-help items-center gap-2 text-xs">
                    <span className={`h-3 w-3 rounded-full ${cfg.dot}`} />
                    <span className="text-muted-foreground">{label}</span>
                  </div>
                </TooltipTrigger>
                {definition && (
                  <TooltipContent side="bottom" className="max-w-xs">
                    {definition}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Union status distribution — donut */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Union Status</CardTitle>
            <CardDescription>Distribution of union registration statuses.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ value: { label: "Unions" } }} className="h-[200px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                <Pie
                  data={unionStatusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {unionStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="mt-2 space-y-1 text-xs">
              {unionStatusData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.fill }} />
                  <span className="text-muted-foreground">{d.name}:</span>
                  <span className="font-medium">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Compliance Summary — 4 horizontal bars showing aggregate counts.
            Fixed size (always 4 bars) regardless of how many unions exist.
            Replaces the per-union stacked bar that didn't scale. */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Compliance Summary</CardTitle>
            <CardDescription>Aggregate document status across all unions.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={summaryBarConfig} className="h-[240px] w-full">
              <BarChart data={summaryBarData} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 13, fontWeight: 500 }}
                  width={90}
                  interval={0}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {summaryBarData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Unions × Document Types</CardTitle>
          <CardDescription>
            Generated at {new Date(data.generatedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              {/* IA-3: category super-header row — groups columns by category.
                  Each category header spans the number of types in it. */}
              <tr className="border-b">
                <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[200px]" rowSpan={2}>
                  Union
                </th>
                {groupDocumentTypesByCategory(data.documentTypes).map((cat) => (
                  <th
                    key={cat.label}
                    colSpan={cat.documentTypes.length}
                    className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l border-border"
                    title={cat.description}
                  >
                    {cat.label}
                  </th>
                ))}
                <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[80px]" rowSpan={2}>
                  Score
                </th>
              </tr>
              <tr className="border-b">
                {groupDocumentTypesByCategory(data.documentTypes).flatMap((cat) =>
                  cat.documentTypes.map((dt) => (
                    <th key={dt} className="px-2 py-3 text-center font-medium min-w-[100px]">
                      <span className="block text-xs leading-tight">{dt}</span>
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {data.unions.map((row) => (
                <tr key={row.unionId} className="border-b hover:bg-muted/30 hover:shadow-[inset_2px_0_0_0_oklch(0.74_0.15_85)]">
                  <td className="sticky left-0 z-10 bg-card px-4 py-3">
                    <p className="font-medium">{row.unionName}</p>
                    <p className="text-xs text-muted-foreground">{getComplianceStatusLabel(row.status as ComplianceStatus)}</p>
                  </td>
                  {row.scores.map((cell) => {
                    const cfg = STATUS_VISUAL[cell.status];
                    const dimmed = filter !== "ALL" && cell.status !== filter;
                    // WCAG 1.4.1 (Use of Color): the cell color is no longer the
                    // sole status indicator — the STATUS_VISUAL icon (check, X,
                    // alert, clock, etc.) gives a non-color cue. The aria-label
                    // gives screen readers a textual name for the cell so the
                    // matrix is navigable without sight.
                    const Icon = cfg.icon;
                    return (
                      <td key={cell.documentType} className="px-3 py-3 text-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              role="img"
                              aria-label={`${row.unionName} — ${cell.documentType}: ${getComplianceStatusLabel(cell.status)}`}
                              className={`inline-flex h-7 w-7 cursor-help items-center justify-center rounded-full border ${cfg.cell} ${dimmed ? "opacity-25" : ""}`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[220px]">
                            <div className="space-y-0.5 text-left">
                              <p className="font-semibold">{row.unionName}</p>
                              <p className="text-primary-foreground/80">{cell.documentType}</p>
                              <p className="text-primary-foreground/80">Status: {getComplianceStatusLabel(cell.status)}</p>
                              {cell.expiresAt && (
                                <p className="text-primary-foreground/80">
                                  Expires: {new Date(cell.expiresAt).toLocaleDateString()}
                                </p>
                              )}
                              {cell.documentId && (
                                <p className="text-primary-foreground/60">
                                  Document ID: {cell.documentId.slice(0, 8)}…
                                </p>
                              )}
                              {cell.status === "MISSING" && (
                                <p className="text-primary-foreground/60 italic">
                                  No document filed for this type.
                                </p>
                              )}
                              {cell.status === "NOT_APPLICABLE" && (
                                <p className="text-primary-foreground/60 italic">
                                  This document type is not required for this union.
                                </p>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center">
                    {row.overallScore === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Badge variant={row.overallScore >= 80 ? "default" : row.overallScore >= 50 ? "secondary" : "destructive"}>
                        {row.overallScore}%
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
