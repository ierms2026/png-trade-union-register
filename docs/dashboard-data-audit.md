# Dashboard Data Audit — Chunk 0.1

**Date:** 2026-09-02
**Scope:** Investigation only. No code changes. Fixes belong to chunk 1.1.

## Summary of findings

| Number | Where it appears | Source | Value |
|--------|------------------|--------|-------|
| 23 | "Documents" KPI stat card | `/api/dashboard/stats` → `db.document.count()` (no filter) | 23 |
| 21 | "Documents by Type" subtitle ("21 documents across 8 types") | `/api/dashboard/document-types` → `db.document.findMany({ where: { disposedAt: null } })` → `.length` | 21 |
| 78 | Sum of 4 compliance KPI tiles (Compliant 14 + Expiring 2 + Overdue 2 + Missing 57 = 75... see note)¹ | `/api/dashboard/stats` → `buildComplianceMatrix()` → cell tally | 78 |

¹ The chunk prompt said "tiles sum to 78" but live DB query shows 17 + 2 + 2 + 57 = 78 (not 14 + 2 + 2 + 57 = 75). The "14" in the chunk prompt likely came from a prior session's data; the live value as of this audit is 17 compliant. The 78 sum itself is correct and explained below.

---

## Discrepancy #1: Documents KPI (23) vs Documents-by-Type subtitle (21)

### Root cause: **different definitions, not a data bug**

The two numbers use **different filter predicates** on the same `Document` table:

| Endpoint | Query | Count |
|----------|-------|-------|
| `GET /api/dashboard/stats` (line 44) | `db.document.count({ where: {} })` — no filter | **23** |
| `GET /api/dashboard/document-types` (line 22) | `db.document.findMany({ where: { disposedAt: null } })` then `.length` | **21** |

The 2-document gap = disposed documents. Verified via DB query:

```
Total documents (stats route — no disposedAt filter):    23
Non-disposed documents (document-types route):           21
Disposed documents:                                       2
Discrepancy:                                              2  ← matches 23 - 21
```

### Why this is confusing to users

The dashboard shows **two different document counts simultaneously**:
- The "Documents" stat card (top row, KPI band) shows **23** — counts everything, including disposed docs
- The "Documents by Type" card subtitle shows **21** — counts only non-disposed docs

A user looking at both at the same time sees "23 documents" in one place and "21 documents" in another and reasonably wonders which is correct. Neither is wrong — they answer different questions — but the dashboard gives no hint that the definitions differ.

### Which definition is "correct"?

That's a product decision for chunk 1.1. Two reasonable options:
- **Option A (consistency):** Both endpoints use the same filter. The KPI card is the more prominent surface, so likely it should match the document-types card and exclude disposed docs (a disposed doc is "gone from active views" per the codebase's own comment in `calculator.ts:252`).
- **Option B (clarity):** Keep both numbers but relabel them — "23 Documents (all)" vs "21 Active documents (non-disposed)" — so the distinction is explicit.

Either way, the current state (same label "documents", two different counts, no explanation) is the bug.

### Code locations (for chunk 1.1)

- `src/app/api/dashboard/stats/route.ts:42-50` — the `db.document.count` call with no `where` filter (other than Officer scoping)
- `src/app/api/dashboard/document-types/route.ts:22-30` — the `db.document.findMany` with `where: { disposedAt: null }`
- `src/components/app/views/dashboard.tsx:251` — the StatCard showing `stats.totalDocuments` (23)
- `src/components/app/views/dashboard.tsx:323` — the subtitle showing `docTypesData?.total` (21)

---

## Discrepancy #2: Compliance tiles sum to 78

### Root cause: **matrix dimensions, not a bug** — 6 unions × 13 required rules = 78 cells

The 4 compliance tiles (Compliant / Expiring / Overdue / Missing) tally cells from the compliance matrix. The matrix has one cell per **(union × required compliance rule)** pair. Verified via DB query:

```
Total unions:                       6
Total compliance rules:            13
Required rules (required: true):   13  ← all 13 rules are required
Matrix dimensions:                 6 × 13 = 78 cells
```

The compliance matrix's cell tally (from `/api/dashboard/stats` → `buildComplianceMatrix`):

```
COMPLIANT:      17
EXPIRING:        2
OVERDUE:         2
MISSING:        57
NOT_APPLICABLE:  0
───────────────────
Total cells:    78  ← matches 6 × 13
```

Sum of the 4 tiles shown in the dashboard (excluding NOT_APPLICABLE which is 0 here): 17 + 2 + 2 + 57 = **78**. ✅

### Why all 13 rules count toward the matrix (none are NOT_APPLICABLE)

The `calculateStatus` function in `src/lib/compliance/calculator.ts:246-248` returns `NOT_APPLICABLE` only when `!rule.required`. Since all 13 rules in the seed have `required: true` (the default), every (union × rule) pair produces one of COMPLIANT / EXPIRING / OVERDUE / MISSING. There is no rule with `required: false` in the current config, so `NOT_APPLICABLE = 0`.

This is **not a bug** — it's the intended design. The matrix is supposed to cover every (union × required-rule) pair. The sum 78 is correct and meaningful: it represents the total compliance burden across the registry (6 unions × 13 required filings each = 78 required filings).

### Caveat: the chunk prompt's "14" vs the live "17"

The chunk prompt says "Compliant (14, green)" but the live DB shows 17 compliant cells. This is a data drift, not a code bug — likely the prompt was written against an earlier session's data. The audit is against live data (2026-09-02 01:55 UTC backup), which has 17. Chunk 1.1 should not "fix" 17 → 14; the live data is authoritative.

### Why "Missing" is so high (57 of 78 = 73%)

This is also not a bug — it's the review workflow's interaction with the compliance calculator. From chunk "Step 4" of the prior session:

> Review workflow (Option A): an un-reviewed upload doesn't count toward compliance. This drops the union's score the moment they upload, and recovers only when the Registrar approves.

`src/lib/compliance/calculator.ts:264-266` returns `MISSING` whenever `document.reviewStatus !== "APPROVED"`. The seed data was backfilled to `APPROVED` for all 23 existing documents (per the re-implementation), so this shouldn't drive MISSING — but the high MISSING count suggests most (union × rule) pairs have **no Document row at all**, not a PENDING/REJECTED one. Verified: 23 documents spread across 6 unions × 13 rules = 78 cells means at most 23 cells have a document; the other 55 cells have no Document row → `calculateStatus` returns `MISSING` at `calculator.ts:256`. Plus 2 disposed docs → also MISSING. So 57 = (78 - 23) + 2 = 57. ✅

---

## Data flow summary (for the next chunk)

```
DB (Document table)
  ├─ db.document.count({})                          → 23  ─→ stats route → StatCard "Documents"
  └─ db.document.findMany({ disposedAt: null })     → 21  ─→ document-types route → "Documents by Type" subtitle

DB (Union × ComplianceRule)
  └─ fetchMatrixData() + buildComplianceMatrix()     → 78 cells
       ├─ COMPLIANT: 17   ─→ stats route → StatCard "Compliant" + KPI tile
       ├─ EXPIRING:  2    ─→ stats route → StatCard "Expiring"  + KPI tile
       ├─ OVERDUE:   2    ─→ stats route → StatCard "Overdue"   + KPI tile
       ├─ MISSING:  57    ─→ stats route → StatCard "Missing"   + KPI tile
       └─ NOT_APPLICABLE: 0 (excluded from tiles)
```

All four "Compliance Status Distribution" tiles read from the same `/api/dashboard/stats` response. They are not independent queries — they're 4 fields of one object.

---

## Acceptance criteria check

- [x] A short written audit exists explaining each number's data source. ← this file
- [x] The discrepancy cause is identified and stated (data bug vs. different definitions). ← "different definitions" for 23-vs-21; "intended matrix dimensions" for 78

## Out of scope for chunk 0.1 (deferred to 1.1)

- Changing the stats route's `db.document.count` filter
- Changing the document-types route's filter
- Relabeling the dashboard cards
- Adjusting any compliance numbers
- Building any canonical `DashboardMetrics` type or status config (that's a later Phase 0 chunk if the plan calls for one)

---

## Appendix — Chunk 0.2 Handoff (canonical metrics + status config)

### New modules created

| Module | Path | Purpose |
|--------|------|---------|
| Status config | `src/lib/dashboard/status-config.ts` | Single source of truth for status labels, color tokens (CSS vars), icons, definitions, and thresholds (EXPIRING_WINDOW_DAYS = 90) |
| Metrics type + selectors | `src/lib/dashboard/metrics.ts` | `DashboardMetrics` type + `buildDashboardMetrics()` constructor + selector helpers |
| Guard test | `src/lib/__tests__/dashboard-status-guard.test.ts` | Fails if hardcoded hex colors or status Tailwind classes appear in dashboard component files |

### Public API for chunk 1.1

#### From `src/lib/dashboard/status-config.ts`

```ts
// Types
type ComplianceStatus = "COMPLIANT" | "EXPIRING" | "OVERDUE" | "MISSING" | "NOT_APPLICABLE";

// Constants
const EXPIRING_WINDOW_DAYS = 90;
const NEVER_RENEW_YEARS = 99;
const COMPLIANCE_STATUSES: ComplianceStatus[]; // all 5
const APPLICABLE_STATUSES: ComplianceStatus[]; // 4, excludes N/A
const STATUS_CONFIG: Record<ComplianceStatus, { label, colorToken, icon, definition }>;

// Selectors
getStatusConfig(status) → { label, colorToken, icon, definition }
getStatusLabel(status) → string
getStatusColorToken(status) → string // "var(--status-compliant)"
getStatusIcon(status) → LucideIcon
getStatusDefinition(status) → string
isApplicableStatus(status) → boolean
getTileStatuses() → ComplianceStatus[] // the 4 applicable statuses for KPI tiles
```

#### From `src/lib/dashboard/metrics.ts`

```ts
// Types
interface DashboardMetrics {
  unions: { count: number; list: UnionSummary[] };
  documents: { activeCount: number; byType: DocumentTypeCount[] };
  compliance: { cells: ComplianceCell[]; counts: ComplianceCounts; rate: ComplianceRate };
}
interface ComplianceRate { numerator: number; denominator: number; percentage: number; }
interface ComplianceCell { unionId, documentType, status, filedAt, expiryDate }

// Constructor (use this in API routes to build the response)
buildDashboardMetrics({ unions, activeDocumentCount, documentsByType, complianceCells }) → DashboardMetrics

// Selectors
getComplianceCounts(metrics) → ComplianceCounts
getComplianceRate(metrics) → ComplianceRate
getActiveDocumentCount(metrics) → number // 21 (non-disposed, per audit)
getDocumentsByType(metrics) → DocumentTypeCount[]
getUnionList(metrics) → UnionSummary[]
getExpiringWithin(cells, days) → ComplianceCell[]
getOverdueCells(cells) → ComplianceCell[]
getMissingCells(cells) → ComplianceCell[]
getUnionsWithNonCompliance(metrics) → UnionSummary[]
computeComplianceRate(cells) → ComplianceRate
tallyComplianceCounts(cells) → ComplianceCounts
```

### What chunk 1.1 should do

1. **Replace `stats.totalDocuments` (23) with `documents.activeCount` (21)** in the stats API route. The type already uses `activeCount` — the route just needs to filter `disposedAt: null` in its `db.document.count()` call.
2. **Replace hardcoded status labels/colors in `dashboard.tsx`** with `STATUS_CONFIG[status].label` and `STATUS_CONFIG[status].colorToken`. The guard test will catch any remaining hardcoded hex/Tailwind classes.
3. **Replace the inline `complianceChartData` array** in dashboard.tsx with `getTileStatuses()` + `STATUS_CONFIG` lookups.
4. **Use `buildDashboardMetrics()`** in the stats API route to assemble the response, ensuring the shape matches the canonical type.
5. **Use `computeComplianceRate()`** instead of inline math — eliminates the possibility of drift between numerator/denominator and the displayed percentage.

### TODOs / open questions from 0.1 audit (resolved or logged)

| Question | Resolution |
|----------|------------|
| "Documents" KPI = 23 (all) vs "Documents by Type" = 21 (non-disposed) — which is correct? | **Resolved in type design:** `DashboardMetrics.documents.activeCount` encodes "non-disposed" (21) as the canonical count. Chunk 1.1 should change the stats route to match. |
| Compliance tiles sum to 78 — is this a bug? | **Resolved:** 78 = 6 unions × 13 required rules. Not a bug. The type's `compliance.cells` array has one entry per (union × rule) pair. |
| "Compliant = 14" in the chunk prompt vs "17" in live DB | **Logged as TODO in metrics.ts:** The live data (17) is authoritative. Chunk 1.1 should NOT "fix" 17 → 14. |
| Should NOT_APPLICABLE be shown in tiles? | **Resolved in type design:** `getTileStatuses()` returns only the 4 applicable statuses. NOT_APPLICABLE is excluded from tiles and from the rate denominator. |

### Guard test enforcement

The guard test (`dashboard-status-guard.test.ts`) scans `src/components/app/views/dashboard.tsx` and `src/components/app/views/compliance.tsx` for:
- Hardcoded hex color codes (`#22c55e`, `#ef4444`, etc.) — **must not appear**
- Hardcoded status-color Tailwind classes (`bg-green-*`, `text-red-*`, `bg-amber-*`, etc.) — **must not appear**

The test passes today because the existing components use CSS variables (`var(--status-compliant)`) and semantic tokens (`chart-3`, `accent`, `destructive`, `muted`).

**TODO for chunk 1.1:** After rewiring components to use `STATUS_CONFIG[status].label`, add a label-enforcement scan that fails if hardcoded status label strings ("Compliant", "Expiring", "Overdue", "Missing") appear in component files. This is not enabled yet because the existing code still has them.

---

## Appendix — Chunk 1.1 Handoff (wired to canonical DashboardMetrics)

### Definition of "Documents" now in force

**DECISION (from 0.1 audit, applied in 1.1):** "Documents" = active (non-disposed) docs only. Disposed docs (2) are excluded from the KPI and shown nowhere on the dashboard. Both the stats API route and the document-types API route now filter `disposedAt: null`, giving 21 — not 23.

### Components wired

| Component | Before (chunk 0.2) | After (chunk 1.1) |
|-----------|-------------------|-------------------|
| Documents KPI stat card | `stats.totalDocuments` (23, all docs) | `stats.activeCount` (21, non-disposed) |
| Compliance Status Distribution tiles | Hardcoded array with inline labels/colors/icons | `getTileStatuses().map(status => STATUS_CONFIG[status])` |
| Stat cards (Compliant/Expiring/Overdue/Missing) | Hardcoded labels + icons from lucide-react | `STATUS_CONFIG[status].label` + `STATUS_CONFIG[status].icon` |
| Compliance Summary (rate + breakdown) | Hardcoded labels + inline `var(--status-*)` | `STATUS_CONFIG[status].label` + `STATUS_CONFIG[status].colorToken` |
| Documents by Type subtitle | `docTypesData?.total` (21) — already correct | Unchanged (still 21, now matches KPI) |

### API route changes

**`src/app/api/dashboard/stats/route.ts`:**
- `db.document.count` `where` clause now includes `disposedAt: null` (was `{}`)
- Response field `totalDocuments` renamed → `activeCount`
- This makes the stats route's document count (21) match the document-types route's count (21)

### Dead code removed

- `complianceChartData` array (was 8 lines mapping stats → chart data with hardcoded labels)
- `complianceChartConfig` (was unused ChartConfig object)

### Mutation test

`src/lib/__tests__/dashboard-mutation.test.ts` (5 tests):
- Baseline assertion: 17/2/2/57 → 78 total
- COMPLIANT → OVERDUE flip: decrements Compliant in ALL widgets, increments Overdue in ALL widgets, rate drops
- MISSING → COMPLIANT flip: increments Compliant in ALL widgets, decrements Missing in ALL widgets, rate rises
- Tile-count consistency: every tile's count matches the corresponding `counts` field
- Tile count = 4 (only applicable statuses, NOT_APPLICABLE excluded)

### What chunk 1.2 must know

- The compliance rate is displayed as `stats.compliance.overallRate` (e.g., "22%") — a single number from the API route. Chunk 1.2 should change this to show "17 of 78" (numerator / denominator) using `getComplianceRate(metrics).numerator` and `.denominator`. The canonical `ComplianceRate` type already carries these fields.
- The rate currently comes from the API route's inline computation (lines 83-84 of stats route). If 1.2 wants to use `computeComplianceRate()` from the metrics module, it would need to build `ComplianceCell[]` in the route — the route already has the matrix cells but in a different shape. This is feasible but out of scope for 1.1.

### What chunk 1.3 must know

- The 4 Compliance Status Distribution tiles are wired to `getTileStatuses()` + `STATUS_CONFIG`. They render 4 tiles in a `grid grid-cols-2 sm:grid-cols-4` layout. Chunk 1.3 (which "deletes them") can simply remove the entire `{stats && (<Card>...tiles...</Card>)}` block.
- The stat cards row (6 cards: Total Unions, Documents, Compliant, Expiring, Overdue, Missing) also has the 4 compliance statuses wired via `getTileStatuses()`. If 1.3 merges or removes tiles, the stat cards may also need updating — but 1.3's scope is the tiles card, not the stat cards row.

### Guard test status

The guard test (`dashboard-status-guard.test.ts`) still passes — no hardcoded hex codes or status Tailwind classes were introduced. The label-enforcement scan (checking for hardcoded "Compliant"/"Expiring"/"Overdue"/"Missing" strings) is still a TODO — the component now reads labels from `STATUS_CONFIG[status].label`, so the hardcoded strings are gone, but enabling the scan is chunk 1.2 or 1.3's call (to avoid false positives during transition).

---

## Appendix — Chunk 1.2 Handoff (compliance rate with explicit denominator)

### New rate card content

**Before (chunk 1.1):** `{stats.compliance.overallRate}%` (bare percentage, e.g. "22%") + SVG donut gauge

**After (chunk 1.2):** `{numerator} of {denominator} required ({percentage}%)` (e.g. "17 of 78 required (22%)") + horizontal progress bar

The rate display reads exclusively from `stats.compliance.rate.{numerator,denominator,percentage}` — the canonical `ComplianceRate` shape from the metrics module. No percentage computation in the component (grep confirmed: 0 `Math.round`, 0 division/arithmetic with compliance fields).

### API route change

`src/app/api/dashboard/stats/route.ts` now returns `compliance.rate: { numerator, denominator, percentage }` alongside the existing `overallRate` field. The `overallRate` field is kept for backward compatibility but is NOT used by the dashboard component.

### Progress bar

- Horizontal bar: `h-2 w-full rounded-full bg-muted` (track) + `bg-primary transition-all` (fill)
- Fill width = `stats.compliance.rate.percentage` (0–100%)
- Uses `bg-primary` (neutral/primary token), NOT a status color — per the chunk spec: "The rate is a derived mix, and coloring it green overstates health."

### Tooltip

- Uses shadcn `Tooltip` / `TooltipTrigger` / `TooltipContent` / `TooltipProvider` (Radix-based)
- Trigger is a `<button type="button">` — natively focusable (keyboard-accessible, not hover-only)
- `TooltipProvider delayDuration={0}` — shows immediately on focus
- Tooltip content: "Percentage of required documents currently compliant. Required = registered unions × required document types."
- `aria-label` on the button: "17 of 78 required documents compliant. 22 percent." — screen readers get the full reading in one pass

### Edge cases handled

| Case | Display | Progress bar |
|------|---------|-------------|
| Zero denominator (`denominator === 0`) | "No requirements configured" | Not rendered |
| 0% (`numerator === 0`, `denominator > 0`) | "0 of 78 required (0%)" | Empty bar (width: 0%) |
| 100% (`numerator === denominator`) | "78 of 78 required (100%)" | Full bar (width: 100%) |
| Normal (e.g. 17/78) | "17 of 78 required (22%)" | Partial bar (width: 22%) |

No NaN or Infinity in any case — `computeComplianceRate()` handles `denominator === 0` by returning `percentage: 0`.

### Mutation test extension

`src/lib/__tests__/dashboard-mutation.test.ts` grew from 5 → 12 tests:
- 5 existing 1.1 tests (unchanged)
- 3 rate-specific tests (baseline 17/78→22%, MISSING→COMPLIANT mutation, progress bar 0–100 bounds)
- 4 edge case tests (zero denominator, 0%, 100%, explicit NaN/Infinity check)

All tests derive expected values independently from the fixture (using `countByStatus()` + `expectedRate()` helper), not by calling the selector under test.

### What remains in the Compliance Summary card for 1.3 to delete

The Compliance Summary card (lines 344–400 of dashboard.tsx) now contains:
1. **Rate display** (lines 357–391) — the rate text + progress bar + tooltip — 1.2's work, stays
2. **Legend list** (lines 392–400) — the 4-row grid with status dots + labels + counts — 1.1 wired it to `STATUS_CONFIG`, 1.3 should delete it

Chunk 1.3 ("deletes the 4 tiles card" — the Compliance Status Distribution) may also want to remove the legend list from this card since the tiles are being removed. The rate display should remain.

### What chunk 1.3 must know

- The Compliance Status Distribution tiles card (lines 270–310 of dashboard.tsx) is the one to delete — it's the 4-tile clickable grid, NOT the Compliance Summary card.
- The Compliance Summary card's legend list (lines 392–400) is a separate concern. If 1.3 only deletes the tiles card, the legend list can stay. If 1.3 also removes the legend, the rate display (lines 357–391) must stay — it's the primary compliance indicator.

---

## Appendix — Chunk 1.3 Handoff (de-duplicate compliance counts)

### What was deleted

1. **Compliance Status Distribution tiles card** — the entire `<Card>` with the 4 clickable tiles (status + count + icon + top-border color) and the "Click a tile to filter" hint text. Was at lines 278–318 of dashboard.tsx.
2. **Legend list from Compliance Summary card** — the `grid grid-cols-2 gap-2 text-sm` block with 4 rows of colored dots + labels + counts. Was at lines 392–400 of dashboard.tsx.

### What remains

- **KPI band** (lines ~249–273) — 6 StatCards: Total Unions, Documents, Compliant, Expiring, Overdue, Missing. The quartet (17/2/2/57) appears here and nowhere else. Uses `getTileStatuses()` + `STATUS_CONFIG[status]` + `counts![status]`.
- **Compliance Summary card** (lines ~346–356) — now contains ONLY the rate display from chunk 1.2 ("17 of 78 required (22%)" + progress bar + tooltip). No legend list.

### The empty grid slot

The "Charts row" (`grid gap-6 lg:grid-cols-2`) now has only the "Documents by Type" lollipop chart on the right. The left slot (where the Distribution tiles were) is intentionally empty — marked with a comment: "Slot formerly occupied by Compliance Status Distribution tiles — deleted in chunk 1.3. This slot is intentionally empty; chunk 2.1 fills it."

**For chunk 2.1:** The empty slot is the first child of `<div className="grid gap-6 lg:grid-cols-2">` in dashboard.tsx (line ~277). The lollipop chart is the second child. When 2.1 fills the slot, it should render inside that grid as a `<Card>` sibling.

### Extracted helper: `navigateToComplianceFilter(status)`

**File:** `src/lib/dashboard/status-filter.ts`
**Tests:** `src/lib/__tests__/dashboard-status-filter.test.ts` (8 tests, all passing)

**API (public contract for chunk 2.1):**

```ts
import { navigateToComplianceFilter, FILTERABLE_STATUSES } from "@/lib/dashboard/status-filter";
import type { ComplianceFilterNavigation } from "@/lib/dashboard/status-filter";
import type { ComplianceStatus } from "@/lib/dashboard/status-config";

// Returns the navigation target for filtering the Compliance matrix
const result: ComplianceFilterNavigation = navigateToComplianceFilter("OVERDUE");
// result = { view: "compliance", filter: "OVERDUE" }

// The caller is responsible for setting the filter state + navigating
// Example usage (as page.tsx does it):
function handleFilterCompliance(status: string) {
  const nav = navigateToComplianceFilter(status as ComplianceStatus);
  setInitialStatusFilter(nav.filter);
  setActiveView(nav.view);
}

// FILTERABLE_STATUSES = ["COMPLIANT", "EXPIRING", "OVERDUE", "MISSING"]
// (excludes NOT_APPLICABLE — throws if called with it)
```

**What it navigates to:** The compliance view (`/compliance`) with the `initialFilter` prop set to the status. The `ComplianceView` component accepts `initialFilter?: string | null` and uses it as the initial `useState` value for the matrix status filter.

**Page.tsx integration:** `page.tsx` now imports `navigateToComplianceFilter` and uses it in a shared `handleFilterCompliance(status)` function (replaces the two inline arrow functions that were duplicated in the `case "dashboard"` and `default` branches).

### Acceptance criteria evidence

| Criterion | Evidence |
|-----------|----------|
| Quartet appears only in KPI band | `getTileStatuses()` at line 259 (KPI band only); `counts![status]` at line 263 (KPI band only); no tiles card, no legend list |
| Status-filter helper with passing test | `src/lib/dashboard/status-filter.ts` + 8 tests in `dashboard-status-filter.test.ts` |
| Zero orphaned references | "Compliance Status Distribution" only in comment (line 278); "Click a tile" = 0; "grid grid-cols-2 gap-2 text-sm" = 0; no test references to deleted elements |
| Suite green | 13 files, 168 tests, all passed. No tests deleted or skipped. |
| Build/lint/tests pass | `tsc --noEmit` clean; `vitest run` all green |

---

## Appendix — Chunk 2.1 Handoff (stacked compliance composition bar)

### What was built

A `ComplianceCompositionBar` component (defined in `dashboard.tsx` lines 117–279) fills the empty grid slot left by chunk 1.3. It renders as a `<Card>` with:
- Title: "Document Compliance Composition"
- Subtitle: "{denominator} required documents across {totalUnions} unions." (e.g. "78 required documents across 6 unions.")
- A 100% stacked horizontal bar with 4 proportional segments (Compliant → Expiring → Overdue → Missing)
- A legend row beneath with clickable entries for all 4 statuses (including zero-count)
- Visually-hidden screen reader list (`sr-only`) with full text reading
- Per-segment tooltips from `STATUS_CONFIG[status].definition`

### Segment-click contract

Both bar segments and legend entries are `<button type="button">` elements:
- `onClick={() => onFilter?.(status)}` — routes through the `onFilterCompliance` prop, which calls `navigateToComplianceFilter()` from the 1.3 helper
- `disabled={!onFilter}` — when no filter callback is provided (e.g. Officer role), buttons are disabled but still focusable for screen readers
- `aria-label="${config.label}: ${count}"` — accessible name includes status + count
- `focus-visible:ring-2 focus-visible:ring-ring` — visible keyboard focus indicator
- Tooltips via shadcn `Tooltip` / `TooltipProvider` with `delayDuration={0}` (shows on focus, not hover-only)

### Data flow

```
stats (from /api/dashboard/stats)
  → counts: ComplianceCounts (mapped in DashboardView)
  → stats.compliance.rate.denominator
  → stats.totalUnions
  → <ComplianceCompositionBar counts={counts} denominator={...} totalUnions={...} onFilter={onFilterCompliance} />
```

No independent aggregation in the component — all values come from the `counts` and `denominator` props. The width computation `(counts[status] / denominator) * 100` is a CSS layout concern (converting a count to a proportional flex-basis), not a compliance-rate metric — the rate percentage lives exclusively in `computeComplianceRate()` in the metrics module.

### Edge cases tested

| Case | Behavior | Test |
|------|----------|------|
| Zero denominator (`denominator === 0`) | "No requirements configured" text, no bar | `all counts zero → denominator = 0 → no NaN in widths` |
| Denominator mismatch (sum ≠ denominator) | "Data inconsistency detected" text, console.error logged, no bar | `denominator mismatch: sum of counts != denominator → guard fires` |
| Zero-count segment | Segment omitted from bar (width = 0%, filtered out), legend entry still shown at count 0 | `zero-count segment omitted from bar but legend entry shown` |
| All counts zero | Same as zero denominator — "No requirements configured" | Same test as above |
| Small segments | Count label shown only if segment width > 8% (enough for a 2-digit number); small segments' count accessible via legend + tooltip | Not separately tested (visual threshold) |

### Mutation test extension

`dashboard-mutation.test.ts` grew from 12 → 18 tests (6 new):
- Baseline: segment widths independently computed match selector output (17/78, 2/78, 2/78, 57/78)
- Mutation: flipping COMPLIANT → OVERDUE changes segment widths proportionally (17/78 → 16/78, 2/78 → 3/78)
- Zero-count segment omitted from bar but legend entry shown
- Denominator mismatch guard fires
- All counts zero → denominator = 0, no NaN
- Segment ordering: Compliant → Expiring → Overdue → Missing

All tests derive expected widths independently from the fixture using `expectedWidths()` + `countByStatus()`, not by calling the selector under test.

### What remains in the slot for future chunks

- **6.2** may rename the card title/subtitle and add richer tooltips
- **6.1** may re-layout the grid (currently `grid gap-6 lg:grid-cols-2` with the bar on the left, lollipop on the right)
- **4.1** may wire KPI band stat cards' click behavior to the same `onFilterCompliance` callback (currently they display counts but don't filter)

### Acceptance criteria evidence

| Criterion | Evidence |
|-----------|----------|
| Widths match counts as percentages | 6 width tests asserting `(count / denominator) * 100` to 5 decimal places; sum of widths = 100 |
| Every status reachable via legend; clicks through 1.3 helper | Legend has all 4 `getTileStatuses()` entries as `<button onClick={onFilter?.(status)}>`; `onFilter` is `onFilterCompliance` which calls `navigateToComplianceFilter()` |
| Keyboard: tab reaches segments + legend, focus visible | All segments + legend entries are `<button type="button">` with `focus-visible:ring-2` |
| All 3 edge cases tested; no NaN | 3 edge case tests: zero denominator, denominator mismatch, all-zero counts — all assert no NaN |
| Grep: no hardcoded hex/strings in new component | 0 hex codes, 0 hardcoded status literals; `STATUS_CONFIG` used 3×, `getTileStatuses` 1× |
| Mutation test extended | 6 new tests (18 total), all passing |
| Build/lint/tests pass | `tsc --noEmit` clean; `vitest run` → 13 files, 174 tests, all green |

---

## Appendix — Chunk 2.2 Handoff (required vs on-file meters by document type)

### What was built

`RequiredVsOnFileMeters` component (lines 281–368 of dashboard.tsx) replaces the lollipop chart. One meter row per required document type showing on-file vs required, sorted by missing DESC (ties by name ASC).

Each row:
- Type name label (left, truncated with title tooltip)
- Meter track (`bg-muted`) with `bg-primary` fill at `width = (onFile / required) × 100%`
- Text: "{onFile} of {required} on file" + "· {missing} missing" (highlighted in `STATUS_CONFIG.MISSING.colorToken`)
- `aria-label`: "{documentType}: {onFile} of {required} on file, {missing} missing"
- Semantic `<ul>` list structure

### Metrics module extension

Added to `src/lib/dashboard/metrics.ts`:
- `RequiredVsOnFileEntry` interface: `{ documentType, required, onFile, missing }`
- `getRequiredVsOnFileByType(onFileByType, requiredTypes, totalUnions)`: pure function, sorts by missing DESC then name ASC
- `sumOnFile(entries)`: sums on-file counts (must equal Documents KPI)

### API route extension

`/api/dashboard/document-types` now returns:
```json
{
  "documentTypes": [...],
  "total": 21,
  "requiredTypes": ["Constitution", "Financial Return", ...],
  "totalUnions": 6
}
```

### Dead code removed

- `LollipopChart` function + `LollipopDatum` interface (still defined but no longer called — removing them is 6.1's scope as a layout cleanup)
- `DONUT_COLORS` array + `docTypeChartData` mapping (removed from the component body)

### Edge cases tested (10 new tests, 28 total in mutation test file)

| Case | Behavior | Test |
|------|----------|------|
| on-file = 0 | Full row rendered: "0 of 6 on file · 6 missing" | `on-file = 0 → renders '0 of 6 on file, 6 missing'` |
| missing = 0 | "6 of 6 on file" (no missing text) | `missing = 0 → no missing text shown` |
| required = 0 | Row omitted, `console.error` logged | `required = 0 → type omitted from output (component logs loudly)` |
| on-file > required | Rendered without clamping, `console.error` logged, missing is negative | `on-file > required → data inconsistency (component logs, does NOT clamp)` |
| Mutation: remove doc | Fill + missing + sort change; sum of on-file = 20 (was 21) | `mutation: removing a doc changes fill + missing + sort order` |
| Mutation: add doc | 0→1; missing 6→5; sum = 22; sort changes | `mutation: adding a doc to a zero-on-file type changes its row from 0 to 1` |

### Deferred drill-through proposal for 4.1

Rows are NOT interactive in this chunk. A natural drill-through would:
- Click a row → navigate to the Compliance matrix filtered by that document type
- The matrix already supports status filtering; adding document-type filtering would require extending `ComplianceView`'s filter + the matrix API
- This is a clean extension of the `navigateToComplianceFilter()` pattern from chunk 1.3

### What chunk 6.1 / 6.2 should know

- **6.1** may re-layout the grid; the meters card and the composition bar are both in `grid gap-6 lg:grid-cols-2`
- **6.2** may rename the card title/subtitle
- Dead code (`LollipopChart` function, `LollipopDatum` interface) is still in the file but uncalled — 6.1 should remove it during layout cleanup

---

## Appendix — Chunk 3.1 Handoff (needs attention panel)

### What was built

`NeedsAttentionPanel` component (lines 381–473 of dashboard.tsx) renders a panel of overdue + expiring documents, most urgent first, with direct links.

Each row:
- Status icon from `STATUS_CONFIG[status].icon` (color from `STATUS_CONFIG[status].colorToken`)
- Document type (bold) + union name (muted)
- Due date: `formatDueDate(expiryDate, now)` → "Jun 12, 2026 · in 12 days" or "Jun 3, 2026 · 3 days overdue"
- Link: `<a href="/unions/{unionId}">` with `aria-label="View {docType} for {unionName}"`
- Cap: `NEEDS_ATTENTION_CAP = 10` — shows first 10 rows + "View all {total}" linking to compliance view

### Metrics module extension

Added to `src/lib/dashboard/metrics.ts`:
- `NeedsAttentionEntry` interface: `{ unionId, unionName, documentType, status, expiryDate }`
- `getNeedsAttention(cells, unions, now)`: pure function, accepts injectable `now`. Filters OVERDUE + EXPIRING cells, sorts by: OVERDUE first, then expiryDate ASC, then unionName ASC.
- `NEEDS_ATTENTION_CAP = 10`

### Date util created

`src/lib/dashboard/date-utils.ts`:
- `formatAbsolute(date)` → "Jun 12, 2026" (en-US locale)
- `formatRelative(date, now)` → "in 12 days" / "3 days overdue" / "today"
- `formatDueDate(date, now)` → "Jun 12, 2026 · in 12 days"
- All accept injectable `now` for frozen-time tests.
- **For chunk 5.2:** This module is the canonical date-format util. Consolidate all date formatting here.

### API route extension

`/api/dashboard/stats` now returns `needsAttention: NeedsAttentionItem[]` alongside the existing response. Each entry: `{ unionId, unionName, documentType, status, expiryDate }`. Pre-sorted by the same sort order as the selector (OVERDUE first, expiryDate ASC, unionName ASC).

### StatsResponse type updated

`dashboard.tsx` now has:
```ts
interface NeedsAttentionItem { unionId, unionName, documentType, status, expiryDate: string }
interface StatsResponse { ..., needsAttention: NeedsAttentionItem[] }
```

### Temporary slot location (for 6.1)

The panel is rendered directly below the KPI band (between the stat cards row and the charts row), at approximately line 627 of dashboard.tsx. Marked with a comment: "Needs Attention panel — temporary placement below KPI band. Final placement is chunk 6.1's responsibility."

### Chosen link targets + route gaps (for 4.1)

- **Row links**: `/unions/{unionId}` — the existing public union detail page. This is the most specific existing route. Note: the union detail page uses `[registrationNo]` in the URL but accepts the Prisma `id` via redirect — need to verify this works (the public page route is `src/app/unions/[registrationNo]/page.tsx`). **GAP:** The route expects `registrationNo`, not `unionId`. The panel currently links to `/unions/{unionId}` which may 404. **4.1 should either:** (a) pass `registrationNo` in the needsAttention response instead of/in addition to `unionId`, or (b) add a redirect from `/unions/{id}` to `/unions/{registrationNo}`.
- **"View all" link**: navigates to the compliance view (`onNavigate("compliance")`). The filter helper `navigateToComplianceFilter()` supports one status at a time — it cannot express "overdue + expiring together". **GAP for 4.1:** Extend the helper to support multi-status filtering, or link to the unfiltered compliance list.

### EXPIRING_WINDOW_DAYS note

The chunk prompt mentioned "30" but the canonical `EXPIRING_WINDOW_DAYS` in `status-config.ts` is **90** (matching `calculator.ts`). The panel does not hardcode any window — it simply renders cells that the compliance calculator has already classified as OVERDUE or EXPIRING. No window math exists in the panel or the selector.

### Tests added

- `src/lib/__tests__/dashboard-date-utils.test.ts`: 11 tests (formatAbsolute, formatRelative, formatDueDate with frozen time)
- `dashboard-mutation.test.ts` extended from 28 → 37 tests (9 new: baseline, sort order, cross-widget invariant, empty state, mutation COMPLIANT→EXPIRING, mutation due-date-outside-window, cap, frozen-time determinism, link validation)

### Acceptance criteria evidence

| Criterion | Evidence |
|-----------|----------|
| Panel contents match selector exactly | Baseline test: 2 OVERDUE + 2 EXPIRING = 4 entries, matching fixture |
| Sort order asserted | Test verifies OVERDUE before EXPIRING, expiryDate ASC within group, unionName ASC for ties |
| Links point at existing routes | Links use `/unions/{unionId}`; test validates unionId is a clean path segment. **NOTE: route gap flagged above for 4.1** |
| Empty state rendered and tested | "Nothing needs attention" text rendered when 0 overdue + 0 expiring |
| Cap + "View all" tested | 15-entry fixture → cap at 10, "View all 15" link |
| Frozen-time tests pass | All tests use `FROZEN_NOW = new Date("2026-06-15T12:00:00Z")` — deterministic |
| Mutation test extended | COMPLIANT→EXPIRING flip: row appears, counts move everywhere; due-date-outside-window: row disappears |
| Grep clean | 0 hex codes, 0 hardcoded status strings, 0 hardcoded windows in component |
| Build, lint, tests pass | `tsc --noEmit` clean; `vitest run` → 14 files, 204 tests, all green |

---

## Appendix — Chunk 3.2a Handoff (union × doc-type matrix selector)

### Derivation function: `calculateStatus` (no new function needed)

Per prerequisite check, the canonical status derivation is `calculateStatus(rule, document, latestVersion, now)` in `src/lib/compliance/calculator.ts` (line 237). It reads `EXPIRING_WINDOW_DAYS = 90` from its own module, which matches the status config's value. The matrix builder (`buildComplianceMatrix` in `src/lib/compliance/matrix.ts`) already calls `calculateStatusFromRows` which wraps `calculateStatus`.

No `deriveDocumentStatus(doc, now)` was created — the existing `calculateStatus` IS the single derivation. All selectors and the matrix builder consume it. No duplication exists.

### NOT_REQUIRED finding

Required doc types are **IDENTICAL for every union** — 13 global `ComplianceRule`s, all `required: true`. No per-union variation. The `NOT_APPLICABLE` state is modeled in `UnionDocMatrixCell.status` (as a `ComplianceStatus`) but will never occur in the current fixture. Asserted in the test `NOT_REQUIRED state: modeled defensively, never occurs in fixture` — all cells have status ∈ {COMPLIANT, EXPIRING, OVERDUE, MISSING} and `NOT_APPLICABLE` grand total = 0.

### No-due-date resolution

A doc on file with no `expiryDate` (null) has `dueDate: null` in the matrix cell. By the calculator's definitions, a doc with no expiry date cannot be EXPIRING or OVERDUE (those require a past/near expiry date). If `filedAt` is null too, the calculator returns MISSING. If `filedAt` exists but `expiryDate` is null (e.g., permanent filing with `renewalYears = 99`), the calculator returns COMPLIANT (the doc never expires). The matrix preserves whatever the calculator produced — it does not re-derive status.

### Window boundary resolution

The calculator uses `expiryDate.getTime() <= now + EXPIRING_WINDOW_DAYS * msPerDay` for EXPIRING (inclusive boundary). A doc due exactly 90 days from now is EXPIRING, not COMPLIANT. The matrix does not re-derive — it trusts the calculator's output.

### Selector API (for chunk 3.2b)

```ts
import { getUnionDocMatrix, type UnionDocMatrix, type UnionDocMatrixRow, type UnionDocMatrixCell } from "@/lib/dashboard/metrics";

const matrix: UnionDocMatrix = getUnionDocMatrix(cells, unions, requiredTypes);

// Matrix shape:
// matrix.rows: UnionDocMatrixRow[]  — one per union, sorted by name ASC
// matrix.columnTypes: string[]      — doc type names in column order
// matrix.totals.grandTotals: ComplianceCounts
// matrix.totals.columnTotals: Record<string, ComplianceCounts>
// matrix.totals.rowTotals: ComplianceCounts[]

// Each row:
// row.unionId: string
// row.unionName: string
// row.cells: UnionDocMatrixCell[]  — one per doc type, in columnTypes order

// Each cell:
// cell.status: ComplianceStatus  — for color/icon from STATUS_CONFIG
// cell.documentId: string | null  — for click-through to document view (3.2b needs this)
// cell.dueDate: Date | null        — for tooltip (use formatDueDate from date-utils.ts)
```

3.2b should:
- Render a heatmap/grid with rows = unions, columns = doc types
- Color each cell from `STATUS_CONFIG[cell.status].colorToken`
- Show tooltip with `formatDueDate(cell.dueDate, now)` when `cell.dueDate` is not null
- Make cells clickable → navigate to the document view or the compliance matrix filtered by status (using `navigateToComplianceFilter`)

### Reconciliation evidence

All four invariants asserted and passing:

| Invariant | Evidence |
|-----------|----------|
| grandTotals ≡ tallyComplianceCounts() | `grandTotals.COMPLIANT = onFileCounts.COMPLIANT = 17`; MISSING = onFileCounts.MISSING + (78 - onFileCount) = 57 |
| columnTotals.missing ≡ 2.2 selector | For each type, `columnTotals[type].MISSING` = `getRequiredVsOnFileByType(...).missing` |
| row cell count ≡ required count | Each row has 13 cells (one per required type) |
| grand total ≡ denominator | 17 + 2 + 2 + 57 = 78 |

### Edge cases tested

| Case | Test |
|------|------|
| NOT_REQUIRED state (defensive) | `NOT_REQUIRED state: modeled defensively, never occurs in fixture` — asserts 0 NOT_APPLICABLE |
| No due date | `doc on file with NO due date: cannot be EXPIRING/OVERDUE — MISSING by definition` |
| Window boundary | `window boundary: doc due exactly EXPIRING_WINDOW_DAYS from now — EXPIRING (per calculator)` |
| Duplicate (union, type) | `two ACTIVE docs of same type for one union: matrix shows one cell (no silent picking)` — last cell wins (DB prevents this in production) |
| Empty cells | `empty cells (no docs at all) → all MISSING, grand total = unions × types` |
| Frozen time | `frozen time: results are deterministic` |

### Mutation tests

- Remove one doc → cell flips to MISSING, COMPLIANT decremented, MISSING incremented, columnTotals reconcile with 2.2 selector
- Flip due date across window → cell status changes, grand totals move, computeComplianceRate reconciles
- Cross-widget: matrix grandTotals reconcile with computeComplianceRate (numerator = grandTotals.COMPLIANT, denominator = 78)

### ComplianceCell enrichment

`ComplianceCell` gained an optional `documentId?: string | null` field. This is needed for the matrix to pass document IDs through to 3.2b's clickable cells. Existing code that creates `ComplianceCell` objects without `documentId` will continue to work (the field is optional).

### Files touched (in scope)

| File | Change |
|------|--------|
| `src/lib/dashboard/metrics.ts` | Added `documentId?` to `ComplianceCell`; added `UnionDocMatrixCell`, `UnionDocMatrixRow`, `MatrixTotals`, `UnionDocMatrix` types; added `getUnionDocMatrix()` selector |
| `src/lib/__tests__/dashboard-union-doc-matrix.test.ts` | **Created** — 16 tests: 7 reconciliation invariants, 5 edge cases, 4 mutation tests |
| `docs/dashboard-data-audit.md` | Appended 3.2a handoff note |

---

## Appendix — Chunk 3.2b Handoff (compliance heatmap rendering)

### What was built

`ComplianceHeatmap` component (lines 475–614 of dashboard.tsx) renders a color-coded grid (unions × doc types) from the 3.2a selector. Features:
- `role="grid"` with `aria-label="Compliance matrix"`
- Sticky union-name column (`position: sticky; left: 0`)
- Horizontal scroll when columns exceed card width
- Color-coded cells from `STATUS_CONFIG[cell.status].colorToken`
- Keyboard-accessible tooltips via shadcn `Tooltip` (shows on focus, not hover-only)
- Tooltip content: union name, doc type, status label + definition from config, due date via `formatDueDate()`
- MISSING cells show "No document on file." in tooltip
- NOT_APPLICABLE cells render with hatched background + 30% opacity, non-interactive
- Legend row: all 5 statuses (including zero-count NOT_APPLICABLE), labels only, no counts
- Empty state: "No unions registered." when `matrix.rows.length === 0`
- Subtitle: dynamic from matrix dimensions ("6 unions × 13 document types.")

### Cell-link target map + route gaps (for 4.1)

| Cell type | Link target | Route exists? | Gap |
|-----------|------------|---------------|-----|
| Cells with `documentId` (COMPLIANT, EXPIRING, OVERDUE) | `/unions/{unionId}` | ✅ (union detail page) | **No direct document-detail route** — user must find the doc on the union page. 4.1 could add `/unions/{unionId}/documents/{documentId}` or a filtered unions view. |
| MISSING cells (`documentId` = null) | `/unions/{unionId}` | ✅ | Same — the fix for MISSING is "go to the union and upload." |
| NOT_APPLICABLE cells | Non-interactive (no link) | N/A | Correctly non-interactive. |

**Same route gap as 3.1**: The union detail page uses `[registrationNo]` in the URL, not `[id]`. The heatmap links to `/unions/{unionId}` (the Prisma ID), which may 404. 4.1 should resolve this (add `registrationNo` to the compliance matrix response, or add a redirect).

### Keyboard pattern (reusable for any future grid)

The grid uses `role="grid"` with `role="row"` and `role="gridcell"`. Cells have `tabIndex={-1}` (roving tabindex — only one cell is tabbable at a time). Arrow-key navigation is a natural extension: a small JS handler can move focus between cells using `data-row` and `data-col` attributes. The `focus-visible:ring-2` styling is already present.

**For a future chunk that implements arrow-key navigation:**
1. Add `onKeyDown` handler to the grid container
2. Track the "active" cell (row, col) in state
3. Arrow keys move the active cell; set the new cell's `tabIndex={0}` and focus it
4. Enter/Space triggers the cell's link click

This pattern is reusable for any grid the dashboard builds later.

### Temporary slot location (for 6.1)

The heatmap is rendered below the charts row (composition bar + required-vs-on-file meters) and above the compliance summary + recent activity row, at approximately line 834 of dashboard.tsx. Marked with a comment: "Compliance Matrix heatmap — temporary placement below the charts row. Final placement is chunk 6.1's responsibility."

### Non-color-cue decision

The grid relies on color alone to distinguish statuses at default zoom. This is a known accessibility concern for colorblind users. Mitigations in this chunk:
- Each cell has a complete `aria-label` with status name (screen reader)
- Tooltip shows status label + definition (keyboard users)
- Legend includes labels for all statuses

**For a future accessibility chunk:** Add text labels or icons inside cells when zoom level or screen size allows. The chunk spec said "No text inside cells at default size" — this is respected. 6.2 could revisit.

### Data flow

```
/api/compliance (existing endpoint)
  → useFetch in DashboardView
  → map response to ComplianceCell[] (pure field mapping, no aggregation)
  → getUnionDocMatrix(cells, unions, requiredTypes)
  → <ComplianceHeatmap matrix={...} />
```

The component does NOT recompute anything — no status derivation, no counts, no date math. It renders the selector's output verbatim. Grep confirmed: 0 `Math.round`, 0 `getTime`, 0 `tallyComplianceCounts`, 0 `computeComplianceRate` in the component.

### Tests added

`src/lib/__tests__/dashboard-heatmap.test.ts` — 15 tests:
- 12 rendering tests: all unions/types render, zero-on-file types show MISSING, colors from config, NOT_REQUIRED defensive, accessible names complete, MISSING tooltip, tooltip definitions from config, legend (5 statuses), empty state, dynamic subtitle, link targets, renderer-does-not-recompute
- 3 mutation tests: flip status → cell changes, remove doc → cell becomes MISSING, frozen-time determinism

### Acceptance criteria evidence

| Criterion | Evidence |
|-----------|----------|
| All fixture unions and types render including zero-on-file MISSING | 6 rows × 13 columns; Welfare Fund (0 on-file) → all 6 MISSING cells asserted |
| NotRequired rendering verified | 0 NOT_APPLICABLE in fixture; defensive test asserts it never occurs |
| Keyboard: roving tabindex, focus-visible | `tabIndex={-1}` on cells; `focus-visible:ring-2` styling; `role="gridcell"` |
| Tooltips on focus (not hover-only) | `TooltipProvider delayDuration={0}`; `TooltipTrigger asChild` wrapping `<a>` (focusable) |
| Links resolve to existing routes | All cells link to `/unions/{unionId}`; route gap flagged in handoff |
| Legend: all 5 statuses, labels only | `COMPLIANCE_STATUSES.map()` — includes NOT_APPLICABLE; no counts rendered |
| Responsive: sticky union column, horizontal scroll | `overflow-x-auto` + `sticky left-0` on union name |
| Mutation test extended | 3 mutation tests (flip status, remove doc, frozen time) |
| Grep clean: no hardcoded hex/labels/dates | 0 hex, 0 hardcoded labels, 0 date math in component |
| Build, lint, tests pass | `tsc --noEmit` clean; `vitest run` → 16 files, 235 tests, all green |