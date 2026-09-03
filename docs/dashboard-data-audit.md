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
