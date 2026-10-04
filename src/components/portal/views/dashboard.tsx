"use client";

import { getUnionStatusLabel } from "@/lib/dashboard/vocabulary";
import {
  CheckCircle2, AlertTriangle, Clock, FileText, ListTodo,
  TrendingUp, Calendar, ArrowRight, Upload, Contact as AddressBook,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { StatusBadge } from "@/components/app/status-badge";

// =============================================================================
// PortalDashboardView — chunk 5
//
// Rep-facing dashboard. Shows:
//   - Compliance summary card (X of Y required docs compliant, % rate)
//   - 4 status tiles (Compliant / Expiring / Overdue / Missing)
//   - Needs-attention list (overdue + expiring docs for this union)
//   - Pending items (uploads awaiting review + contact-update requests)
//   - Quick actions (Upload Document, Update Contact Info)
// =============================================================================

interface PortalUser {
  id: string;
  email: string;
  role: "REPRESENTATIVE";
  assignedUnionId: string | null;
  twoFactorEnabled: boolean;
}

interface DashboardData {
  union: {
    id: string;
    unionName: string;
    registrationNo: string;
    status: string;
  };
  activeCount: number;
  compliance: {
    compliant: number;
    expiring: number;
    overdue: number;
    missing: number;
    notApplicable: number;
    overallRate: number;
    rate: { numerator: number; denominator: number; percentage: number };
  };
  needsAttention: Array<{
    documentType: string;
    status: "OVERDUE" | "EXPIRING";
    expiryDate: string | null;
  }>;
  pendingUploads: number;
  pendingContactUpdates: number;
}

export function PortalDashboardView({
  user,
  onNavigate,
}: {
  user: PortalUser;
  onNavigate: (view: string) => void;
}) {
  const { data, loading, error, refetch } = useFetch<DashboardData>("/api/portal/dashboard");

  if (loading) return <CardListSkeleton count={4} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data) return null;

  const { compliance, needsAttention, pendingUploads, pendingContactUpdates } = data;
  const hasPendingItems = pendingUploads > 0 || pendingContactUpdates > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{data.union.unionName}</h1>
        <p className="text-sm text-muted-foreground">
          Registration No. {data.union.registrationNo} · Status:{" "}
          <span className="font-medium">{getUnionStatusLabel(data.union.status as "ACTIVE" | "SUSPENDED" | "DEREGISTERED")}</span>
        </p>
      </div>

      {/* Pending items banner */}
      {hasPendingItems && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3 p-4">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                You have items awaiting Registrar review:
              </p>
              <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-200">
                {pendingUploads > 0 && (
                  <li>
                    · {pendingUploads} document upload{pendingUploads === 1 ? "" : "s"} pending review
                  </li>
                )}
                {pendingContactUpdates > 0 && (
                  <li>
                    · {pendingContactUpdates} contact-info update{pendingContactUpdates === 1 ? "" : "s"} pending review
                  </li>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          size="lg"
          className="h-auto justify-start gap-3 py-4"
          onClick={() => onNavigate("documents")}
        >
          <Upload className="h-5 w-5" />
          <div className="text-left">
            <div className="text-sm font-semibold">Upload Document</div>
            <div className="text-xs opacity-80">Submit a new or updated document for review</div>
          </div>
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-auto justify-start gap-3 py-4"
          onClick={() => onNavigate("contact")}
        >
          <AddressBook className="h-5 w-5" />
          <div className="text-left">
            <div className="text-sm font-semibold">Update Contact Info</div>
            <div className="text-xs opacity-80">Submit address, phone, or email changes</div>
          </div>
        </Button>
      </div>

      {/* Compliance summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Compliance Summary
          </CardTitle>
          <CardDescription>
            Your union&apos;s compliance with the {compliance.rate.denominator} required document filings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Rate display */}
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">{compliance.rate.percentage}%</span>
            <span className="text-sm text-muted-foreground">
              ({compliance.rate.numerator} of {compliance.rate.denominator} required)
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${compliance.rate.percentage}%` }}
            />
          </div>
          {/* Status tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatusTile
              label="Compliant"
              count={compliance.compliant}
              tone="green"
              icon={CheckCircle2}
            />
            <StatusTile
              label="Expiring"
              count={compliance.expiring}
              tone="amber"
              icon={Clock}
            />
            <StatusTile
              label="Overdue"
              count={compliance.overdue}
              tone="red"
              icon={AlertTriangle}
            />
            <StatusTile
              label="Missing"
              count={compliance.missing}
              tone="slate"
              icon={FileText}
            />
          </div>
        </CardContent>
      </Card>

      {/* Needs attention */}
      {needsAttention.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Needs Attention
            </CardTitle>
            <CardDescription>
              Documents that are overdue or expiring within 90 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {needsAttention.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.documentType}</p>
                    {item.expiryDate && (
                      <p className="text-xs text-muted-foreground">
                        Expires: {new Date(item.expiryDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={item.status} />
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              onClick={() => onNavigate("compliance")}
            >
              View full compliance matrix
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Documents + Tasks quick links */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Documents
            </CardTitle>
            <CardDescription>{data.activeCount} active documents on file</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" className="w-full" onClick={() => onNavigate("documents")}>
              Manage Documents
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="h-4 w-4" />
              Tasks
            </CardTitle>
            <CardDescription>Tasks for your union (read-only)</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" className="w-full" onClick={() => onNavigate("tasks")}>
              View Tasks
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusTile({
  label,
  count,
  tone,
  icon: Icon,
}: {
  label: string;
  count: number;
  tone: "green" | "amber" | "red" | "slate";
  icon: typeof CheckCircle2;
}) {
  const toneClasses = {
    green: "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
    red: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
    slate: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
  }[tone];
  return (
    <div className={`rounded-md border p-3 ${toneClasses}`}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-4 w-4" />
        <span className="text-2xl font-bold">{count}</span>
      </div>
      <p className="mt-1 text-xs font-medium">{label}</p>
    </div>
  );
}
