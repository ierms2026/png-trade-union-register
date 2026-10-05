import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { fetchMatrixData, buildComplianceMatrix } from "@/lib/compliance/matrix";
import { getExpiryForecast, getNeedsAttention, type ComplianceCell, type UnionSummary } from "@/lib/dashboard/metrics";
import { getComplianceTrend } from "@/lib/dashboard/snapshot";
import { STATUS_CONFIG, EXPIRING_WINDOW_DAYS, COMPLIANCE_STATUSES } from "@/lib/dashboard/status-config";
import { ArrowLeft, Printer, FileText, AlertTriangle, CheckCircle2, XCircle, FileQuestion, Ban, FileDown, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/app/print-button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compliance Report — Register of Trade Unions",
  description: "Official compliance report generated from the Register of Trade Unions.",
};

// =============================================================================
// /reports/compliance — Official compliance report page.
// -----------------------------------------------------------------------------
// A print-optimized server component that renders the full compliance state
// of the registry in a format suitable for ministry review, audit, or legal
// proceedings. The user opens this page + clicks "Print" → browser's
// "Save as PDF" produces the official document.
//
// SECTIONS:
//   1. Official header (coat of arms, department name, "OFFICIAL COMPLIANCE REPORT")
//   2. Summary statistics (total unions, compliance rate, counts by status)
//   3. Compliance matrix (full union × document-type grid)
//   4. Needs attention (overdue + expiring documents, sorted by urgency)
//   5. Expiry forecast (30/60/90-day buckets)
//   6. Historical trend (compliance rate over time, if snapshots exist)
//   7. Official footer (certification line, date, copyright)
//
// AUTH: any authenticated staff member (REGISTRAR, INSPECTOR, OFFICER).
// Officers see only their union's data.
// =============================================================================

interface PageProps {
  searchParams: Promise<{ unionId?: string }>;
}

export default async function ComplianceReportPage({ searchParams }: PageProps) {
  const authUser = await getAuthUser();
  if (!authUser) notFound();

  // --- 1. Fetch the compliance matrix ---
  const data = await fetchMatrixData();
  // Officer scoping: filter to their union only
  if (authUser.role === "OFFICER" && authUser.assignedUnionId) {
    data.unions = data.unions.filter((u) => u.id === authUser.assignedUnionId);
  }
  const matrix = buildComplianceMatrix(data);
  const now = new Date();

  // --- 2. Build summary statistics ---
  let compliant = 0, expiring = 0, overdue = 0, awaitingReview = 0, missing = 0, notApplicable = 0;
  for (const row of matrix.unions) {
    for (const cell of row.scores) {
      switch (cell.status) {
        case "COMPLIANT": compliant++; break;
        case "EXPIRING": expiring++; break;
        case "OVERDUE": overdue++; break;
        case "AWAITING_REVIEW": awaitingReview++; break;
        case "MISSING": missing++; break;
        case "NOT_APPLICABLE": notApplicable++; break;
      }
    }
  }
  const totalCells = matrix.unions.length * matrix.documentTypes.length;
  const applicableCells = compliant + expiring + overdue + awaitingReview + missing;
  const complianceRate = applicableCells === 0 ? 0 : Math.round((compliant / applicableCells) * 100);

  // --- 3. Build needs attention + expiry forecast ---
  const cells: ComplianceCell[] = matrix.unions.flatMap((row) =>
    row.scores.map((score) => ({
      unionId: row.unionId,
      documentType: score.documentType,
      status: score.status,
      filedAt: null,
      expiryDate: score.expiresAt ? new Date(score.expiresAt) : null,
      documentId: score.documentId,
    })),
  );
  const unions: UnionSummary[] = matrix.unions.map((u) => ({
    id: u.unionId,
    name: u.unionName,
    registrationNo: u.status, // not ideal but works for the selector
    status: u.status as "ACTIVE" | "SUSPENDED" | "DEREGISTERED",
  }));
  const needsAttention = getNeedsAttention(cells, unions, now);
  const forecast = getExpiryForecast(cells, now);

  // --- 4. Fetch historical trend (if available) ---
  const trend = await getComplianceTrend(now);
  const hasTrend = trend.length >= 2;

  // --- 5. Status icon helper ---
  const statusIcon = (status: string) => {
    switch (status) {
      case "COMPLIANT": return <CheckCircle2 className="h-3 w-3" />;
      case "EXPIRING": return <AlertTriangle className="h-3 w-3" />;
      case "OVERDUE": return <XCircle className="h-3 w-3" />;
      case "AWAITING_REVIEW": return <Clock className="h-3 w-3" />;
      case "MISSING": return <FileQuestion className="h-3 w-3" />;
      case "NOT_APPLICABLE": return <Ban className="h-3 w-3" />;
      default: return null;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "COMPLIANT": return "text-green-600";
      case "EXPIRING": return "text-orange-500";
      case "OVERDUE": return "text-red-600";
      case "AWAITING_REVIEW": return "text-blue-600";
      case "MISSING": return "text-gray-500";
      case "NOT_APPLICABLE": return "text-gray-400";
      default: return "text-gray-500";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Screen-only header with back button + print button */}
      <header className="no-print sticky top-0 z-30 border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Back to Dashboard</Link>
          </Button>
          <div className="flex items-center gap-2">
            <a href="/api/export/compliance-matrix" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <FileDown className="h-4 w-4" />
                Matrix CSV
              </Button>
            </a>
            <a href="/api/export/expiry-forecast" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <FileDown className="h-4 w-4" />
                Forecast CSV
              </Button>
            </a>
            <PrintButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 p-4 py-10">
        {/* === SECTION 1: Official header === */}
        <div className="print-only text-center border-b-2 border-black pb-4 mb-6">
          <Image src="/coat-of-arms.png" alt="National Emblem of Papua New Guinea" width={60} height={49} className="mx-auto mb-2 h-14 w-auto" />
          <p style={{ fontFamily: "Georgia, serif" }} className="text-sm font-bold">Independent State of Papua New Guinea</p>
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs">Office of The Industrial Registrar</p>
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs">Department of Labour &amp; Industrial Relations</p>
          <hr className="my-2 border-t border-black" />
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs font-semibold">OFFICIAL COMPLIANCE REPORT — REGISTER OF TRADE UNIONS</p>
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs">Generated: {now.toLocaleDateString("en-PG", { year: "numeric", month: "long", day: "numeric" })} at {now.toLocaleTimeString("en-PG", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>

        {/* Screen-only title */}
        <div className="no-print">
          <h1 className="text-3xl font-bold tracking-tight">Compliance Report</h1>
          <p className="text-sm text-muted-foreground">Official compliance report for the Register of Trade Unions. Click "Print" to save as PDF.</p>
        </div>

        {/* === SECTION 2: Summary statistics === */}
        <section className="print-avoid-break">
          <h2 className="mb-4 text-xl font-semibold no-print">Summary</h2>
          <p style={{ fontFamily: "Georgia, serif" }} className="print-only mb-3 text-sm font-semibold">1. Summary Statistics</p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print-card">
            <Card className="print-card"><CardContent className="p-4">
              <p className="text-xs text-muted-foreground no-print">Total Unions</p>
              <p style={{ fontFamily: "Georgia, serif" }} className="print-only text-xs text-gray-600">Total Unions</p>
              <p className="text-2xl font-bold">{matrix.unions.length}</p>
            </CardContent></Card>
            <Card className="print-card"><CardContent className="p-4">
              <p className="text-xs text-muted-foreground no-print">Compliance Rate</p>
              <p style={{ fontFamily: "Georgia, serif" }} className="print-only text-xs text-gray-600">Compliance Rate</p>
              <p className="text-2xl font-bold">{complianceRate}%</p>
              <p className="text-xs text-muted-foreground">{compliant} of {applicableCells} applicable</p>
            </CardContent></Card>
            <Card className="print-card"><CardContent className="p-4">
              <p className="text-xs text-muted-foreground no-print">Document Types</p>
              <p style={{ fontFamily: "Georgia, serif" }} className="print-only text-xs text-gray-600">Document Types</p>
              <p className="text-2xl font-bold">{matrix.documentTypes.length}</p>
            </CardContent></Card>
            <Card className="print-card"><CardContent className="p-4">
              <p className="text-xs text-muted-foreground no-print">Total Cells</p>
              <p style={{ fontFamily: "Georgia, serif" }} className="print-only text-xs text-gray-600">Total Cells</p>
              <p className="text-2xl font-bold">{totalCells}</p>
            </CardContent></Card>
          </div>

          {/* Status breakdown */}
          <div className="mt-4 flex flex-wrap gap-3 print-card">
            {COMPLIANCE_STATUSES.map((s) => (
              <div key={s} className="flex items-center gap-2 rounded-md border px-3 py-1.5">
                <span className={statusColor(s)}>{statusIcon(s)}</span>
                <span className="text-sm font-medium">{STATUS_CONFIG[s].label}</span>
                <span className="text-sm text-muted-foreground">
                  {s === "COMPLIANT" ? compliant : s === "EXPIRING" ? expiring : s === "OVERDUE" ? overdue : s === "AWAITING_REVIEW" ? awaitingReview : s === "MISSING" ? missing : notApplicable}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* === SECTION 3: Compliance matrix === */}
        <section>
          <h2 className="mb-4 text-xl font-semibold no-print">Compliance Matrix</h2>
          <p style={{ fontFamily: "Georgia, serif" }} className="print-only mb-3 text-sm font-semibold">2. Compliance Matrix</p>
          <p className="mb-3 text-xs text-muted-foreground no-print">Full union × document-type grid. Status computed live from filed documents.</p>
          <p style={{ fontFamily: "Georgia, serif" }} className="print-only mb-3 text-xs text-gray-600">Status computed live from filed documents.</p>

          <div className="overflow-x-auto print-card">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  <th className="border border-gray-300 px-2 py-1.5 text-left text-xs font-medium">Union</th>
                  {matrix.documentTypes.map((docType) => (
                    <th key={docType} className="border border-gray-300 px-2 py-1.5 text-center text-xs font-medium" style={{ minWidth: "60px" }}>
                      {docType.length > 12 ? docType.substring(0, 10) + "…" : docType}
                    </th>
                  ))}
                  <th className="border border-gray-300 px-2 py-1.5 text-center text-xs font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {matrix.unions.map((row) => (
                  <tr key={row.unionId} className="print-avoid-break">
                    <td className="border border-gray-300 px-2 py-1.5 text-xs font-medium">{row.unionName}</td>
                    {row.scores.map((cell, i) => (
                      <td key={i} className="border border-gray-300 px-2 py-1.5 text-center text-xs">
                        <span className={statusColor(cell.status)}>
                          {cell.status === "COMPLIANT" ? "C" : cell.status === "EXPIRING" ? "E" : cell.status === "OVERDUE" ? "O" : cell.status === "AWAITING_REVIEW" ? "R" : cell.status === "MISSING" ? "M" : "N/A"}
                        </span>
                      </td>
                    ))}
                    <td className="border border-gray-300 px-2 py-1.5 text-center text-xs font-semibold">
                      {row.overallScore !== null ? `${row.overallScore}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span><span className="text-green-600 font-semibold">C</span> = Compliant</span>
            <span><span className="text-orange-500 font-semibold">E</span> = Expiring (within {EXPIRING_WINDOW_DAYS} days)</span>
            <span><span className="text-red-600 font-semibold">O</span> = Overdue</span>
            <span><span className="text-gray-500 font-semibold">M</span> = Missing</span>
            <span><span className="text-gray-400 font-semibold">N/A</span> = Not Applicable</span>
          </div>
        </section>

        {/* === SECTION 4: Needs attention === */}
        {needsAttention.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-semibold no-print">Needs Attention</h2>
            <p style={{ fontFamily: "Georgia, serif" }} className="print-only mb-3 text-sm font-semibold">3. Documents Requiring Immediate Attention</p>
            <p className="mb-3 text-xs text-muted-foreground no-print">Overdue and expiring documents, sorted by urgency.</p>

            <div className="overflow-x-auto print-card">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    <th className="border border-gray-300 px-2 py-1.5 text-left text-xs font-medium">Union</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-left text-xs font-medium">Document Type</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-center text-xs font-medium">Status</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-left text-xs font-medium">Expiry Date</th>
                  </tr>
                </thead>
                <tbody>
                  {needsAttention.map((item, i) => (
                    <tr key={i} className="print-avoid-break">
                      <td className="border border-gray-300 px-2 py-1.5 text-xs font-medium">{item.unionName}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-xs">{item.documentType}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-center text-xs">
                        <span className={statusColor(item.status)}>
                          {item.status === "OVERDUE" ? "OVERDUE" : "EXPIRING"}
                        </span>
                      </td>
                      <td className="border border-gray-300 px-2 py-1.5 text-xs">
                        {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* === SECTION 5: Expiry forecast === */}
        {forecast.totalActionable > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-semibold no-print">Expiry Forecast</h2>
            <p style={{ fontFamily: "Georgia, serif" }} className="print-only mb-3 text-sm font-semibold">4. Expiry Forecast (Next 90 Days)</p>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {forecast.buckets.map((bucket) => (
                <Card key={bucket.days} className="print-card"><CardContent className="p-4">
                  <p className="text-xs text-muted-foreground no-print">
                    {bucket.fromDays === 0 ? `Within ${bucket.days} days` : `${bucket.fromDays + 1}–${bucket.days} days`}
                  </p>
                  <p style={{ fontFamily: "Georgia, serif" }} className="print-only text-xs text-gray-600">
                    {bucket.fromDays === 0 ? `Within ${bucket.days} days` : `${bucket.fromDays + 1}–${bucket.days} days`}
                  </p>
                  <p className="text-2xl font-bold">{bucket.count}</p>
                </CardContent></Card>
              ))}
              <Card className="print-card"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground no-print">Already Overdue</p>
                <p style={{ fontFamily: "Georgia, serif" }} className="print-only text-xs text-gray-600">Already Overdue</p>
                <p className="text-2xl font-bold text-red-600">{forecast.overdueCount}</p>
              </CardContent></Card>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Total actionable: {forecast.totalActionable}</p>
          </section>
        )}

        {/* === SECTION 6: Historical trend === */}
        {hasTrend && (
          <section>
            <h2 className="mb-4 text-xl font-semibold no-print">Historical Trend</h2>
            <p style={{ fontFamily: "Georgia, serif" }} className="print-only mb-3 text-sm font-semibold">5. Historical Compliance Trend</p>

            <div className="overflow-x-auto print-card">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    <th className="border border-gray-300 px-2 py-1.5 text-left text-xs font-medium">Date</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-center text-xs font-medium">Compliant</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-center text-xs font-medium">Expiring</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-center text-xs font-medium">Overdue</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-center text-xs font-medium">Missing</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-center text-xs font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.slice(-30).map((point) => (
                    <tr key={point.date} className="print-avoid-break">
                      <td className="border border-gray-300 px-2 py-1.5 text-xs">{point.date}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-center text-xs text-green-600">{point.compliant}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-center text-xs text-orange-500">{point.expiring}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-center text-xs text-red-600">{point.overdue}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-500">{point.missing}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-center text-xs font-semibold">
                        {point.percentage !== null ? `${point.percentage}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Showing last 30 days of recorded snapshots. Total snapshots: {trend.length}.</p>
          </section>
        )}

        {/* === SECTION 7: Official footer === */}
        <div className="print-only text-center mt-8 pt-4 border-t border-black">
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs">This compliance report is a true representation of the Register of Trade Unions as maintained by the Industrial Registrar.</p>
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs">Generated in accordance with the Industrial Organizations Act 1962 and the Trade Unions Regulation 1963.</p>
          <p style={{ fontFamily: "Georgia, serif" }} className="text-xs mt-4">© {now.getFullYear()} Independent State of Papua New Guinea</p>
        </div>
      </main>

      {/* Screen-only footer */}
      <footer className="no-print border-t bg-card">
        <div className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-muted-foreground">
          <p className="font-medium">Office of The Industrial Registrar</p>
          <p>PNG Department of Labour &amp; Industrial Relations</p>
        </div>
      </footer>
    </div>
  );
}
