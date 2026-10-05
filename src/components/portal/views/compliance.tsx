"use client";

import { CheckCircle2, AlertTriangle, Clock, FileText } from "lucide-react";
import { type ComplianceStatus } from "@/lib/dashboard/status-config";
import { COMPLIANCE_STATUS_CONFIG } from "@/lib/dashboard/vocabulary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFetch } from "@/components/app/use-fetch";
import { CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { ComplianceStatusBadge } from "@/components/app/compliance-status-badge";

// =============================================================================
// PortalComplianceView — chunk 5
//
// Single-row compliance matrix for the rep's union. Reuses the same
// /api/portal/compliance endpoint (which delegates to fetchMatrixData +
// buildComplianceMatrix, scoped to the rep's union).
//
// The matrix has exactly 1 row. We render it as a flat list of cells — no
// need for the full unions × types grid that the staff ComplianceView uses.
// =============================================================================

interface ComplianceCell {
  documentType: string;
  status: ComplianceStatus;
  expiresAt: string | null;
  documentId: string | null;
}

interface ComplianceMatrixResponse {
  unions: Array<{
    unionId: string;
    unionName: string;
    scores: ComplianceCell[];
  }>;
  documentTypes: string[];
}

const STATUS_ORDER: Record<ComplianceCell["status"], number> = {
  OVERDUE: 0,
  EXPIRING: 1,
  AWAITING_REVIEW: 2,
  MISSING: 3,
  NOT_APPLICABLE: 4,
  COMPLIANT: 5,
};

export function PortalComplianceView() {
  const { data, loading, error, refetch } = useFetch<ComplianceMatrixResponse>(
    "/api/portal/compliance",
  );

  if (loading) return <CardListSkeleton count={3} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data || data.unions.length === 0) {
    return <ErrorState description="No compliance data found for your union." onRetry={refetch} />;
  }

  const row = data.unions[0];
  // Sort: most urgent first (OVERDUE > EXPIRING > MISSING > NOT_APPLICABLE > COMPLIANT)
  const sortedCells = [...row.scores].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  );

  // Tally for the summary card
  const tally = sortedCells.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<ComplianceCell["status"], number>,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Compliance Status</h1>
        <p className="text-sm text-muted-foreground">
          {row.unionName}&apos;s compliance with the {data.documentTypes.length} required document filings
        </p>
      </div>

      {/* Summary card */}
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>Counts by compliance status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <SummaryTile label={COMPLIANCE_STATUS_CONFIG.COMPLIANT.label} count={tally.COMPLIANT ?? 0} tone="green" icon={CheckCircle2} />
            <SummaryTile label={COMPLIANCE_STATUS_CONFIG.EXPIRING.label} count={tally.EXPIRING ?? 0} tone="amber" icon={Clock} />
            <SummaryTile label={COMPLIANCE_STATUS_CONFIG.OVERDUE.label} count={tally.OVERDUE ?? 0} tone="red" icon={AlertTriangle} />
            <SummaryTile label={COMPLIANCE_STATUS_CONFIG.MISSING.label} count={tally.MISSING ?? 0} tone="slate" icon={FileText} />
            <SummaryTile label={COMPLIANCE_STATUS_CONFIG.NOT_APPLICABLE.shortLabel} count={tally.NOT_APPLICABLE ?? 0} tone="muted" icon={FileText} />
          </div>
        </CardContent>
      </Card>

      {/* Per-document-type list */}
      <Card>
        <CardHeader>
          <CardTitle>Document Requirements</CardTitle>
          <CardDescription>
            Each required document type and its current compliance status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {sortedCells.map((cell) => (
              <li
                key={cell.documentType}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{cell.documentType}</p>
                  {cell.expiresAt && (
                    <p className="text-xs text-muted-foreground">
                      {cell.status === "COMPLIANT"
                        ? `Valid until ${new Date(cell.expiresAt).toLocaleDateString()}`
                        : cell.status === "EXPIRING"
                          ? `Expires ${new Date(cell.expiresAt).toLocaleDateString()}`
                          : cell.status === "OVERDUE"
                            ? `Expired ${new Date(cell.expiresAt).toLocaleDateString()}`
                            : `Reference date: ${new Date(cell.expiresAt).toLocaleDateString()}`}
                    </p>
                  )}
                </div>
                <ComplianceStatusBadge status={cell.status} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  count,
  tone,
  icon: Icon,
}: {
  label: string;
  count: number;
  tone: "green" | "amber" | "red" | "slate" | "muted";
  icon: typeof CheckCircle2;
}) {
  const toneClasses = {
    green: "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
    red: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
    slate: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
    muted: "border-muted bg-muted/30 text-muted-foreground",
  }[tone];
  return (
    <div className={`rounded-md border p-3 text-center ${toneClasses}`}>
      <Icon className="mx-auto mb-1 h-4 w-4" />
      <div className="text-2xl font-bold">{count}</div>
      <p className="mt-0.5 text-xs font-medium">{label}</p>
    </div>
  );
}
