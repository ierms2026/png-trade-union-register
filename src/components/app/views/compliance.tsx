"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, FileQuestion, Ban } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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
  COMPLIANT: { label: "Compliant", cell: "bg-chart-3/15 text-chart-3 border-chart-3/30", icon: CheckCircle2 },
  EXPIRING: { label: "Expiring", cell: "bg-accent/15 text-accent-foreground border-accent/30", icon: AlertTriangle },
  OVERDUE: { label: "Overdue", cell: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  MISSING: { label: "Missing", cell: "bg-muted text-muted-foreground border-border", icon: FileQuestion },
  NOT_APPLICABLE: { label: "N/A", cell: "bg-muted/50 text-muted-foreground border-border", icon: Ban },
};

export function ComplianceView() {
  const { data, loading, error, refetch } = useFetch<ComplianceMatrixResponse>("/api/compliance");
  const [filter, setFilter] = useState<StatusFilter>("ALL");

  // --- Chart data: union status distribution (donut) ---
  const STATUS_COLORS: Record<string, string> = {
    ACTIVE: "#22c55e",
    SUSPENDED: "#f59e0b",
    DEREGISTERED: "#9ca3af",
  };
  const unionStatusData = data
    ? Object.entries(
        data.unions.reduce((acc, u) => {
          acc[u.status] = (acc[u.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      ).map(([status, count]) => ({ name: status, value: count, fill: STATUS_COLORS[status] || "#9ca3af" }))
    : [];

  // --- Chart data: per-union compliance breakdown (stacked bar) ---
  const COMPLIANCE_COLORS: Record<string, string> = {
    COMPLIANT: "#22c55e",
    EXPIRING: "#f59e0b",
    OVERDUE: "#ef4444",
    MISSING: "#9ca3af",
    NOT_APPLICABLE: "#cbd5e1",
  };
  const stackedBarData = data
    ? data.unions.map((u) => {
        const counts: Record<string, number> = { COMPLIANT: 0, EXPIRING: 0, OVERDUE: 0, MISSING: 0, NOT_APPLICABLE: 0 };
        u.scores.forEach((s) => { counts[s.status]++; });
        return {
          name: u.unionName.length > 20 ? u.unionName.slice(0, 18) + "…" : u.unionName,
          Compliant: counts.COMPLIANT,
          Expiring: counts.EXPIRING,
          Overdue: counts.OVERDUE,
          Missing: counts.MISSING,
        };
      })
    : [];

  const stackedBarConfig: ChartConfig = {
    Compliant: { label: "Compliant", color: "#22c55e" },
    Expiring: { label: "Expiring", color: "#f59e0b" },
    Overdue: { label: "Overdue", color: "#ef4444" },
    Missing: { label: "Missing", color: "#9ca3af" },
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

        {/* Per-union compliance breakdown — stacked bar */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Compliance by Union</CardTitle>
            <CardDescription>Stacked breakdown of document statuses per union.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={stackedBarConfig} className="h-[240px] w-full">
              <BarChart data={stackedBarData} margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar dataKey="Compliant" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Expiring" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Overdue" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Missing" stackId="a" fill="#9ca3af" radius={[4, 4, 0, 0]} />
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
              <tr className="border-b">
                <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-medium min-w-[200px]">
                  Union
                </th>
                {data.documentTypes.map((dt) => (
                  <th key={dt} className="px-3 py-3 text-center font-medium min-w-[140px]">
                    <span className="block text-xs leading-tight">{dt}</span>
                  </th>
                ))}
                <th className="px-4 py-3 text-center font-medium min-w-[80px]">Score</th>
              </tr>
            </thead>
            <tbody>
              {data.unions.map((row) => (
                <tr key={row.unionId} className="border-b hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-card px-4 py-3">
                    <p className="font-medium">{row.unionName}</p>
                    <p className="text-xs text-muted-foreground">{row.status}</p>
                  </td>
                  {row.scores.map((cell) => {
                    const cfg = STATUS_CONFIG[cell.status];
                    const dimmed = filter !== "ALL" && cell.status !== filter;
                    return (
                      <td key={cell.documentType} className="px-3 py-3 text-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={`inline-flex min-w-[100px] cursor-help items-center justify-center rounded border px-3 py-1.5 text-xs font-medium ${cfg.cell} ${dimmed ? "opacity-25" : ""}`}
                            >
                              {cfg.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[220px]">
                            <div className="space-y-0.5 text-left">
                              <p className="font-semibold">{row.unionName}</p>
                              <p className="text-primary-foreground/80">{cell.documentType}</p>
                              <p className="text-primary-foreground/80">Status: {cfg.label}</p>
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
