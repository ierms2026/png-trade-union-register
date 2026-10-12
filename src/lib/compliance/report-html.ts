import { fetchMatrixData, buildComplianceMatrix, type ComplianceMatrixResponse, type ComplianceScoreCell } from "@/lib/compliance/matrix";
import { getExpiryForecast, tallyStatuses, computeRateFromCounts, type ComplianceCell } from "@/lib/dashboard/metrics";
import { STATUS_CONFIG, EXPIRING_WINDOW_DAYS, FORECAST_BUCKETS } from "@/lib/dashboard/status-config";
import type { ComplianceStatus } from "@/lib/dashboard/status-config";

// =============================================================================
// Compliance report HTML generator — builds a multi-section HTML document
// that WeasyPrint renders to PDF.
//
// SECTIONS:
//   1. Cover page (title, date, scope, overall compliance rate)
//   2. Executive summary (KPI tiles: total unions, compliant, expiring, overdue, missing)
//   3. Compliance matrix (full table: unions × document types with color-coded statuses)
//   4. Needs attention (overdue + expiring documents, sorted by urgency)
//   5. Expiry forecast (30/60/90-day buckets)
//   6. Status legend (definitions for each status)
//
// The HTML uses inline CSS (no external stylesheets) so WeasyPrint can render
// it without file-path dependencies. Colors are hardcoded hex (resolved from
// the CSS variable tokens in globals.css) because WeasyPrint doesn't have
// access to the browser's CSS custom properties.
// =============================================================================

// Status colors — hardcoded hex (resolved from globals.css oklch values).
// WeasyPrint doesn't support oklch(), so we use close sRGB approximations.
const STATUS_COLORS: Record<ComplianceStatus, { bg: string; text: string; border: string }> = {
  COMPLIANT:      { bg: "#d4edda", text: "#155724", border: "#c3e6cb" },
  EXPIRING:       { bg: "#fff3cd", text: "#856404", border: "#ffeaa7" },
  OVERDUE:        { bg: "#f8d7da", text: "#721c24", border: "#f5c6cb" },
  AWAITING_REVIEW:{ bg: "#cce5ff", text: "#004085", border: "#b8daff" },
  MISSING:        { bg: "#e2e3e5", text: "#383d41", border: "#d6d8db" },
  NOT_APPLICABLE: { bg: "#f8f9fa", text: "#6c757d", border: "#dee2e6" },
};

export interface ReportOptions {
  /** Filter to a single union (for per-union reports). null = all unions. */
  unionId?: string | null;
  /** The user requesting the report (for the "prepared by" line). */
  preparedBy?: string;
}

export interface ReportResult {
  html: string;
  stats: {
    totalUnions: number;
    totalCells: number;
    compliant: number;
    expiring: number;
    overdue: number;
    awaitingReview: number;
    missing: number;
    notApplicable: number;
    overallRate: number;
  };
}

/**
 * Build the compliance report as an HTML string.
 * The caller passes this to WeasyPrint for PDF rendering.
 */
export async function buildComplianceReportHtml(options: ReportOptions = {}): Promise<ReportResult> {
  const { unionId = null, preparedBy } = options;
  const now = new Date();

  // --- Fetch + build the compliance matrix --------------------------------
  const data = await fetchMatrixData();
  if (unionId) {
    data.unions = data.unions.filter((u) => u.id === unionId);
  }
  const matrix = buildComplianceMatrix(data, now);

  // --- Tally the status counts via the canonical helpers -----------------
  // D1 rule lives in computeRateFromCounts (PROVISIONAL(D1) marker there) —
  // do NOT re-implement it here. tallyStatuses accepts ComplianceScoreCell
  // (which has a `status` field) and returns a ComplianceCounts object;
  // computeRateFromCounts turns that into the rate.
  const allCells: Array<{ status: ComplianceStatus }> = [];
  for (const row of matrix.unions) {
    for (const cell of row.scores) {
      allCells.push(cell);
    }
  }
  const counts = tallyStatuses(allCells);
  const rate = computeRateFromCounts(counts);
  const compliant = counts.COMPLIANT;
  const expiring = counts.EXPIRING;
  const overdue = counts.OVERDUE;
  const awaitingReview = counts.AWAITING_REVIEW;
  const missing = counts.MISSING;
  const notApplicable = counts.NOT_APPLICABLE;
  const totalCells = rate.denominator;
  const overallRate = rate.percentage;

  // --- Build the needs-attention list (overdue + expiring) ----------------
  const needsAttention: Array<{
    unionName: string;
    documentType: string;
    status: ComplianceStatus;
    expiresAt: string | null;
    daysUntilExpiry: number | null;
  }> = [];
  const msPerDay = 24 * 60 * 60 * 1000;
  for (const row of matrix.unions) {
    for (const cell of row.scores) {
      if (cell.status === "OVERDUE" || cell.status === "EXPIRING") {
        const daysUntilExpiry = cell.expiresAt
          ? Math.floor((new Date(cell.expiresAt).getTime() - now.getTime()) / msPerDay)
          : null;
        needsAttention.push({
          unionName: row.unionName,
          documentType: cell.documentType,
          status: cell.status,
          expiresAt: cell.expiresAt,
          daysUntilExpiry,
        });
      }
    }
  }
  // Sort: OVERDUE first, then by daysUntilExpiry ASC
  needsAttention.sort((a, b) => {
    if (a.status === "OVERDUE" && b.status !== "OVERDUE") return -1;
    if (a.status !== "OVERDUE" && b.status === "OVERDUE") return 1;
    return (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0);
  });

  // --- Build the expiry forecast buckets ----------------------------------
  const forecastCells: ComplianceCell[] = matrix.unions.flatMap((row) =>
    row.scores
      .filter((c): c is ComplianceScoreCell & { expiresAt: string } => c.expiresAt !== null)
      .map((c) => ({
        documentType: c.documentType,
        status: c.status,
        expiryDate: new Date(c.expiresAt),
        filedAt: null,
        unionName: row.unionName,
        unionId: row.unionId,
      }))
  );
  const forecast = getExpiryForecast(forecastCells, now, FORECAST_BUCKETS);

  // --- Build the HTML ------------------------------------------------------
  const dateStr = now.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });
  const scopeText = unionId
    ? matrix.unions[0]?.unionName ?? "Single Union"
    : "All Registered Unions";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Compliance Report — Register of Trade Unions — ${scopeText} — ${now.toISOString().slice(0, 10)}</title>
  <meta name="author" content="Office of The Industrial Registrar">
  <meta name="description" content="Official compliance report generated from the Register of Trade Unions, Papua New Guinea. Covers ${matrix.unions.length} ${matrix.unions.length === 1 ? "union" : "unions"} with an overall compliance rate of ${overallRate}%.">
  <meta name="generator" content="Register of Trade Unions (PNG)">
  <style>
    @page {
      size: A4;
      margin: 2cm;
      @bottom-center {
        content: "Page " counter(page) " of " counter(pages);
        font-size: 9px;
        color: #71717a;
      }
    }
    @page :first {
      margin: 0;
      @bottom-center { content: none; }
    }
    body {
      font-family: 'Helvetica', 'Arial', sans-serif;
      color: #1a1a2e;
      font-size: 11px;
      line-height: 1.5;
      margin: 0;
      padding: 0;
    }
    .cover {
      page-break-after: always;
      padding: 4cm 3cm;
      text-align: center;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .cover h1 { font-size: 28px; margin: 0 0 8px 0; color: #1a1a2e; }
    .cover .subtitle { font-size: 14px; color: #71717a; margin-bottom: 40px; }
    .cover .rate-box {
      display: inline-block;
      padding: 30px 50px;
      background: #1a1a2e;
      color: #fff;
      border-radius: 8px;
      margin: 20px 0;
    }
    .cover .rate-box .rate { font-size: 48px; font-weight: bold; }
    .cover .rate-box .label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .cover .meta { margin-top: 40px; font-size: 12px; color: #71717a; }
    .cover .meta div { margin: 4px 0; }
    h2 {
      font-size: 16px;
      border-bottom: 2px solid #1a1a2e;
      padding-bottom: 6px;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    .kpi-grid {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    .kpi-tile {
      flex: 1;
      padding: 12px;
      border-radius: 6px;
      text-align: center;
      border: 1px solid #e4e4e7;
    }
    .kpi-tile .number { font-size: 24px; font-weight: bold; }
    .kpi-tile .label { font-size: 9px; text-transform: uppercase; color: #71717a; margin-top: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
      font-size: 10px;
    }
    th {
      background: #1a1a2e;
      color: #fff;
      padding: 6px 8px;
      text-align: left;
      font-size: 9px;
      text-transform: uppercase;
    }
    td {
      padding: 5px 8px;
      border-bottom: 1px solid #e4e4e7;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .matrix-cell {
      text-align: center;
      padding: 4px;
    }
    .legend-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .legend-color {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      margin-right: 8px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .legend-text { font-size: 10px; }
    .legend-text strong { display: block; }
    .legend-text span { color: #71717a; }
    .no-break { page-break-inside: avoid; }
    .urgency-overdue { color: #721c24; font-weight: bold; }
    .urgency-expiring { color: #856404; }
  </style>
</head>
<body>

<!-- ==================== COVER PAGE ==================== -->
<div class="cover">
  <h1>Compliance Report</h1>
  <div class="subtitle">Register of Trade Unions &middot; Office of The Industrial Registrar</div>
  <div class="rate-box">
    <div class="rate">${overallRate}%</div>
    <div class="label">Overall Compliance Rate</div>
  </div>
  <div class="meta">
    <div><strong>Report Date:</strong> ${dateStr} at ${timeStr}</div>
    <div><strong>Scope:</strong> ${scopeText}</div>
    <div><strong>Total Unions:</strong> ${matrix.unions.length}</div>
    <div><strong>Required Filings:</strong> ${totalCells}</div>
    ${preparedBy ? `<div><strong>Prepared By:</strong> ${escapeHtml(preparedBy)}</div>` : ""}
  </div>
</div>

<!-- ==================== EXECUTIVE SUMMARY ==================== -->
<h2>Executive Summary</h2>
<div class="kpi-grid">
  <div class="kpi-tile" style="background: ${STATUS_COLORS.COMPLIANT.bg}; border-color: ${STATUS_COLORS.COMPLIANT.border};">
    <div class="number" style="color: ${STATUS_COLORS.COMPLIANT.text};">${compliant}</div>
    <div class="label">Compliant</div>
  </div>
  <div class="kpi-tile" style="background: ${STATUS_COLORS.EXPIRING.bg}; border-color: ${STATUS_COLORS.EXPIRING.border};">
    <div class="number" style="color: ${STATUS_COLORS.EXPIRING.text};">${expiring}</div>
    <div class="label">Expiring</div>
  </div>
  <div class="kpi-tile" style="background: ${STATUS_COLORS.OVERDUE.bg}; border-color: ${STATUS_COLORS.OVERDUE.border};">
    <div class="number" style="color: ${STATUS_COLORS.OVERDUE.text};">${overdue}</div>
    <div class="label">Overdue</div>
  </div>
  <div class="kpi-tile" style="background: ${STATUS_COLORS.MISSING.bg}; border-color: ${STATUS_COLORS.MISSING.border};">
    <div class="number" style="color: ${STATUS_COLORS.MISSING.text};">${missing}</div>
    <div class="label">Missing</div>
  </div>
  <div class="kpi-tile" style="background: ${STATUS_COLORS.NOT_APPLICABLE.bg}; border-color: ${STATUS_COLORS.NOT_APPLICABLE.border};">
    <div class="number" style="color: ${STATUS_COLORS.NOT_APPLICABLE.text};">${notApplicable}</div>
    <div class="label">N/A</div>
  </div>
</div>
<p>
  This report covers ${matrix.unions.length} registered ${matrix.unions.length === 1 ? "union" : "unions"} with ${totalCells} required document filings.
  The overall compliance rate is ${overallRate}% (${compliant} of ${totalCells} required filings are compliant).
  ${overdue > 0 ? `<strong>${overdue} filing${overdue === 1 ? "" : "s"} are overdue</strong> and require immediate attention.` : "No filings are overdue."}
  ${expiring > 0 ? `${expiring} filing${expiring === 1 ? "" : "s"} are expiring within ${EXPIRING_WINDOW_DAYS} days.` : ""}
</p>

<!-- ==================== COMPLIANCE MATRIX ==================== -->
<h2>Compliance Matrix</h2>
<table class="no-break">
  <thead>
    <tr>
      <th>Union</th>
      <th>Document Type</th>
      <th>Status</th>
      <th>Expiry Date</th>
      <th>Score</th>
    </tr>
  </thead>
  <tbody>
    ${matrix.unions.map((row) =>
      row.scores.map((cell, i) => {
        const colors = STATUS_COLORS[cell.status];
        const expiryStr = cell.expiresAt
          ? new Date(cell.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
          : "&mdash;";
        return `<tr>
          <td>${i === 0 ? escapeHtml(row.unionName) : ""}</td>
          <td>${escapeHtml(cell.documentType)}</td>
          <td><span class="status-badge" style="background: ${colors.bg}; color: ${colors.text}; border: 1px solid ${colors.border};">${cell.status}</span></td>
          <td>${expiryStr}</td>
          <td>${i === 0 ? (row.overallScore != null ? row.overallScore + "%" : "&mdash;") : ""}</td>
        </tr>`;
      }).join("")
    ).join("")}
  </tbody>
</table>

<!-- ==================== NEEDS ATTENTION ==================== -->
${needsAttention.length > 0 ? `
<h2>Needs Attention</h2>
<p>The following ${needsAttention.length} filing${needsAttention.length === 1 ? "" : "s"} are overdue or expiring:</p>
<table class="no-break">
  <thead>
    <tr>
      <th>Union</th>
      <th>Document Type</th>
      <th>Status</th>
      <th>Expiry Date</th>
      <th>Days</th>
    </tr>
  </thead>
  <tbody>
    ${needsAttention.map((item) => {
      const colors = STATUS_COLORS[item.status];
      const expiryStr = item.expiresAt
        ? new Date(item.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
        : "&mdash;";
      const daysStr = item.daysUntilExpiry != null
        ? (item.daysUntilExpiry < 0 ? `${Math.abs(item.daysUntilExpiry)} days overdue` : `${item.daysUntilExpiry} days`)
        : "&mdash;";
      const urgencyClass = item.status === "OVERDUE" ? "urgency-overdue" : "urgency-expiring";
      return `<tr>
        <td>${escapeHtml(item.unionName)}</td>
        <td>${escapeHtml(item.documentType)}</td>
        <td><span class="status-badge" style="background: ${colors.bg}; color: ${colors.text}; border: 1px solid ${colors.border};">${item.status}</span></td>
        <td>${expiryStr}</td>
        <td class="${urgencyClass}">${daysStr}</td>
      </tr>`;
    }).join("")}
  </tbody>
</table>
` : ""}

<!-- ==================== EXPIRY FORECAST ==================== -->
<h2>Expiry Forecast</h2>
<p>Documents expiring within the next 90 days, by urgency bucket:</p>
<div class="kpi-grid">
  ${forecast.buckets.map((bucket) => `
    <div class="kpi-tile" style="background: ${STATUS_COLORS.EXPIRING.bg}; border-color: ${STATUS_COLORS.EXPIRING.border};">
      <div class="number" style="color: ${STATUS_COLORS.EXPIRING.text};">${bucket.count}</div>
      <div class="label">&le;${bucket.days} days</div>
    </div>
  `).join("")}
  <div class="kpi-tile" style="background: ${STATUS_COLORS.OVERDUE.bg}; border-color: ${STATUS_COLORS.OVERDUE.border};">
    <div class="number" style="color: ${STATUS_COLORS.OVERDUE.text};">${forecast.overdueCount}</div>
    <div class="label">Overdue</div>
  </div>
  <div class="kpi-tile" style="background: ${STATUS_COLORS.MISSING.bg}; border-color: ${STATUS_COLORS.MISSING.border};">
    <div class="number" style="color: ${STATUS_COLORS.MISSING.text};">${forecast.totalActionable}</div>
    <div class="label">Total Actionable</div>
  </div>
</div>

<!-- ==================== STATUS LEGEND ==================== -->
<h2>Status Legend</h2>
${Object.entries(STATUS_CONFIG).map(([status, config]) => {
  const colors = STATUS_COLORS[status as ComplianceStatus];
  const definition = config.definition.replace(/\$\{EXPIRING_WINDOW_DAYS\}/g, String(EXPIRING_WINDOW_DAYS));
  return `<div class="legend-item">
    <div class="legend-color" style="background: ${colors.bg}; border: 1px solid ${colors.border};"></div>
    <div class="legend-text">
      <strong>${config.label}</strong>
      <span>${escapeHtml(definition)}</span>
    </div>
  </div>`;
}).join("")}

</body>
</html>`;

  return {
    html,
    stats: {
      totalUnions: matrix.unions.length,
      totalCells,
      compliant,
      expiring,
      overdue,
      awaitingReview,
      missing,
      notApplicable,
      overallRate,
    },
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
