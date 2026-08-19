"use client";

import { Building2, FileText, CheckCircle2, AlertTriangle, XCircle, FileQuestion, Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFetch } from "@/components/app/use-fetch";
import { StatsSkeleton, ActivitySkeleton, CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { type LucideIcon } from "lucide-react";

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
  totalDocuments: number;
  compliance: {
    compliant: number;
    expiring: number;
    overdue: number;
    missing: number;
    notApplicable: number;
    overallRate: number;
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

const SEVERITY_COLORS: Record<string, string> = {
  INFO: "bg-blue-100 text-blue-700",
  WARNING: "bg-amber-100 text-amber-700",
  CRITICAL: "bg-red-100 text-red-700",
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
  task_create: "created task",
  task_update: "updated task",
  task_delete: "deleted task",
  session_revoke: "revoked session",
};

export function DashboardView() {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of the union registry and compliance status.
        </p>
      </div>

      {/* Stat cards */}
      {statsLoading ? (
        <StatsSkeleton />
      ) : statsError ? (
        <ErrorState description={statsError} onRetry={refetchStats} />
      ) : stats ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Unions" value={stats.totalUnions} icon={Building2} color="bg-primary/10 text-primary" />
          <StatCard label="Documents" value={stats.totalDocuments} icon={FileText} color="bg-blue-100 text-blue-700" />
          <StatCard label="Compliant" value={stats.compliance.compliant} icon={CheckCircle2} color="bg-green-100 text-green-700" />
          <StatCard label="Expiring" value={stats.compliance.expiring} icon={AlertTriangle} color="bg-amber-100 text-amber-700" />
          <StatCard label="Overdue" value={stats.compliance.overdue} icon={XCircle} color="bg-red-100 text-red-700" />
          <StatCard label="Missing" value={stats.compliance.missing} icon={FileQuestion} color="bg-gray-100 text-gray-700" />
        </div>
      ) : null}

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
              <div className="flex items-center justify-between rounded-md bg-muted/50 p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Overall Compliance Rate</p>
                  <p className="text-3xl font-bold">{stats.compliance.overallRate}%</p>
                </div>
                <div className="relative h-16 w-16">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18" cy="18" r="16"
                      fill="none" stroke="currentColor" strokeWidth="4"
                      className="text-muted"
                    />
                    <circle
                      cx="18" cy="18" r="16"
                      fill="none" stroke="currentColor" strokeWidth="4"
                      strokeDasharray={`${stats.compliance.overallRate} 100`}
                      className="text-primary transition-all"
                    />
                  </svg>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-muted-foreground">Compliant:</span>
                  <span className="font-medium">{stats.compliance.compliant}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">Expiring:</span>
                  <span className="font-medium">{stats.compliance.expiring}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-muted-foreground">Overdue:</span>
                  <span className="font-medium">{stats.compliance.overdue}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-gray-400" />
                  <span className="text-muted-foreground">Missing:</span>
                  <span className="font-medium">{stats.compliance.missing}</span>
                </div>
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
