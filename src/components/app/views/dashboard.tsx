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
import { STATUS_CONFIG, getTileStatuses, type ComplianceStatus } from "@/lib/dashboard/status-config";
import { type ComplianceCounts } from "@/lib/dashboard/metrics";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  } = useFetch<{ documentTypes: Array<{ documentType: string; count: number }>; total: number }>("/api/dashboard/document-types");

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

  // --- Chart data: documents by type ---
  // Uses the 5-chart palette from the design system, cycling for >5 types.
  const DONUT_COLORS = [
    "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
    "var(--chart-4)", "var(--chart-5)",
  ];
  const docTypeChartData = (docTypesData?.documentTypes || []).map((d, i) => ({
    name: d.documentType,
    value: d.count,
    fill: DONUT_COLORS[i % DONUT_COLORS.length],
  }));

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

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Slot formerly occupied by Compliance Status Distribution tiles —
            deleted in chunk 1.3. The quartet now appears only in the KPI
            band above. This slot is intentionally empty; chunk 2.1 fills it. */}

        {/* Documents by type — horizontal lollipop chart */}
        {docTypesLoading ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Documents by Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[240px] animate-pulse rounded-md bg-muted" />
            </CardContent>
          </Card>
        ) : docTypesError ? (
          <ErrorState description={docTypesError} onRetry={refetchDocTypes} />
        ) : docTypeChartData.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Documents by Type</CardTitle>
              <CardDescription>
                {docTypesData?.total || 0} documents across {docTypeChartData.length} types.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LollipopChart data={[...docTypeChartData].sort((a, b) => b.value - a.value)} />
            </CardContent>
          </Card>
        ) : null}
      </div>

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
