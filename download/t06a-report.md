# T06a: Complete AWAITING_REVIEW on the Dashboard Path — Report

**Task:** T06a  
**Status:** done  
**Date:** 2026-10-05  

---

## Files changed

- `src/lib/dashboard/metrics.ts` — added `tallyStatuses()` and `computeRateFromCounts()` helpers; refactored `computeComplianceRate()` to use `computeRateFromCounts()`
- `src/app/api/dashboard/stats/route.ts` — replaced manual switch+arithmetic with `tallyStatuses()` + `computeRateFromCounts()`; added `awaitingReview` to response
- `src/components/app/views/dashboard.tsx` — added `awaitingReview: number` to `StatsResponse` interface; added `AWAITING_REVIEW: stats.compliance.awaitingReview` to counts literal; added `counts.AWAITING_REVIEW` to the denominator-mismatch-guard sum
- `src/lib/__tests__/dashboard-metrics.test.ts` — added 8 new tests for `tallyStatuses` + `computeRateFromCounts`
- `scripts/t06a-impact-check.ts` — one-off impact-check script (not in `src/`)

---

## Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit 2>&1 \| grep '^src/'` | → 22 errors (was 23 — the `dashboard.tsx:1456` error is gone; zero errors in any touched file) |
| `npx eslint src/` | → 3 errors, 2 warnings (baseline match, no new) |
| `npm test` | → 618 passed / 30 files (was 610, +8 new tests) |
| `SESSION_SECRET=ci-check-only npx next build` | → pass (compiled successfully) |
| `grep -n "AWAITING_REVIEW" src/app/api/dashboard/stats/route.ts` | → 3 matches (L67 comment, L69 comment, L109 `awaitingReview: counts.AWAITING_REVIEW`) |

---

## Deviations from task

None. `db/custom.db` was modified by the impact-check script — reverted with `git checkout -- db/custom.db`. No lockfile changes.

---

## Out-of-scope findings

- `src/lib/compliance/report-html.ts` has the same omission (no `case "AWAITING_REVIEW"` in its switch, and its `totalCells` arithmetic excludes it). This is out of scope per the task ("Do NOT touch [...] the report page") but should be addressed in a future task.
- `src/app/api/portal/dashboard/route.ts`, `src/app/api/export/stats/route.ts`, and `src/app/api/public/stats/route.ts` have the same omission. Also out of scope.

---

## Rule found (step 1)

**`snapshot.ts` and `metrics.ts` agree** (`report-html.ts` is the outlier — it was not updated when AWAITING_REVIEW was added):

- **Numerator** = COMPLIANT count only
- **Denominator** = COMPLIANT + EXPIRING + OVERDUE + **AWAITING_REVIEW** + MISSING (excludes NOT_APPLICABLE)
- AWAITING_REVIEW **is** in the denominator — the document type IS required, the union just hasn't gotten approval yet

### Evidence

**`src/lib/dashboard/snapshot.ts:175-178`** (tallyMatrix):
```typescript
const rateNumerator = compliant;
const rateDenominator = compliant + expiring + overdue + awaitingReview + missing;
```

**`src/lib/dashboard/metrics.ts:191-197`** (computeRateFromCounts — new helper, same rule):
```typescript
const numerator = counts.COMPLIANT;
const denominator =
  counts.COMPLIANT + counts.EXPIRING + counts.OVERDUE + counts.AWAITING_REVIEW + counts.MISSING;
```

**`src/lib/compliance/report-html.ts:84-85`** (OUTLIER — does NOT include AWAITING_REVIEW):
```typescript
const totalCells = compliant + expiring + overdue + missing;  // ← missing awaitingReview
```

---

## What was changed

### Step 2: New helpers in `metrics.ts`

Two new pure helpers added to `src/lib/dashboard/metrics.ts`:

**`tallyStatuses(cells: Array<{ status: ComplianceStatus }>): ComplianceCounts`**
- More general than the existing `tallyComplianceCounts` (which requires `ComplianceCell[]`)
- Accepts any array of objects with a `status` field — works with `ComplianceScoreCell` from the matrix builder
- Returns a `ComplianceCounts` object with all 6 status keys initialized to 0 and counted

**`computeRateFromCounts(counts: ComplianceCounts): ComplianceRate`**
- Takes a `ComplianceCounts` object directly (no re-tally needed)
- Applies the rule: numerator = COMPLIANT, denominator = COMPLIANT + EXPIRING + OVERDUE + AWAITING_REVIEW + MISSING
- Returns `{ numerator, denominator, percentage }`

The existing `computeComplianceRate(cells: ComplianceCell[])` was refactored to delegate to `computeRateFromCounts(tallyComplianceCounts(cells))` — same behavior, less duplicated arithmetic.

### Step 3: Tests (8 new, all passing)

Added to `src/lib/__tests__/dashboard-metrics.test.ts`:

1. **"tallyStatuses counts every ComplianceStatus in the canonical list"** — iterates `COMPLIANCE_STATUSES` (the exported canonical list from `status-config.ts`) so adding a new status breaks this test
2. **"the six counts sum to the number of input cells"** — verifies no cells are silently dropped
3. **"AWAITING_REVIEW is counted (not silently dropped)"** — fixture with only AWAITING_REVIEW cells
4. **"computeRateFromCounts includes AWAITING_REVIEW in the denominator (not in numerator)"** — 2 COMPLIANT / 8 denominator = 25%
5. **"computeRateFromCounts excludes NOT_APPLICABLE from both numerator and denominator"** — 99 N/A cells don't affect the rate
6. **"computeRateFromCounts returns 0 percentage when denominator is 0"** — edge case
7. **"tallyStatuses works with any { status } shape (not just ComplianceCell)"** — tests with ComplianceScoreCell-like objects
8. **"iterating COMPLIANCE_STATUSES covers exactly 6 statuses"** — tripwire: breaks if a 7th status is added

### Step 4: Fixes

**`src/app/api/dashboard/stats/route.ts`**:
- Replaced the 12-line manual switch + arithmetic with:
  ```typescript
  const allCells = matrix.unions.flatMap((row) => row.scores);
  const counts = tallyStatuses(allCells);
  const rate = computeRateFromCounts(counts);
  ```
- Added `awaitingReview: counts.AWAITING_REVIEW` to the response JSON

**`src/components/app/views/dashboard.tsx`**:
- Added `awaitingReview: number;` to the `StatsResponse.compliance` interface (L65)
- Added `AWAITING_REVIEW: stats.compliance.awaitingReview,` to the `counts` object literal (L1462)
- Added `counts.AWAITING_REVIEW` to the denominator-mismatch-guard sum (L709)

---

## Before/after numbers (step 5)

```
Status            BEFORE (old)    AFTER (new)
───────────────   ────────────    ───────────
COMPLIANT         0               0
EXPIRING          0               0
OVERDUE           0               0
AWAITING_REVIEW   (not counted)   20
MISSING           58              58
NOT_APPLICABLE    0               0

Applicable (denom) 58              78
Overall rate       0%              0%
```

**20 AWAITING_REVIEW cells were silently dropped** by the old code. They were counted as neither MISSING nor AWAITING_REVIEW — just invisible. The denominator was 58 (undercounted by 20). The rate was 0% both before and after (because there are 0 COMPLIANT cells in the current seed data), but the denominator is now correct at 78.

If COMPLIANT cells existed, the old rate would have been artificially inflated (same numerator, smaller denominator). With the fix, the rate is honest.

---

## Root cause chain (from T01)

```
status-config.ts was updated to add AWAITING_REVIEW to APPLICABLE_STATUSES
  → getTileStatuses() now returns 5 statuses (was 4)
  → dashboard tile loop iterates all 5 + calls counts![status]
  → counts["AWAITING_REVIEW"] was undefined (key missing from object literal)
  → StatsResponse interface lacked awaitingReview field
  → stats API route had no case "AWAITING_REVIEW" in its switch
  → AWAITING_REVIEW cells were silently dropped from the tally
  → denominator was undercounted
  → rate was potentially inflated
  → KPI tile rendered blank
```

**Fix**: 3 files updated (stats route, StatsResponse interface, counts literal) + 2 new helpers in metrics.ts + 8 new tests. The dashboard KPI tile for Awaiting Review now renders the correct count instead of blank.
