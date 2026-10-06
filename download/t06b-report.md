# T06b: Complete AWAITING_REVIEW Everywhere Else — Report

**Task:** T06b  
**Status:** done (Part 2: needs-human)  
**Date:** 2026-10-05  

---

## Files changed

- `src/lib/compliance/report-html.ts` — added `AWAITING_REVIEW` to switch, `awaitingReview` var, `totalCells` arithmetic, `ReportResult.stats` interface, return object
- `src/app/reports/compliance/page.tsx` — added `AWAITING_REVIEW` to tally switch + `awaitingReview` var + `applicableCells` arithmetic; added Clock icon + blue color to `statusIcon`/`statusColor` switches; replaced hand-typed array with `COMPLIANCE_STATUSES`; added "R" letter for AWAITING_REVIEW in matrix cells; imported `COMPLIANCE_STATUSES` + `Clock`
- `src/app/api/portal/dashboard/route.ts` — replaced manual switch with `tallyStatuses()` + `computeRateFromCounts()`; added `awaitingReview` to response
- `src/app/api/export/stats/route.ts` — replaced manual switch with `tallyStatuses()` + `computeRateFromCounts()`; added "Awaiting Review" row to CSV
- `src/components/portal/views/dashboard.tsx` — added `awaitingReview: number` to compliance type (display unchanged — no tile for it)
- `src/components/app/views/compliance.tsx` — replaced hand-typed status union with `ComplianceStatus` type (L42); added `AWAITING_REVIEW` to summary bar totals + data array; replaced type assertion at L340 with `ComplianceStatus`
- `src/components/app/views/compare.tsx` — replaced hand-typed status union with `ComplianceStatus` type (L37)
- `src/components/portal/views/compliance.tsx` — replaced hand-typed status union with `ComplianceStatus` type (L24); added `AWAITING_REVIEW` to `STATUS_ORDER` record
- `src/lib/__tests__/report-html-awaiting-review.test.ts` — new test file (3 tests)

---

## Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit 2>&1 \| grep '^src/'` | → 22 errors (baseline match, zero in touched files) |
| `npx eslint src/` | → 3 errors, 2 warnings (baseline match) |
| `npm test` | → 621 passed / 31 files (was 618/30, +3 tests, +1 file) |
| `SESSION_SECRET=ci-check-only npx next build` | → pass |
| `grep -rn "COMPLIANT.*EXPIRING.*OVERDUE.*MISSING" src/` | → 5 remaining hits, **all in comments** (no code) |

---

## Deviations from task

None. `db/custom.db` and `bun.lock` restored after impact check. No one-off scripts left in the repo.

---

## Out-of-scope findings

- `src/app/api/public/stats/route.ts` still omits AWAITING_REVIEW (Part 2 — not changed, needs-human).
- The remaining grep hits are all in comments (`vocabulary.ts:35`, `metrics.ts:77`, `dashboard-links.ts:43`, `matrix.ts:159`, `rules/preview/route.ts:87`) — stale documentation that mentions the old 5-status list. Not code, not in scope.

---

## Part 0 finding

**T06a was correct; T01 was wrong.** `report-html.ts` does **not** handle AWAITING_REVIEW in its tally. The switch statement at L76-81 has no `case "AWAITING_REVIEW"` — cells fall through silently. The `totalCells` arithmetic at L84 is `compliant + expiring + overdue + missing` — AWAITING_REVIEW is excluded from the denominator. The only reference to AWAITING_REVIEW in the file was the color config at L30 (`STATUS_COLORS`), added for cell rendering but not for counting.

**Evidence (before fix):**
```typescript
// L76-81: switch with no AWAITING_REVIEW case
switch (cell.status) {
  case "COMPLIANT": compliant++; break;
  case "EXPIRING": expiring++; break;
  case "OVERDUE": overdue++; break;
  case "MISSING": missing++; break;
  case "NOT_APPLICABLE": notApplicable++; break;
}

// L84: totalCells excludes AWAITING_REVIEW
const totalCells = compliant + expiring + overdue + missing;
```

**Now fixed:** the switch has `case "AWAITING_REVIEW": awaitingReview++; break;` and `totalCells` includes `awaitingReview`.

---

## Part 1: Fixes applied

### 1a. `src/lib/compliance/report-html.ts`

- Added `awaitingReview` variable + `case "AWAITING_REVIEW"` to the tally switch
- Changed `totalCells` from `compliant + expiring + overdue + missing` to `compliant + expiring + overdue + awaitingReview + missing` (per the rule)
- Added `awaitingReview: number` to the `ReportResult.stats` interface
- Added `awaitingReview` to the return object

**Tests** (3 new, in `src/lib/__tests__/report-html-awaiting-review.test.ts`):
1. Seeds all 6 statuses via test DB → asserts `stats.awaitingReview === 1`, all 6 counts present, 6 counts sum to 6 (total cells), `totalCells === 5` (applicable), `overallRate === 20%` (1/5)
2. Seeds 1 PENDING doc → asserts `stats.awaitingReview === 1` + HTML contains "Awaiting Review"
3. Tripwire: `COMPLIANCE_STATUSES` has exactly 6 entries

### 1b. `src/app/reports/compliance/page.tsx`

- Tally switch (L64-71): added `case "AWAITING_REVIEW": awaitingReview++; break;`
- `applicableCells` (L75): added `+ awaitingReview` to the sum
- `statusIcon` switch (L103-112): added `case "AWAITING_REVIEW": return <Clock className="h-3 w-3" />;`
- `statusColor` switch (L115-124): added `case "AWAITING_REVIEW": return "text-blue-600";`
- Status breakdown array (L202): replaced `(["COMPLIANT", "EXPIRING", "OVERDUE", "MISSING", "NOT_APPLICABLE"] as const)` with `COMPLIANCE_STATUSES`
- Count lookup (L207): added `s === "AWAITING_REVIEW" ? awaitingReview :` to the ternary chain
- Matrix cell letter (L241): added `cell.status === "AWAITING_REVIEW" ? "R" :` to the ternary chain
- Imports: added `COMPLIANCE_STATUSES` from status-config + `Clock` from lucide-react

### 1c. `src/app/api/portal/dashboard/route.ts` + `src/app/api/export/stats/route.ts`

Both routes: replaced the 12-line manual switch + arithmetic with:
```typescript
const allCells = matrix.unions.flatMap((row) => row.scores);
const counts = tallyStatuses(allCells);
const rate = computeRateFromCounts(counts);
```

- Portal route: added `awaitingReview: counts.AWAITING_REVIEW` to the response JSON
- Export route: added `{ Metric: "Awaiting Review", Value: counts.AWAITING_REVIEW }` to the CSV summary rows

**Portal dashboard view consumer** (`src/components/portal/views/dashboard.tsx`):
- Added `awaitingReview: number` to the `compliance` type in the `PortalDashboardData` interface
- **Display unchanged** — the portal dashboard shows tiles for Compliant/Expiring/Overdue/Missing but has no tile for Awaiting Review. The new field is in the response type so it doesn't break rendering, but it's not displayed. Adding a tile would be a design decision (out of scope).

### 1d. Type literals replaced with canonical `ComplianceStatus`

| File | Line | Before | After |
|---|---|---|---|
| `src/components/app/views/compliance.tsx` | L42 | `"COMPLIANT" \| "EXPIRING" \| "OVERDUE" \| "MISSING" \| "NOT_APPLICABLE"` | `ComplianceStatus` |
| `src/components/app/views/compliance.tsx` | L134 | `{ COMPLIANT: 0, EXPIRING: 0, OVERDUE: 0, MISSING: 0 }` | `{ COMPLIANT: 0, EXPIRING: 0, OVERDUE: 0, AWAITING_REVIEW: 0, MISSING: 0 }` |
| `src/components/app/views/compliance.tsx` | L140-146 | 4 bar entries (C/E/O/M) | 5 bar entries (C/E/O/R/M) with `var(--status-review)` fill |
| `src/components/app/views/compliance.tsx` | L340 | `as "COMPLIANT" \| "EXPIRING" \| ...` | `as ComplianceStatus` |
| `src/components/app/views/compare.tsx` | L37 | `"COMPLIANT" \| "EXPIRING" \| "OVERDUE" \| "MISSING" \| "NOT_APPLICABLE"` | `ComplianceStatus` |
| `src/components/portal/views/compliance.tsx` | L24 | `"COMPLIANT" \| "EXPIRING" \| "OVERDUE" \| "MISSING" \| "NOT_APPLICABLE"` | `ComplianceStatus` |
| `src/components/portal/views/compliance.tsx` | L38-45 | `STATUS_ORDER` record missing `AWAITING_REVIEW` | Added `AWAITING_REVIEW: 2` (between EXPIRING and MISSING) |

---

## Part 2: Public stats proposal (needs-human)

**Current code** (`src/app/api/public/stats/route.ts`, L38-44):
```typescript
switch (cell.status) {
  case "COMPLIANT": compliant++; applicable++; break;
  case "EXPIRING":
  case "OVERDUE":
  case "MISSING": applicable++; break;
}
```
No `case "AWAITING_REVIEW"` — AWAITING_REVIEW cells are silently dropped from `applicable`, undercounting the denominator.

**Proposed change**: Add `case "AWAITING_REVIEW": applicable++; break;` so the public compliance rate matches the staff rate.

**Before/after on seed data**: Same as the other routes — applicable goes from 58 to 78; rate stays 0% (0 COMPLIANT cells).

**What the public UI currently displays from that route**: **Nothing.** No component in `src/` calls `/api/public/stats`. The route exists but has zero consumers. The public portal's hero shows a "Last updated" date (from `/api/public/unions`) but does not display a compliance rate.

**Whether a new field would become publicly visible**: Adding `awaitingReview` to the public stats response would NOT become visible to the public (no consumer reads it). However, fixing the `overallComplianceRate` to include AWAITING_REVIEW in the denominator WOULD change the rate value — if a future consumer displays it, the rate would be lower (more honest) than before. Since no consumer currently displays it, the change is safe but should be a conscious decision: **should the public see a compliance rate that includes "awaiting review" documents in the denominator?** That's a policy question for the Registrar — hence **needs-human**.

---

## Part 3: Before/after table

All changed routes use the same compliance matrix, so the numbers are identical across dashboard stats (T06a), portal dashboard, export stats, and report HTML:

| Status | BEFORE (old) | AFTER (new) |
|---|---|---|
| COMPLIANT | 0 | 0 |
| EXPIRING | 0 | 0 |
| OVERDUE | 0 | 0 |
| AWAITING_REVIEW | (dropped) | 20 |
| MISSING | 58 | 58 |
| NOT_APPLICABLE | 0 | 0 |
| **Applicable (denom)** | **58** | **78** |
| **Rate** | **0%** | **0%** |

20 AWAITING_REVIEW cells were silently dropped before. The denominator was 58 (undercounted by 20). The rate is 0% both before and after (0 COMPLIANT cells), but the denominator is now correct at 78.

---

## Remaining grep results

`grep -rn "COMPLIANT.*EXPIRING.*OVERDUE.*MISSING" src/` — 5 remaining hits, **all in comments** (no code):

| File | Line | Content |
|---|---|---|
| `src/app/api/compliance/rules/preview/route.ts` | L87 | `* Order: COMPLIANT (best) < EXPIRING < OVERDUE < MISSING < NOT_APPLICABLE` (comment) |
| `src/lib/compliance/matrix.ts` | L159 | `// (COMPLIANT / EXPIRING / OVERDUE). For MISSING / NOT_APPLICABLE,` (comment) |
| `src/lib/dashboard/vocabulary.ts` | L35 | `// Compliance statuses (COMPLIANT / EXPIRING / OVERDUE / MISSING / NOT_APPLICABLE)` (comment) |
| `src/lib/dashboard/dashboard-links.ts` | L43 | `* @param status One of the applicable compliance statuses (COMPLIANT, EXPIRING, OVERDUE, MISSING)` (comment) |
| `src/lib/dashboard/metrics.ts` | L77 | `/** Number of applicable cells (COMPLIANT + EXPIRING + OVERDUE + MISSING) */` (comment) |

No code-level hand-typed status lists remain. All code now uses either `ComplianceStatus` (the canonical type), `COMPLIANCE_STATUSES` (the canonical array), or `tallyStatuses()`/`computeRateFromCounts()` (the canonical helpers).
