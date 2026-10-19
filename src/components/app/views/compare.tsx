"use client";

import { useState, useMemo } from "react";
import { GitCompare, Plus, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { type ComplianceStatus } from "@/lib/dashboard/status-config";
import { COMPLIANCE_STATUS_CONFIG } from "@/lib/dashboard/vocabulary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

import { PageHeader } from "@/components/app/page-header";
// =============================================================================
// Compare view — side-by-side compliance comparison of 2-6 unions.
//
// The user picks 2-6 unions from a dropdown. The view pivots the
// compliance matrix: rows = document types, columns = selected unions.
// Each cell shows the compliance status letter (C/E/O/M/N/A) for that
// (union, docType) pair.
//
// All computation is client-side (we fetch the full matrix once, then
// filter + pivot in the browser). This avoids a server round-trip per
// selection change.
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

const STATUS_LETTER: Record<string, string> = {
  COMPLIANT: "C",
  EXPIRING: "E",
  OVERDUE: "O",
  AWAITING_REVIEW: "R",
  MISSING: "M",
  NOT_APPLICABLE: "N/A",
};

const STATUS_COLORS: Record<string, string> = {
  // STEP 6 (polish): WCAG-AA-compliant tailwind color pairs. Matches
  // COMPLIANCE_STATUS_CONFIG.cell in vocabulary.ts.
  COMPLIANT: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900",
  EXPIRING: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
  OVERDUE: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900",
  AWAITING_REVIEW: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900",
  MISSING: "bg-muted text-muted-foreground border-border",
  NOT_APPLICABLE: "bg-muted/50 text-muted-foreground border-border",
};

export function CompareView() {
  const { data, loading, error, refetch } = useFetch<ComplianceMatrixResponse>("/api/compliance");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // The list of unions available for selection (all unions in the matrix).
  const availableUnions = useMemo(() => {
    if (!data) return [];
    return data.unions.filter((u) => !selectedIds.includes(u.unionId));
  }, [data, selectedIds]);

  // The selected union rows (in selection order).
  const selectedUnions = useMemo(() => {
    if (!data) return [];
    return selectedIds
      .map((id) => data.unions.find((u) => u.unionId === id))
      .filter((u): u is ComplianceRow => u !== undefined);
  }, [data, selectedIds]);

  function addUnion(id: string) {
    if (selectedIds.length >= 6) {
      toast.error("You can compare up to 6 unions at a time.");
      return;
    }
    setSelectedIds([...selectedIds, id]);
  }

  function removeUnion(id: string) {
    setSelectedIds(selectedIds.filter((x) => x !== id));
  }

  if (loading) return <TableSkeleton rows={6} />;
  if (error) return <ErrorState description={error} onRetry={refetch} />;
  if (!data || data.unions.length === 0) {
    return (
      <EmptyState
        icon={GitCompare}
        title="No unions to compare"
        description="Once unions are registered, you can compare their compliance side-by-side."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="Compare Unions" description="Select 2-6 unions to compare their compliance status side-by-side." />      </div>

      {/* Union picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Unions ({selectedIds.length}/6)</CardTitle>
          <CardDescription>Add unions to compare their compliance gaps.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selected unions */}
          {selectedUnions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedUnions.map((u) => (
                <Badge key={u.unionId} variant="default" className="flex items-center gap-1">
                  {u.unionName}
                  <button
                    onClick={() => removeUnion(u.unionId)}
                    className="ml-1 rounded-full hover:bg-primary-foreground/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Add union dropdown */}
          {availableUnions.length > 0 && selectedIds.length < 6 && (
            <Select onValueChange={addUnion}>
              <SelectTrigger className="w-full md:w-80" aria-label="Add a union to compare">
                <SelectValue placeholder="+ Add a union to compare" />
              </SelectTrigger>
              <SelectContent>
                {availableUnions.map((u) => (
                  <SelectItem key={u.unionId} value={u.unionId}>
                    {u.unionName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* Gap matrix */}
      {selectedUnions.length >= 2 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compliance Gap Matrix</CardTitle>
            <CardDescription>
              Rows = document types, columns = selected unions. Cells show compliance status.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-medium">
                    Document Type
                  </th>
                  {selectedUnions.map((u) => (
                    <th key={u.unionId} className="px-3 py-2 text-center font-medium min-w-[120px]">
                      <span className="block text-xs">{u.unionName}</span>
                      <span className="text-[10px] font-normal text-muted-foreground">
                        Score: {u.overallScore ?? "—"}%
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.documentTypes.map((docType) => (
                  <tr key={docType} className="border-b hover:bg-muted/30 hover:shadow-[inset_2px_0_0_0_oklch(0.74_0.15_85)]">
                    <td className="sticky left-0 z-10 bg-background px-3 py-2 text-xs font-medium">
                      {docType}
                    </td>
                    {selectedUnions.map((u) => {
                      const cell = u.scores.find((s) => s.documentType === docType);
                      const status = cell?.status ?? "MISSING";
                      return (
                        <td key={u.unionId} className="px-3 py-2 text-center">
                          <span
                            className={`inline-flex min-w-[40px] items-center justify-center rounded border px-2 py-1 text-xs font-medium ${STATUS_COLORS[status]}`}
                            title={`${u.unionName} — ${docType}: ${status}`}
                          >
                            {STATUS_LETTER[status]}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              {Object.entries(STATUS_LETTER).map(([status, letter]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center justify-center rounded border px-2 py-0.5 ${STATUS_COLORS[status]}`}>
                    {letter}
                  </span>
                  <span className="text-muted-foreground">
                    {status === "NOT_APPLICABLE" ? COMPLIANCE_STATUS_CONFIG.NOT_APPLICABLE.label : status.charAt(0) + status.slice(1).toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={Plus}
          title="Select at least 2 unions"
          description="Add unions above to see their compliance status compared side-by-side."
        />
      )}
    </div>
  );
}
