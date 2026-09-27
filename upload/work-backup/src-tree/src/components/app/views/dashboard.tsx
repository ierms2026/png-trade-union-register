"use client";

import { Building2, FileText, CheckCircle2, AlertTriangle, XCircle, FileQuestion, Activity, Plus, Upload, ListTodo, ScrollText, ArrowRight, FileDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFetch } from "@/components/app/use-fetch";
import { StatsSkeleton, ActivitySkeleton, CardListSkeleton } from "@/components/app/skeletons";
import { ErrorState } from "@/components/app/error-state";
import { EmptyState } from "@/components/app/empty-state";
import { type LucideIcon } from "lucide-react";
import { STATUS_CONFIG, getTileStatuses, COMPLIANCE_STATUSES, EXPIRING_WINDOW_DAYS, FORECAST_BUCKETS, TREND_WINDOW_DAYS, DASHBOARD_KPI_DEFINITIONS, type ComplianceStatus } from "@/lib/dashboard/status-config";
import { type ComplianceCounts, getRequiredVsOnFileByType, sumOnFile, type RequiredVsOnFileEntry, NEEDS_ATTENTION_CAP, getUnionDocMatrix, type UnionDocMatrix, type ComplianceCell, type UnionSummary, getExpiryForecast, type ExpiryForecast, type ForecastBucket } from "@/lib/dashboard/metrics";
import { formatDueDate, formatAbsolute, formatEventRelative } from "@/lib/dashboard/date-utils";
import { complianceFilterUrl, complianceUnfilteredUrl, unionsListUrl } from "@/lib/dashboard/dashboard-links";
import {
  hasSufficientHistory,
  sliceTrendToWindow,
  buildChartSeriesWithGaps,
  buildSparklinePoints,
  extractSparklineSeries,
  type ComplianceTrendPoint,
  type TrendChartDatum,
} from "@/lib/dashboard/snapshot";
import {
  getActivitySummary,
  RECENT_ACTIVITY_ROW_CAP,
  type ActivityEvent,
  type StateChangingEvent,
  type SessionSummary,
} from "@/lib/dashboard/activity";
import { type EventSeverity } from "@/lib/dashboard/activity-config";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

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

interface NeedsAttentionItem {
  unionId: string;
  unionName: string;
  documentType: string;
  status: string;
  expiryDate: string;
}

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
  needsAttention: NeedsAttentionItem[];
}

// ActivityEntry mirrors ActivityEvent from the selector module (chunk 5.1).
// The selector's `getActivitySummary` accepts ActivityEvent[] — the activity
// API's response shape matches. We keep this local alias for readability
// at the useFetch call site; the structural identity is verified by TS.
type ActivityEntry = ActivityEvent;

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  /** Optional href for drill-through. When provided, the card becomes a clickable link. */
  href?: string;
  /** Accessible name for the link, e.g. "Missing: 57 documents — view filtered list". */
  ariaLabel?: string;
  /**
   * Optional decorative sparkline rendered at the bottom of the card body.
   * 4.2b: when provided, the sparkline is aria-hidden (the card's value
   * is the accessible number; the sparkline is decorative context).
   * Hidden by the caller when `hasSufficientHistory()` is false.
   */
  sparkline?: React.ReactNode;
  /**
   * 6.2: optional definition text for the card's label tooltip. When
   * provided, the label becomes a focusable Tooltip trigger (hover +
   * keyboard focus, never hover-only). The definition comes from
   * STATUS_CONFIG[status].definition (for status KPIs) or
   * DASHBOARD_KPI_DEFINITIONS[label] (for Total Unions / Documents).
   * The RateKpiCard has its own 1.2 tooltip — it does NOT use this prop.
   */
  definition?: string;
}

function StatCard({ label, value, icon: Icon, color, href, ariaLabel, sparkline, definition }: StatCardProps) {
  const cardContent = (
    <Card className={href ? "cursor-pointer transition-all hover:shadow-md hover:border-accent focus-within:ring-2 focus-within:ring-ring" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          {/* 6.2: label becomes a focusable Tooltip trigger when `definition`
              is provided. The span uses tabIndex={0} + role="button" rather
              than a real <button> because the StatCard's outer element may
              be an <a> (drill-through), and nesting <button> in <a> is
              invalid HTML. The span is keyboard-accessible via tabIndex +
              onKeyDown (Enter/Space → preventDefault to avoid triggering
              the parent <a>'s drill-through; the tooltip opens on focus). */}
          {definition ? (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    role="button"
                    aria-label={`${label} — definition`}
                    onKeyDown={(e) => {
                      // Prevent Enter/Space on the label from triggering the
                      // parent <a>'s drill-through. The tooltip opens on
                      // focus; keyboard users can press Tab to reach the
                      // card body's drill-through link separately.
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded cursor-help"
                  >
                    <CardDescription className="text-xs underline decoration-dotted underline-offset-2">{label}</CardDescription>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs">{definition}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <CardDescription className="text-xs">{label}</CardDescription>
          )}
          <div className={`rounded-md p-1.5 ${color}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sparkline ? (
          <div className="mt-2" aria-hidden="true">{sparkline}</div>
        ) : null}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <a
        href={href}
        aria-label={ariaLabel}
        className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {cardContent}
      </a>
    );
  }
  return cardContent;
}

// =============================================================================
// RateKpiCard — chunk 6.1. The promoted compliance-rate KPI card.
//
// This is the 1.2 rate card content MOVED VERBATIM into a KPI-band-sized
// card. Per 6.1 spec: "Move the rate presentation VERBATIM into a new KPI
// card: numerator/denominator/percentage text, progress bar, tooltip (still
// keyboard-accessible), accessible single-pass reading, and its sparkline.
// Nothing reworded, restyled beyond KPI-card sizing, or dropped."
//
// CONTENT (carried from 1.2 handoff, unchanged):
//   - "N of D required (P%)" text — reads from stats.compliance.rate
//   - Horizontal progress bar (h-2, bg-primary token, NOT a status color)
//   - Keyboard-accessible tooltip (button trigger, delayDuration=0)
//   - aria-label for single-pass screen-reader reading
//   - Zero-denominator edge case: "No requirements configured" (bar not rendered)
//
// SPARKLINE (carried from 4.2b handoff, unchanged):
//   - 280×32 polyline of rateSparklineValues
//   - stroke="var(--status-compliant)", aria-hidden via parent wrapper
//   - Hidden when hasSufficientHistory() is false (rateSparklineValues is [])
//
// SIZING:
//   - Card body uses the SAME compact sizing as StatCard: small label, big
//     value, sparkline below. The rate's "value" is the percentage (the
//     single most-scannable number); the numerator/denominator live in the
//     accessible label + tooltip + (visually) the smaller secondary text.
//   - The progress bar replaces StatCard's plain "value" line — it's the
//     visual representation of the same number.
//
// DRILL-THROUGH: this card is NOT a link (the rate is a derived metric, not
//   a filterable list). StatCard's `href`/`ariaLabel` link mechanism is
//   intentionally NOT used here.
// =============================================================================

interface RateKpiCardProps {
  /** The canonical compliance rate from stats.compliance.rate. */
  numerator: number;
  denominator: number;
  percentage: number;
  /** Sparkline values (already window-sliced + series-extracted). Empty when hasSufficientHistory is false. */
  sparklineValues: (number | null)[];
}

function RateKpiCard({ numerator, denominator, percentage, sparklineValues }: RateKpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs">Compliance Rate</CardDescription>
          {/* No icon-color badge — the rate is a derived metric, not a status.
              Keeping the header structurally identical to StatCard for visual
              rhythm; the right-side slot is intentionally empty. */}
        </div>
      </CardHeader>
      <CardContent>
        {denominator === 0 ? (
          // 1.2 edge case: zero denominator → "No requirements configured",
          // bar not rendered. Per 1.2 handoff edge-case table.
          <p className="text-xl font-bold text-muted-foreground">No requirements configured</p>
        ) : (
          <>
            {/* 1.2: tooltip + keyboard-accessible trigger + aria-label for
                single-pass screen-reader reading. UNCHANGED from the
                retired Compliance Summary card. */}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded text-left"
                    aria-label={`${numerator} of ${denominator} required documents compliant. ${percentage} percent.`}
                  >
                    <p className="text-xl font-bold">
                      {percentage}%
                    </p>
                    <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                      {numerator} of {denominator} required
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
            {/* 1.2: horizontal progress bar, bg-primary token (NOT a status
                color — per 1.2 handoff: "The rate is a derived mix, and
                coloring it green overstates health."). UNCHANGED. */}
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
            {/* 4.2b: rate sparkline. Decorative, aria-hidden via parent
                wrapper. Hidden when sparklineValues is empty (caller passes
                [] when hasSufficientHistory is false). UNCHANGED from the
                retired Compliance Summary card. */}
            {sparklineValues.length > 0 ? (
              <div className="mt-2" aria-hidden="true">
                <Sparkline
                  values={sparklineValues}
                  width={240}
                  height={20}
                  stroke="var(--status-compliant)"
                  strokeWidth={1.5}
                />
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Sparkline — chunk 4.2b. Decorative shape-only polyline for KPI cards.
//
// Auto-scaled; no axes, no numbers (the card's value IS the number). Hidden
// by the caller when hasSufficientHistory() is false. Marked aria-hidden
// (the adjacent card value is the accessible number — the sparkline is
// decorative context). Full history remains accessible via the TrendChart's
// visually-hidden data table.
//
// GEOMETRY: delegated to `buildSparklinePoints` in snapshot.ts (pure). This
// component just renders the SVG shell with the polyline.
//
// GAP HANDLING: null values in the series are skipped by `buildSparklinePoints`
// — the polyline jumps from the previous non-null point to the next, leaving
// a visual gap (consistent with the main chart's connectNulls={false}).
// =============================================================================

interface SparklineProps {
  /** Numeric series (with nulls for gaps). Built via `extractSparklineSeries`. */
  values: (number | null)[];
  /** Pixel width of the sparkline SVG. Defaults to 100. */
  width?: number;
  /** Pixel height of the sparkline SVG. Defaults to 24. */
  height?: number;
  /** Stroke color (CSS var token). Defaults to currentColor. */
  stroke?: string;
  /** Stroke width. Defaults to 1.5. */
  strokeWidth?: number;
}

function Sparkline({
  values,
  width = 100,
  height = 24,
  stroke = "currentColor",
  strokeWidth = 1.5,
}: SparklineProps) {
  const points = buildSparklinePoints(values, width, height);
  if (!points) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      // aria-hidden is set by the parent StatCard wrapper. We don't repeat
      // it here because the sparkline may also be used in non-StatCard
      // contexts where the parent SHOULD set aria-hidden — the convention
      // is "decorative sparkline = parent marks aria-hidden".
      role="presentation"
      focusable={false}
    >
      <polyline
        points={points}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// =============================================================================
// TrendChart — chunk 4.2b. Compliance-rate line chart card.
//
// TITLE: "Compliance Trend" (6.2 may rename — see handoff).
// WINDOW: most recent TREND_WINDOW_DAYS (default 365) of available history,
//   derived from point dates via `sliceTrendToWindow` — never hardcoded.
// RENDERING RULES:
//   - Line breaks at gaps (missing days). `buildChartSeriesWithGaps` inserts
//     explicit null-percentage rows for missing intermediate dates; recharts
//     with connectNulls={false} (default) renders the break.
//   - Y-axis fixed 0–100% with gridlines at 0/25/50/75/100 (honesty > drama).
//   - X-axis labels via the shared date util (formatAbsolute, abbreviated).
//   - Hover tooltips per point: "12 Jun 2026 · 17 of 78 (22%)" — same phrasing
//     as the 1.2 rate card.
//   - Denominator changes across the window (required types or unions
//     changed): the jump is HONEST — rendered as-is. Tooltips self-explain
//     via numerator/denominator. No visual annotation added (see handoff
//     for the decision + counter-proposal).
// INSUFFICIENT HISTORY: hasSufficientHistory() false (0 or 1 points) →
//   placeholder "Trend will appear as daily snapshots are collected."
//   Never an error look, never a fake line. Exactly 2 points → render the
//   chart (degenerate but honest).
// ACCESSIBILITY:
//   - SVG wrapped in a container with role="img" + concise aria-label
//     ("Compliance rate trend, last N days").
//   - Visually-hidden HTML table (date, counts, rate) carries the full
//     series for screen readers — the guaranteed accessible path. Hover
//     tooltips are a mouse bonus, not the accessible path.
//   - Per-point keyboard focus NOT provided (see handoff for the decision
//     + counter-proposal — recharts does not expose per-point focus
//     natively; a custom wrapper would have to inject it).
// =============================================================================

interface TrendChartProps {
  /** Full trend points (as returned by /api/dashboard/trend). The chart will
   * slice to the window itself via sliceTrendToWindow. */
  points: ComplianceTrendPoint[];
  /** Loading state — when true, render a skeleton placeholder. */
  loading?: boolean;
  /** Error message — when present, render an error state with retry. */
  error?: string | null;
  /** Retry callback for the error state's retry button. */
  onRetry?: () => void;
}

function TrendChart({ points, loading, error, onRetry }: TrendChartProps) {
  // --- 1. Slice to the configured window (most recent N days of history) ---
  // Per 4.2b spec: "Window: most recent TREND_WINDOW_DAYS of available
  // history — derived from point dates, never hardcoded." The window is
  // measured from the LAST point's date, NOT from `new Date()` — so a
  // pipeline that's been down for a week still shows the last year of
  // valid data, not "no recent data".
  const windowedPoints = sliceTrendToWindow(points, TREND_WINDOW_DAYS);

  // --- 2. Build the chart data array with explicit gap markers ---
  // `buildChartSeriesWithGaps` inserts null-percentage rows for missing
  // intermediate dates. With connectNulls={false} (default), recharts
  // renders a LINE BREAK at those rows — no interpolation, no synthetic
  // connecting segments.
  const chartData: TrendChartDatum[] = buildChartSeriesWithGaps(windowedPoints);

  // --- 3. Decide: placeholder or chart? ---
  // hasSufficientHistory() === false (0 or 1 points) → placeholder.
  // Exactly 2 points → render (degenerate but honest — one line segment).
  const sufficient = hasSufficientHistory(windowedPoints, 2);
  const windowDays = TREND_WINDOW_DAYS;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Compliance Trend</CardTitle>
            <CardDescription>
              Daily compliance rate over the last {windowDays} days of collected history.
            </CardDescription>
          </div>
          {sufficient && (
            <a href="/api/export/trend" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <FileDown className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[240px] animate-pulse rounded-md bg-muted" />
        ) : error ? (
          <ErrorState description={error} onRetry={onRetry} />
        ) : !sufficient ? (
          // --- PLACEHOLDER: 0 or 1 points ---
          // First-class state, not an error. The pipeline is fresh; the
          // chart will populate as daily snapshots are collected (the
          // /api/cron/compliance-snapshot route fires daily at 7:55 UTC).
          // Worded per 4.2b spec ("Trend will appear as daily snapshots
          // are collected.") — 6.2 may adjust the wording.
          <div className="flex h-[240px] flex-col items-center justify-center text-center">
            <div className="rounded-md bg-muted/50 px-4 py-3">
              <p className="text-sm font-medium text-muted-foreground">
                Trend will appear as daily snapshots are collected.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {windowedPoints.length === 0
                  ? "No snapshots captured yet."
                  : "1 snapshot captured — need at least 2 to draw a trend."}
              </p>
            </div>
          </div>
        ) : (
          // --- CHART (2+ points) ---
          <>
            {/* Accessible label + visually-hidden table for screen readers.
                The SVG below has role="img" with this concise aria-label.
                The table carries the FULL series (every stored point in
                the window) so screen-reader users get the same information
                as sighted users — hover tooltips are NOT the accessible
                path. */}
            <div
              role="img"
              aria-label={`Compliance rate trend, last ${windowedPoints.length} snapshots across ${windowDays} days.`}
            >
              <ResponsiveContainer width="100%" height={240}>
                <LineChart
                  data={chartData}
                  margin={{ left: 4, right: 16, top: 10, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    // Abbreviated date format for the x-axis (compact).
                    // Uses the shared date util — no hardcoded format.
                    tickFormatter={(value: string) => {
                      // Parse the YYYY-MM-DD as UTC (matches snapshot date semantics).
                      const d = new Date(value + "T12:00:00Z");
                      return formatAbsolute(d);
                    }}
                    // Show ~6 ticks to avoid crowding. Recharts auto-selects.
                    minTickGap={30}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value: number) => `${value}%`}
                    width={36}
                  />
                  <RechartsTooltip
                    // Custom tooltip content — see TrendTooltip below.
                    content={<TrendTooltip />}
                    cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="percentage"
                    stroke="var(--status-compliant)"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "var(--status-compliant)" }}
                    activeDot={{ r: 4 }}
                    name="Compliance rate"
                    // connectNulls={false} is the DEFAULT — we make it
                    // explicit so a future change to `true` doesn't
                    // silently start interpolating across gaps.
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Visually-hidden table — the accessible path for screen
                readers. Per 4.2b spec: "a visually-hidden data table
                (date, counts, rate) carrying the full series for screen
                readers." */}
            <TrendAccessibleTable points={windowedPoints} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// --- Custom tooltip: "12 Jun 2026 · 17 of 78 (22%)" — same phrasing as 1.2.
function TrendTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload?: TrendChartDatum }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;

  // Gap rows render a "No data" tooltip — no fabricated number.
  if (datum.isGap || !datum.point) {
    return (
      <div className="rounded-md border bg-background p-2 text-xs shadow-sm">
        <p className="font-medium">{datum.date}</p>
        <p className="text-muted-foreground">No data (no snapshot for this date)</p>
      </div>
    );
  }

  const p = datum.point;
  // The percentage is pre-computed in the metrics module (1.2 invariant).
  // We just render it. If null (zero denominator), show "—" instead of NaN.
  const pctLabel = p.percentage === null ? "—" : `${p.percentage}%`;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-sm">
      <p className="font-medium">
        {/* "12 Jun 2026 · 17 of 78 (22%)" — matches 1.2 phrasing via formatAbsolute */}
        {formatAbsolute(new Date(datum.date + "T12:00:00Z"))} · {p.rateNumerator} of {p.rateDenominator} ({pctLabel})
      </p>
      <p className="text-muted-foreground">
        Compliant {p.compliant} · Expiring {p.expiring} · Overdue {p.overdue} · Missing {p.missing}
      </p>
    </div>
  );
}

// --- Visually-hidden table: full series for screen readers.
function TrendAccessibleTable({ points }: { points: ComplianceTrendPoint[] }) {
  return (
    <table
      className="sr-only"
      aria-label="Compliance trend data, full series"
    >
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Compliant</th>
          <th scope="col">Expiring</th>
          <th scope="col">Overdue</th>
          <th scope="col">Missing</th>
          <th scope="col">Rate numerator</th>
          <th scope="col">Rate denominator</th>
          <th scope="col">Rate percentage</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.date}>
            <td>{formatAbsolute(new Date(p.date + "T12:00:00Z"))}</td>
            <td>{p.compliant}</td>
            <td>{p.expiring}</td>
            <td>{p.overdue}</td>
            <td>{p.missing}</td>
            <td>{p.rateNumerator}</td>
            <td>{p.rateDenominator}</td>
            <td>{p.percentage === null ? "Not applicable" : `${p.percentage}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
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

// =============================================================================
// ComplianceCompositionBar — 100% stacked horizontal bar showing the
// proportional composition of compliance statuses (Compliant / Expiring /
// Overdue / Missing). Replaces the deleted Compliance Status Distribution
// tiles card (chunk 1.3). Uses canonical counts from DashboardMetrics.
//
// Per 1.3 handoff: counts inside this bar's segments are an ACCEPTED
// second appearance of the quartet — they add context. Do not remove KPI
// band counts.
//
// Segment + legend entries are clickable → onFilterCompliance (which
// routes through navigateToComplianceFilter from the 1.3 helper).
// Keyboard: each element is a <button> (focusable, Enter/Space activates).
// Screen readers: visually-hidden list provides full text reading.
// =============================================================================

interface ComplianceCompositionBarProps {
  counts: ComplianceCounts;
  denominator: number;
  totalUnions: number;
  onFilter?: (status: string) => void;
}

function ComplianceCompositionBar({ counts, denominator, totalUnions, onFilter }: ComplianceCompositionBarProps) {
  const tiles = getTileStatuses();

  // Edge: zero denominator → "No requirements configured"
  if (denominator === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Document Compliance Composition</CardTitle>
          <CardDescription>Compliance status breakdown across all unions.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No requirements configured.</p>
        </CardContent>
      </Card>
    );
  }

  // Denominator mismatch guard: sum of applicable counts must equal denominator
  const sum = counts.COMPLIANT + counts.EXPIRING + counts.OVERDUE + counts.MISSING;
  if (sum !== denominator) {
    console.error(
      `[ComplianceCompositionBar] Denominator mismatch: sum of counts (${sum}) != denominator (${denominator}). Not rendering.`,
    );
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Document Compliance Composition</CardTitle>
          <CardDescription>Compliance status breakdown across all unions.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Data inconsistency detected. Please refresh.</p>
        </CardContent>
      </Card>
    );
  }

  // Segments: only non-zero counts render as visible bar segments.
  // Zero-count statuses are omitted from the bar but still appear in the legend.
  const segments = tiles
    .map((status) => ({
      status,
      config: STATUS_CONFIG[status],
      count: counts[status],
      widthPct: (counts[status] / denominator) * 100,
    }))
    .filter((s) => s.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Document Compliance Composition</CardTitle>
        <CardDescription>
          {denominator} required documents across {totalUnions} unions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Visually-hidden screen reader list — full text reading in one pass */}
        <ul className="sr-only">
          {tiles.map((status) => (
            <li key={status}>
              {counts[status]} of {denominator} {STATUS_CONFIG[status].label}
            </li>
          ))}
        </ul>

        {/* Stacked bar: flex row of proportional segments */}
        <TooltipProvider delayDuration={0}>
          <div className="flex h-8 w-full overflow-hidden rounded-lg" role="group" aria-label="Compliance status composition">
            {segments.map((seg) => (
              <Tooltip key={seg.status}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${seg.config.label}: ${seg.count}`}
                    onClick={() => onFilter?.(seg.status)}
                    disabled={!onFilter}
                    className="flex h-full items-center justify-center transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-default"
                    style={{
                      flexBasis: `${seg.widthPct}%`,
                      backgroundColor: seg.config.colorToken,
                    }}
                  >
                    {/* Count inside segment: show only if the segment is wide enough
                        (roughly > 8% of the bar — enough for a 2-digit number) */}
                    {seg.widthPct > 8 && (
                      <span className="text-xs font-semibold text-white mix-blend-difference">
                        {seg.count}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="max-w-xs text-xs">
                    <span className="font-medium">{seg.config.label}: {seg.count}</span>
                    <br />
                    {seg.config.definition}
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>

        {/* Legend row: all 4 statuses including zero-count, clickable */}
        <div className="flex flex-wrap gap-3">
          {tiles.map((status) => {
            const config = STATUS_CONFIG[status];
            const count = counts[status];
            return (
              <TooltipProvider key={status} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${config.label}: ${count}`}
                      onClick={() => onFilter?.(status)}
                      disabled={!onFilter}
                      className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-all hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: config.colorToken }}
                      />
                      <span className="text-muted-foreground">{config.label}</span>
                      <span className="font-medium">{count}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="max-w-xs text-xs">{config.definition}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// RequiredVsOnFileMeters — one meter row per required document type showing
// on-file vs required. Replaces the lollipop chart (chunk 2.2).
//
// Each row: type label + meter track (fill = onFile/required) + text
// "X of Y on file" + "· Z missing" (highlighted using Missing color token).
// Sorted by missing DESC, ties by type name ASC (from the metrics selector).
//
// NOT interactive in this chunk — drill-through deferred to 4.1.
// =============================================================================

function RequiredVsOnFileMeters({
  onFileByType,
  requiredTypes,
  totalUnions,
}: {
  onFileByType: Array<{ documentType: string; count: number }>;
  requiredTypes: string[];
  totalUnions: number;
}) {
  const entries = getRequiredVsOnFileByType(onFileByType, requiredTypes, totalUnions);
  const totalOnFile = sumOnFile(entries);
  const missingColor = STATUS_CONFIG.MISSING.colorToken;

  // Guard: required = 0 for a configured type → omit row + log loudly
  const validEntries = entries.filter((e) => {
    if (e.required === 0) {
      console.error(
        `[RequiredVsOnFileMeters] Type "${e.documentType}" has required=0. Omitting row.`,
      );
      return false;
    }
    if (e.onFile > e.required) {
      console.error(
        `[RequiredVsOnFileMeters] Type "${e.documentType}" has onFile (${e.onFile}) > required (${e.required}). Data inconsistency — rendering without clamping.`,
      );
    }
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Required vs On-File by Type</CardTitle>
        <CardDescription>
          On file vs required across {requiredTypes.length} document types.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5" aria-label="Required vs on-file by document type">
          {validEntries.map((entry) => {
            const fillPct = entry.required > 0 ? (entry.onFile / entry.required) * 100 : 0;
            return (
              <li
                key={entry.documentType}
                aria-label={`${entry.documentType}: ${entry.onFile} of ${entry.required} on file${entry.missing > 0 ? `, ${entry.missing} missing` : ""}`}
                className="space-y-1"
              >
                <div className="flex items-baseline justify-between text-xs">
                  <span className="truncate font-medium" title={entry.documentType}>
                    {entry.documentType}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {entry.onFile} of {entry.required} on file
                    {entry.missing > 0 && (
                      <span style={{ color: missingColor }} className="ml-1 font-medium">
                        · {entry.missing} missing
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(fillPct, 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          {totalOnFile} on file across {requiredTypes.length} types.
        </p>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// NeedsAttentionPanel — "what needs action today": every Overdue and
// Expiring document, most urgent first, with direct links.
//
// Data comes from stats.needsAttention (extracted from the compliance
// matrix by the stats API route). The selector getNeedsAttention() lives
// in the metrics module; the API route uses it to sort. The component
// receives pre-sorted data and only renders.
//
// Rows are NOT interactive in this chunk beyond the link — drill-through
// filtering is deferred to 4.1.
// =============================================================================

function NeedsAttentionPanel({
  items,
  total,
  onNavigate,
}: {
  items: NeedsAttentionItem[];
  total: number;
  onNavigate?: (view: string) => void;
}) {
  const now = new Date();
  const visibleItems = items.slice(0, NEEDS_ATTENTION_CAP);
  const hasMore = total > NEEDS_ATTENTION_CAP;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Needs Attention</CardTitle>
            <CardDescription>Overdue and expiring documents across all unions.</CardDescription>
          </div>
          {total > 0 && (
            <a href="/api/export/stats" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <FileDown className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing needs attention — all required documents are compliant or not yet due.
          </p>
        ) : (
          <>
            <ul className="space-y-2" aria-label="Documents needing attention">
              {visibleItems.map((item, index) => {
                const statusKey = item.status as ComplianceStatus;
                const config = STATUS_CONFIG[statusKey];
                const Icon = config.icon;
                const expiryDate = new Date(item.expiryDate);
                return (
                  <li
                    key={`${item.unionId}-${item.documentType}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/* 6.2: status icon wrapped in a focusable tooltip
                          showing the status definition. The span uses
                          tabIndex={0} so keyboard users can focus the icon
                          to read the definition. The aria-label gives
                          screen-reader users the status name in one pass. */}
                      <TooltipProvider delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              tabIndex={0}
                              role="img"
                              aria-label={`${config.label}: ${config.definition}`}
                              className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded cursor-help"
                            >
                              <Icon
                                className="h-4 w-4"
                                style={{ color: config.colorToken }}
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs">
                              <span className="font-medium">{config.label}</span>: {config.definition}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.documentType}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.unionName}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDueDate(expiryDate, now)}
                      </span>
                      <a
                        href={`/unions/${item.unionId}`}
                        className="text-xs font-medium text-primary hover:underline"
                        aria-label={`View ${item.documentType} for ${item.unionName}`}
                      >
                        View
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
            {hasMore && (
              <div className="mt-3 border-t pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate?.("compliance")}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all {total}
                </button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// ComplianceHeatmap — a color-coded grid (unions × doc types) rendering
// the matrix from 3.2a's selector. Keyboard-navigable with roving tabindex,
// tooltip-explained cells, sticky union-name column.
//
// Cell links: all cells link to /unions/{unionId} (the most specific
// existing route). The union detail page shows documents — the user can
// then find the specific document. No direct document-detail route exists
// (gap logged in handoff for 4.1).
// =============================================================================

interface ComplianceHeatmapProps {
  matrix: UnionDocMatrix;
}

function ComplianceHeatmap({ matrix }: ComplianceHeatmapProps) {
  const now = new Date();

  // Empty state: no unions
  if (matrix.rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compliance Matrix</CardTitle>
          <CardDescription>Union × document type compliance status.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No unions registered.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Compliance Matrix</CardTitle>
            <CardDescription>
              {matrix.rows.length} unions × {matrix.columnTypes.length} document types.
            </CardDescription>
          </div>
          <a href="/api/export/compliance-matrix" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <FileDown className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </a>
        </div>
      </CardHeader>
      <CardContent>
        {/* Grid with sticky union column + horizontal scroll */}
        <div className="overflow-x-auto">
          <div role="grid" aria-label="Compliance matrix" className="inline-block min-w-full">
            {/* Column headers */}
            <div role="row" className="flex">
              <div className="sticky left-0 z-20 w-32 shrink-0 bg-card px-2 py-1 text-xs font-medium text-muted-foreground" />
              {matrix.columnTypes.map((docType) => (
                <div
                  key={docType}
                  className="w-16 shrink-0 px-1 py-1 text-center text-[10px] font-medium leading-tight text-muted-foreground"
                  title={docType}
                >
                  {docType.length > 12 ? docType.slice(0, 10) + "…" : docType}
                </div>
              ))}
            </div>

            {/* Body rows */}
            {matrix.rows.map((row, rowIdx) => (
              <div key={row.unionId} role="row" className="flex">
                {/* Sticky union name */}
                <div className="sticky left-0 z-10 flex w-32 shrink-0 items-center bg-card px-2 py-1">
                  <span className="truncate text-xs font-medium" title={row.unionName}>
                    {row.unionName}
                  </span>
                </div>
                {/* Cells */}
                {row.cells.map((cell, colIdx) => {
                  const config = STATUS_CONFIG[cell.status];
                  const isNotRequired = cell.status === "NOT_APPLICABLE";
                  const hasDueDate = cell.dueDate !== null;
                  const accessibleName = `${row.unionName} — ${matrix.columnTypes[colIdx]}: ${config.label}${hasDueDate ? `, due ${formatAbsolute(cell.dueDate!)}` : ""}${cell.status === "MISSING" ? ". No document on file." : ""}`;

                  return (
                    <TooltipProvider key={colIdx} delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={`/unions/${row.unionId}`}
                            role="gridcell"
                            tabIndex={-1} // roving tabindex — only one cell is tabbable at a time via JS
                            aria-label={accessibleName}
                            className="m-0.5 flex h-8 w-16 shrink-0 items-center justify-center rounded transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                            style={{
                              backgroundColor: config.colorToken,
                              opacity: isNotRequired ? 0.3 : 1,
                              backgroundImage: isNotRequired
                                ? "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(128,128,128,0.15) 3px, rgba(128,128,128,0.15) 6px)"
                                : undefined,
                            }}
                            data-row={rowIdx}
                            data-col={colIdx}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-xs">
                            <span className="font-medium">{row.unionName}</span> — {matrix.columnTypes[colIdx]}
                            <br />
                            <span style={{ color: config.colorToken }}>{config.label}</span>: {config.definition}
                            {hasDueDate && (
                              <>
                                <br />
                                Due: {formatDueDate(cell.dueDate!, now)}
                              </>
                            )}
                            {cell.status === "MISSING" && (
                              <>
                                <br />
                                No document on file.
                              </>
                            )}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend — all statuses including zero-count, labels only.
            6.2: each legend entry is a focus-accessible tooltip trigger
            showing the status definition (matches the composition bar
            legend pattern). The span uses tabIndex={0} + role="img" so
            keyboard users can focus each legend entry to read the
            definition; aria-label gives screen-reader users the status
            name + definition in one pass. */}
        <div className="mt-3 flex flex-wrap gap-2">
          {COMPLIANCE_STATUSES.map((status) => {
            const config = STATUS_CONFIG[status];
            return (
              <TooltipProvider key={status} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      role="img"
                      aria-label={`${config.label}: ${config.definition}`}
                      className="flex items-center gap-1.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-help"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: config.colorToken }}
                      />
                      <span className="text-xs text-muted-foreground">{config.label}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      <span className="font-medium">{config.label}</span>: {config.definition}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// ExpiryForecast — forward-looking card: documents coming due in the
// next 30/60/90 days, mutually exclusive buckets. Bucket boundaries from
// FORECAST_BUCKETS in status config.
//
// The 30-day row routes via the filter helper ('EXPIRING') — it matches by
// definition (any doc in the 30-day bucket is also "Expiring" since
// 30 <= EXPIRING_WINDOW_DAYS). The 60/90 rows have no existing filter
// target (the helper supports single-status only, not date ranges) —
// they are non-interactive. The footer "N already overdue" links via
// the filter helper ('OVERDUE').
// =============================================================================

interface ExpiryForecastCardProps {
  forecast: ExpiryForecast;
  onFilter?: (status: string) => void;
}

function ExpiryForecastCard({ forecast, onFilter }: ExpiryForecastCardProps) {
  const allZero =
    forecast.buckets.every((b) => b.count === 0) && forecast.overdueCount === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Expiry Forecast</CardTitle>
            <CardDescription>Documents coming due, by window.</CardDescription>
          </div>
          {!allZero && (
            <a href="/api/export/expiry-forecast" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <FileDown className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {allZero ? (
          <p className="text-sm text-muted-foreground">
            Nothing due in the next {FORECAST_BUCKETS[FORECAST_BUCKETS.length - 1]} days.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Expiry forecast by time window">
            {forecast.buckets.map((bucket, i) => {
              const label =
                i === 0
                  ? `Within ${bucket.days} days`
                  : `${bucket.fromDays + 1}–${bucket.days} days`;
              const canFilter = i === 0 && !!onFilter; // only the 30-day row is interactive
              return (
                <li
                  key={bucket.days}
                  aria-label={`${label}: ${bucket.count} document${bucket.count === 1 ? "" : "s"}`}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">{label}</span>
                  {canFilter ? (
                    <button
                      type="button"
                      onClick={() => onFilter!("EXPIRING")}
                      className="font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      aria-label={`${label}: ${bucket.count} documents. Click to view expiring documents.`}
                    >
                      {bucket.count}
                    </button>
                  ) : (
                    <span className="font-medium">{bucket.count}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer: overdue count as a link */}
        {forecast.overdueCount > 0 && (
          <div className="mt-3 border-t pt-2">
            <button
              type="button"
              onClick={() => onFilter?.("OVERDUE")}
              disabled={!onFilter}
              className="text-xs font-medium text-destructive hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded disabled:cursor-default"
              aria-label={`${forecast.overdueCount} already overdue. Click to view overdue documents.`}
            >
              {forecast.overdueCount} already overdue
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// SEVERITY_COLORS removed in 5.2 — the panel now uses SEVERITY_BADGE_VARIANT
// (event-type-based severity, attached by the selector via eventSeverity).
// The AuditLog's server-set INFO/WARNING/CRITICAL severity is no longer
// rendered in the panel. If a future chunk wants to display the raw
// AuditLog severity somewhere else (e.g. the Audit page), define a fresh
// map there — don't resurrect this one (it mapped to non-token colors
// like `bg-destructive/10` which is a different system from the
// design-token-based SEVERITY_BADGE_VARIANT).


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
  user: { role: "REGISTRAR" | "INSPECTOR" | "OFFICER" | "REPRESENTATIVE" };
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
  } = useFetch<{
    documentTypes: Array<{ documentType: string; count: number }>;
    total: number;
    requiredTypes: string[];
    totalUnions: number;
  }>("/api/dashboard/document-types");

  // --- Fetch the full compliance matrix for the heatmap ---
  // The /api/compliance endpoint returns the live matrix with per-cell
  // status, documentId, and expiresAt. We map it to ComplianceCell[] for
  // the getUnionDocMatrix selector.
  const {
    data: complianceMatrixData,
    loading: complianceMatrixLoading,
  } = useFetch<{
    unions: Array<{
      unionId: string;
      unionName: string;
      status: string;
      scores: Array<{
        documentType: string;
        status: ComplianceStatus;
        documentId: string | null;
        expiresAt: string | null;
      }>;
    }>;
    documentTypes: string[];
  }>("/api/compliance");

  // --- Fetch the compliance trend for the TrendChart + KPI sparklines (4.2b) ---
  // The /api/dashboard/trend endpoint returns the historical daily snapshot
  // points. Empty array = fresh deployment (no cron run yet) — the
  // TrendChart's placeholder handles this. Trend fetch is independent of the
  // stats fetch so a slow trend endpoint doesn't block the KPI band.
  const {
    data: trendData,
    loading: trendLoading,
    error: trendError,
    refetch: refetchTrend,
  } = useFetch<{ points: ComplianceTrendPoint[] }>("/api/dashboard/trend");

  // --- Windowed trend for the chart + sparklines ---
  // Both the TrendChart and the three sparklines consume the SAME windowed
  // slice. Computed once here, passed to each renderer.
  // The window is sliced via `sliceTrendToWindow` (pure function in
  // snapshot.ts) — the chart does NOT re-slice internally. The sparklines
  // extract their relevant numeric series via `extractSparklineSeries`.
  const windowedTrend = trendData?.points
    ? sliceTrendToWindow(trendData.points, TREND_WINDOW_DAYS)
    : [];
  const trendSufficient = hasSufficientHistory(windowedTrend, 2);
  // Sparkline series — extracted here so the SAME windowed data feeds both
  // the chart and the sparklines (no double-slicing).
  const compliantSparklineValues = trendSufficient
    ? extractSparklineSeries(windowedTrend, "compliant")
    : [];
  const missingSparklineValues = trendSufficient
    ? extractSparklineSeries(windowedTrend, "missing")
    : [];
  const rateSparklineValues = trendSufficient
    ? extractSparklineSeries(windowedTrend, "rate")
    : [];

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of the union registry and compliance status.
        </p>
      </div>

      {/* === Row 1: Quick Actions (unchanged, full width) === */}
      {/* Quick Actions — role-gated per NAV_ITEMS in app-shell.tsx */}
      {onNavigate && (
        <div data-testid="quick-actions" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <a href="/reports/compliance" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="h-auto w-full flex-col gap-1 py-3">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium">Compliance Report</span>
            </Button>
          </a>
        </div>
      )}

      {/* === Row 2: KPI band (7 cards) ===
          6.1: rate promoted here as the 3rd card. auto-fit so the 7 cards
          wrap responsively (never shrink below 140px wide — readability
          floor). DOM order = reading order: Total Unions · Documents ·
          Compliance Rate · Compliant · Expiring · Overdue · Missing. */}
      {statsLoading ? (
        <StatsSkeleton />
      ) : statsError ? (
        <ErrorState description={statsError} onRetry={refetchStats} />
      ) : stats ? (
        <div
          data-testid="kpi-band"
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))`,
          }}
        >
          <StatCard
            label="Total Unions"
            value={stats.totalUnions}
            icon={Building2}
            color="bg-primary/10 text-primary"
            href={unionsListUrl()}
            ariaLabel={`Total Unions: ${stats.totalUnions} — view unions list`}
            definition={DASHBOARD_KPI_DEFINITIONS["Total Unions"]}
          />
          <StatCard
            label="Documents"
            value={stats.activeCount}
            icon={FileText}
            color="bg-primary/10 text-primary"
            href={complianceUnfilteredUrl()}
            ariaLabel={`Documents: ${stats.activeCount} — view compliance overview`}
            definition={DASHBOARD_KPI_DEFINITIONS["Documents"]}
          />
          {/* 6.1: Rate promoted to KPI band. All 1.2 content (tooltip, bar,
              a11y reading) + 4.2b sparkline moved VERBATIM via RateKpiCard. */}
          <RateKpiCard
            numerator={stats.compliance.rate.numerator}
            denominator={stats.compliance.rate.denominator}
            percentage={stats.compliance.rate.percentage}
            sparklineValues={rateSparklineValues}
          />
          {getTileStatuses().map((status) => {
            // 4.2b: sparkline insertion for the COMPLIANT and MISSING cards
            // only (per the 4.2b decision set — see handoff). EXPIRING and
            // OVERDUE do NOT get sparklines. The sparkline is rendered ONLY
            // when hasSufficientHistory() is true; otherwise the card
            // shows just the value (no decorative line, no error).
            const sparklineValues =
              status === "COMPLIANT" ? compliantSparklineValues
              : status === "MISSING" ? missingSparklineValues
              : null;
            const sparkline = sparklineValues && sparklineValues.length > 0
              ? (
                <Sparkline
                  values={sparklineValues}
                  width={100}
                  height={24}
                  // Use the same color token as the card's icon for visual
                  // cohesion. The icon color is set via the `color` prop
                  // above (e.g. "bg-chart-3/20 text-chart-3"); the sparkline
                  // stroke uses just the text-* token via currentColor.
                  stroke="currentColor"
                  strokeWidth={1.5}
                />
              )
              : undefined;
            return (
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
                href={complianceFilterUrl(status)}
                ariaLabel={`${STATUS_CONFIG[status].label}: ${counts![status]} documents — view filtered list`}
                sparkline={sparkline}
                definition={STATUS_CONFIG[status].definition}
              />
            );
          })}
        </div>
      ) : null}

      {/* === Row 3: Needs Attention (wider) | Composition Bar ===
          6.1 final layout. Two-column at >=1024px (Tailwind `lg:`); stacks
          vertically below, with Needs Attention first (actionability first
          per chunk spec). DOM order = reading order. The breakpoint value
          (1024) is the canonical DASHBOARD_BREAKPOINT_PX in status-config.ts. */}
      <div className="grid gap-6 lg:grid-cols-5 items-start">
        {/* Needs Attention panel — wider (3/5 of the row at desktop). */}
        {stats && (
          <div data-testid="needs-attention" className="lg:col-span-3">
            <NeedsAttentionPanel
              items={stats.needsAttention || []}
              total={stats.needsAttention?.length || 0}
              onNavigate={onNavigate}
            />
          </div>
        )}

        {/* Compliance Composition Bar — narrower (2/5 of the row at desktop).
            Fills the slot vacated by the deleted Compliance Status Distribution
            tiles (chunk 1.3). */}
        {stats && counts && (
          <div data-testid="composition-bar" className="lg:col-span-2">
            <ComplianceCompositionBar
              counts={counts}
              denominator={stats.compliance.rate.denominator}
              totalUnions={stats.totalUnions}
              onFilter={onFilterCompliance}
            />
          </div>
        )}
      </div>

      {/* === Row 4: Compliance Heatmap (full width) ===
          6.1 final layout. The heatmap is a wide table; at narrow widths it
          scrolls internally (3.2b's `overflow-x-auto` wrapper INSIDE
          ComplianceHeatmap + sticky union column keep the row labels visible).
          The page must NEVER scroll horizontally at any breakpoint — the
          internal scroll does the work; this outer wrapper is just the
          testid anchor + full-width slot. */}
      {!complianceMatrixLoading && complianceMatrixData && (() => {
        // Map the /api/compliance response to ComplianceCell[] for the selector.
        // This is a pure field mapping — no aggregation or status derivation here.
        const cells: ComplianceCell[] = complianceMatrixData.unions.flatMap((row) =>
          row.scores.map((score) => ({
            unionId: row.unionId,
            documentType: score.documentType,
            status: score.status,
            filedAt: null,
            expiryDate: score.expiresAt ? new Date(score.expiresAt) : null,
            documentId: score.documentId,
          })),
        );
        const unions: UnionSummary[] = complianceMatrixData.unions.map((u) => ({
          id: u.unionId,
          name: u.unionName,
          registrationNo: u.status,
          status: u.status as "ACTIVE" | "SUSPENDED" | "DEREGISTERED",
        }));
        const matrix = getUnionDocMatrix(cells, unions, complianceMatrixData.documentTypes);
        return (
          <div data-testid="heatmap">
            <ComplianceHeatmap matrix={matrix} />
          </div>
        );
      })()}

      {/* === Row 5: Required vs On-File Meters (wider) | Expiry Forecast ===
          6.1 final layout. Meters are wider because they list per-type rows;
          Expiry Forecast is a tighter card with 3 bucket rows. */}
      <div className="grid gap-6 lg:grid-cols-5 items-start">
        {/* Required vs On-File meters — wider (3/5). Replaces the lollipop
            chart (chunk 2.2). */}
        <div data-testid="required-vs-on-file" className="lg:col-span-3">
          {docTypesLoading ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Required vs On-File by Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[240px] animate-pulse rounded-md bg-muted" />
              </CardContent>
            </Card>
          ) : docTypesError ? (
            <ErrorState description={docTypesError} onRetry={refetchDocTypes} />
          ) : docTypesData && docTypesData.requiredTypes && docTypesData.requiredTypes.length > 0 ? (
            <RequiredVsOnFileMeters
              onFileByType={docTypesData.documentTypes}
              requiredTypes={docTypesData.requiredTypes}
              totalUnions={docTypesData.totalUnions}
            />
          ) : null}
        </div>

        {/* Expiry Forecast card — narrower (2/5). 3.3 handoff: temporary
            placement next to Needs Attention; 6.1 moves it here, paired with
            the meters (both are forward-looking compliance views). */}
        {!complianceMatrixLoading && complianceMatrixData && (() => {
          const cells: ComplianceCell[] = complianceMatrixData.unions.flatMap((row) =>
            row.scores.map((score) => ({
              unionId: row.unionId,
              documentType: score.documentType,
              status: score.status,
              filedAt: null,
              expiryDate: score.expiresAt ? new Date(score.expiresAt) : null,
              documentId: score.documentId,
            })),
          );
          const forecast = getExpiryForecast(cells, new Date(), FORECAST_BUCKETS);
          return (
            <div data-testid="expiry-forecast" className="lg:col-span-2">
              <ExpiryForecastCard forecast={forecast} onFilter={onFilterCompliance} />
            </div>
          );
        })()}
      </div>

      {/* === Row 6: Trend Chart | Recent Activity ===
          6.1 final layout. Both are tall cards; pairing them keeps the row
          height balanced. Trend chart is full-featured (chart + accessible
          table); Recent Activity is the 5.1/5.2 panel (state-changing rows +
          session summaries + View-all footer). */}
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {/* Trend chart — 4.2b. Was temporarily near Compliance Summary; 6.1
            moves it to its permanent home. */}
        <div data-testid="trend-chart">
          <TrendChart
            points={trendData?.points ?? []}
            loading={trendLoading}
            error={trendError}
            onRetry={refetchTrend}
          />
        </div>

        {/* Recent activity — 5.1 + 5.2. Was bottom-right of the Compliance
            Summary row; 6.1 moves it to its permanent home, paired with the
            trend chart. */}
        <div data-testid="recent-activity">
          {activityLoading ? (
            <ActivitySkeleton />
          ) : activityError ? (
            <ErrorState description={activityError} onRetry={refetchActivity} />
          ) : activityData && activityData.activity.length > 0 ? (
            <RecentActivityPanel
              events={activityData.activity}
              canViewAudit={user.role === "REGISTRAR" || user.role === "INSPECTOR"}
              onNavigateAudit={onNavigate}
            />
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
    </div>
  );
}

// =============================================================================
// RecentActivityPanel — chunks 5.1 + 5.2.
//
// Renders the selector's output VERBATIM (per the 3.2b rule: component
// renders the selector's output, never classifies/groups/sorts on its own).
//
// The component performs ZERO:
//   - event-type string matching (no "user_login", "session" etc. in here)
//   - sort logic (no .sort calls)
//   - count arithmetic (no `count++`, no per-user aggregation)
//   - severity classification (no severityForEvent / EVENT_SEVERITY import)
//
// 5.2 ADDITIVE: the panel reads `entry.eventSeverity` (attached by the
// selector) and looks it up in SEVERITY_BADGE_VARIANT to pick the Badge
// variant + token color class. The variant map is PRESENTATION (severity →
// token), not classification (action → severity). The grep guard extends
// 5.1's: no event-type strings AND no classifier imports.
//
// STRUCTURE:
//   1. Card header (unchanged from previous panel)
//   2. State-changing rows (existing layout, NEW badge variant by severity,
//      NEW relative timestamp via <time datetime>)
//   3. If zero state-changing: honest empty line "No document or task
//      activity in this window" ABOVE the summaries.
//   4. Session summary lines (one per user): "user · N sessions · last <relative>"
//      NO severity badge (they are not events).
//   5. "View all N" footer (REGISTRAR/INSPECTOR only) → Audit page.
//
// CAP: total visible rows capped at RECENT_ACTIVITY_ROW_CAP (state-changing +
//   summaries combined). Cut cleanly between rows — never truncate mid-line.
// =============================================================================

/**
 * Presentation map: EventSeverity → Badge variant + design-token color class.
 *
 * This is NOT a classifier. The selector attaches `eventSeverity` to each
 * state-changing event; the panel looks up the variant here for rendering.
 * The grep guard forbids `severityForEvent` / `EVENT_SEVERITY` imports —
 * this map is the ONLY place the component touches severity.
 *
 * DESIGN TOKENS (no hex):
 *   success → --status-compliant (sage green) — beneficial actions
 *   warn    → --status-expiring  (warm gold)  — upcoming risk (no current event)
 *   error   → --status-overdue   (rich red)   — failures + negative states
 *   neutral → --status-missing   (warm grey)  — administrative / other
 *
 * The Badge base variant is "outline" (border-based, not solid fill) to
 * match the existing panel styling — the color class adds the tint.
 *
 * TWO BADGE SYSTEMS COEXIST (per 5.2 handoff):
 *   - Compliance status badges (STATUS_CONFIG in status-config.ts): 5
 *     compliance states → label + colorToken + icon. Used by Compliance
 *     cards (Composition Bar, Heatmap, KPI StatCards, Needs Attention,
 *     Required vs On-File).
 *   - Event severity badges (this map): 4 event severities → variant +
 *     token class. Used by Recent Activity panel only.
 *   The two systems share color tokens (the design system only has 4
 *     colored tokens) but are semantically distinct. Unification, if ever
 *     wanted, is a 6.2 discussion — NOT 5.2.
 */
const SEVERITY_BADGE_VARIANT: Record<EventSeverity, { variant: "outline"; className: string }> = {
  success: { variant: "outline", className: "border-status-compliant/30 text-status-compliant bg-status-compliant/10" },
  warn:    { variant: "outline", className: "border-status-expiring/30 text-status-expiring bg-status-expiring/10" },
  error:   { variant: "outline", className: "border-status-overdue/30 text-status-overdue bg-status-overdue/10" },
  neutral: { variant: "outline", className: "border-status-missing/30 text-status-missing bg-status-missing/10" },
};

interface RecentActivityPanelProps {
  /** Raw events from /api/dashboard/activity (already capped by endpoint at 20). */
  events: ActivityEvent[];
  /** Whether the user can navigate to the Audit page (REGISTRAR/INSPECTOR only). */
  canViewAudit: boolean;
  /** SPA navigation callback for the "View all" footer. */
  onNavigateAudit?: (view: string) => void;
}

function RecentActivityPanel({
  events,
  canViewAudit,
  onNavigateAudit,
}: RecentActivityPanelProps) {
  // --- 1. Compute the summary ONCE via the pure selector -------------------
  // The component does NOT classify, group, sort, or attach severity. The
  // selector does all of that; the panel renders the output verbatim.
  // `now` is injected for the relative-time formatter (5.2).
  const now = new Date();
  const summary = getActivitySummary(events, now);

  // --- 2. Apply the cap to the total visible rows -------------------------
  // stateChanging rows take priority (rendered first); summaries fill the
  // remaining cap. Cut cleanly between rows.
  const stateRowsToShow = Math.min(summary.stateChanging.length, RECENT_ACTIVITY_ROW_CAP);
  const remainingCap = RECENT_ACTIVITY_ROW_CAP - stateRowsToShow;
  const summariesToShow = Math.min(summary.sessionSummaries.length, Math.max(0, remainingCap));
  const renderedRowCount = stateRowsToShow + summariesToShow;
  const hasOverflow = summary.totalCount > renderedRowCount || summary.stateChanging.length + summary.sessionSummaries.length > renderedRowCount;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5" />
          Recent Activity
        </CardTitle>
        <CardDescription>Latest actions across the system.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* --- 2a. State-changing rows --- */}
        {/* 5.2 changes: (i) badge variant by eventSeverity (not the AuditLog
            server-set severity); (ii) relative timestamp via <time datetime>
            with a visually-hidden absolute for screen readers. Layout
            unchanged. */}
        {summary.stateChanging.slice(0, stateRowsToShow).map((entry) => {
          const variant = SEVERITY_BADGE_VARIANT[entry.eventSeverity];
          const date = new Date(entry.createdAt);
          const absolute = formatAbsolute(date);
          const relative = formatEventRelative(date, now);
          return (
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
                {/* 5.2: <time datetime={ISO} title={absolute}> + visually-hidden
                     absolute text for screen readers. The title attribute is a
                     native tooltip for sighted mouse users; the visually-hidden
                     text is the accessible path for screen readers (title
                     alone is not accessible). */}
                <p className="text-xs text-muted-foreground">
                  <time dateTime={entry.createdAt} title={absolute}>
                    {relative}
                    <span className="sr-only"> ({absolute})</span>
                  </time>
                </p>
              </div>
              {/* 5.2: badge variant from eventSeverity (NOT the AuditLog
                   server-set severity). The selector attaches eventSeverity;
                   this map picks the variant + token color class. */}
              <Badge
                variant={variant.variant}
                className={`text-[10px] ${variant.className}`}
              >
                {entry.eventSeverity}
              </Badge>
            </div>
          );
        })}

        {/* --- 2b. Honest empty line when zero state-changing events --- */}
        {summary.stateChanging.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No document or task activity in this window
          </p>
        ) : null}

        {/* --- 2c. Session summary lines (one per user) --- */}
        {/* 5.2: NO severity badge on summaries (they are not events).
             Relative timestamp via <time datetime> with visually-hidden
             absolute. Wording ("user · N sessions · last <relative>")
             unchanged from 5.1 except the timestamp format. */}
        {summariesToShow > 0 ? (
          <div className="border-t pt-3 mt-3 space-y-2">
            {summary.sessionSummaries.slice(0, summariesToShow).map((s) => (
              <SessionSummaryRow key={s.user} summary={s} now={now} />
            ))}
          </div>
        ) : null}

        {/* --- 2d. "View all N" footer → Audit page --- */}
        {hasOverflow && canViewAudit && onNavigateAudit ? (
          <div className="border-t pt-3 mt-3">
            <button
              type="button"
              onClick={() => onNavigateAudit("audit")}
              className="text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              aria-label={`View all ${summary.totalCount} activities in the Audit Log`}
            >
              View all {summary.totalCount} →
            </button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// --- SessionSummaryRow: renders one session summary line.
// "registrar@example.com · 4 sessions · last 3 minutes ago" (5.2: relative
// timestamp via formatEventRelative + <time datetime>). NO severity badge
// (per 5.2 spec — summaries are not events).
function SessionSummaryRow({ summary, now }: { summary: SessionSummary; now: Date }) {
  // Pluralize "session" / "sessions" — trivial, in-component (not selector
  // logic; this is presentation, not classification).
  const sessionLabel = summary.count === 1 ? "session" : "sessions";
  const date = new Date(summary.lastAt);
  const absolute = formatAbsolute(date);
  const relative = formatEventRelative(date, now);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="mt-0 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
        {summary.user.charAt(0).toUpperCase()}
      </div>
      <p className="truncate flex-1 min-w-0">
        <span className="font-medium text-foreground">{summary.user}</span>{" "}
        <span>·</span>{" "}
        <span>{summary.count} {sessionLabel}</span>{" "}
        <span>·</span>{" "}
        <span>last{" "}
          <time dateTime={summary.lastAt} title={absolute}>
            {relative}
            <span className="sr-only"> ({absolute})</span>
          </time>
        </span>
      </p>
    </div>
  );
}
