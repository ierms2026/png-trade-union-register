"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, FileQuestion, Ban } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  status: "COMPLIANT" | "EXPIRING" | "OVERDUE" | "MISSING" | "NOT_APPLICABLE";
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

type StatusFilter = "ALL" | "COMPLIANT" | "EXPIRING" | "OVERDUE" | "MISSING" | "NOT_APPLICABLE";

const STATUS_CONFIG: Record<string, { label: string; cell: string; icon: typeof CheckCircle2 }> = {
  COMPLIANT: { label: "Compliant", cell: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  EXPIRING: { label: "Expiring", cell: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertTriangle },
  OVERDUE: { label: "Overdue", cell: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  MISSING: { label: "Missing", cell: "bg-gray-100 text-gray-800 border-gray-200", icon: FileQuestion },
  NOT_APPLICABLE: { label: "N/A", cell: "bg-slate-100 text-slate-600 border-slate-200", icon: Ban },
};

export function ComplianceView() {
  const { data, loading, error, refetch } = useFetch<ComplianceMatrixResponse>("/api/compliance");
  const [filter, setFilter] = useState<StatusFilter>("ALL");

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compliance Matrix</h1>
          <p className="text-sm text-muted-foreground">
            Live compliance status for every union × document type. Computed on every read — no caching.
          </p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="COMPLIANT">Compliant only</SelectItem>
            <SelectItem value="EXPIRING">Expiring only</SelectItem>
            <SelectItem value="OVERDUE">Overdue only</SelectItem>
            <SelectItem value="MISSING">Missing only</SelectItem>
            <SelectItem value="NOT_APPLICABLE">N/A only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={status} className="flex items-center gap-1.5 text-xs">
              <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${cfg.cell}`}>
                <Icon className="h-3 w-3" />
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Unions × Document Types</CardTitle>
          <CardDescription>
            Generated at {new Date(data.generatedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium">
                  Union
                </th>
                {data.documentTypes.map((dt) => (
                  <th key={dt} className="px-2 py-2 text-center font-medium min-w-[100px]">
                    <span className="block text-xs">{dt}</span>
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {data.unions.map((row) => (
                <tr key={row.unionId} className="border-b hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-background px-3 py-2">
                    <p className="font-medium">{row.unionName}</p>
                    <p className="text-xs text-muted-foreground">{row.status}</p>
                  </td>
                  {row.scores.map((cell) => {
                    const cfg = STATUS_CONFIG[cell.status];
                    const dimmed = filter !== "ALL" && cell.status !== filter;
                    return (
                      <td key={cell.documentType} className="px-2 py-2 text-center">
                        <span
                          className={`inline-flex min-w-[60px] items-center justify-center rounded border px-2 py-1 text-xs font-medium ${cfg.cell} ${dimmed ? "opacity-25" : ""}`}
                          title={cell.expiresAt ? `Expires: ${new Date(cell.expiresAt).toLocaleDateString()}` : cfg.label}
                        >
                          {cfg.label}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center">
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
