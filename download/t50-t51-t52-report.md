# T50 / T51 / T52 — Combined Report

**Tasks:** T50, T51, T52 (done in this order, one branch each)  
**Status:** all done  
**Date:** 2026-10-05

---

## Branch structure

| Task | Branch | Branched from | Commit |
|---|---|---|---|
| T50 | `fix/t50-awaiting-review-no-expiry` | `main` (`753ed0e`) | `387c0b2` |
| T51 | `fix/t51-unions-export-real-route-test` | `fix/t50-…` (`387c0b2`) | `72d06ef` |
| T52 | `fix/t52-portal-compliance-status-badge` | `fix/t51-…` (`72d06ef`) | `71ba82f` |

`main` was reset back to `753ed0e` (the pre-T50 base) after the task commits were redirected to their own branches. No commits lost, no rebase, no push.

---

## Verification summary (on `fix/t52-…`, which contains all three tasks)

| Command | Baseline before T50 | After all three |
|---|---|---|
| `npm run typecheck 2>&1 \| grep '^src/' \| wc -l` | 0 | 0 (baseline match) |
| `npm run lint` | 3 errors, 2 warnings | 3 errors, 2 warnings (baseline match) |
| `npm test` | 631 passed / 34 files | **640 passed / 37 files** (+9 tests, +3 files) |
| `SESSION_SECRET=ci-check-only npx next build` | pass | pass |

Defaults relied on: **D4** (T52 only). T50 and T51 relied on none.

---

# T50: Awaiting Review documents must not get expiry dates or renewal notices

**Branch:** `fix/t50-awaiting-review-no-expiry`  
**Commit:** `387c0b2`  
**Status:** done

## Files changed

- `src/lib/compliance/matrix.ts` — added `status !== "AWAITING_REVIEW"` to the `expiresAt` condition (L170); updated comment explaining why
- `src/lib/compliance/sweep-issues.ts` (new) — extracted the issue-collection loop from the cron route into an exported `collectSweepIssues()` function; includes the AWAITING_REVIEW defensive guard
- `src/app/api/cron/compliance-sweep/route.ts` — replaced the inline issue-collection loop with a call to `collectSweepIssues()`
- `src/components/app/views/dashboard.tsx` — fixed stale comment L41: "6 stat cards" → "7 stat cards (unions, documents, compliant, expiring, overdue, awaiting review, missing)"
- `src/lib/__tests__/t50-awaiting-review-expiresAt.test.ts` (new) — matrix test
- `src/lib/__tests__/t50-sweep-awaiting-review.test.ts` (new) — sweep test

## The bug (confirmed by reading both pieces of code)

**`src/lib/compliance/matrix.ts:158-165` (before):**
```typescript
// expiresAt is only meaningful for ACTIVE filings
// (COMPLIANT / EXPIRING / OVERDUE). For AWAITING_REVIEW / MISSING /
// NOT_APPLICABLE, it's null — see /api/compliance/route.ts for the
// full rationale.
const expiresAt =
  latestVersion && status !== "NOT_APPLICABLE" && status !== "MISSING"
    ? computeExpiryDate(latestVersion.uploadedAt, rule.renewalYears).toISOString()
    : null;
```

The comment says AWAITING_REVIEW gets `expiresAt: null`, but the code only excludes `NOT_APPLICABLE` and `MISSING`. AWAITING_REVIEW cells get a real expiry date computed from the upload date.

**`src/app/api/cron/compliance-sweep/route.ts:102-119` (before):**
```typescript
for (const row of matrix.unions) {
  for (const cell of row.scores) {
    if (!cell.expiresAt) continue;
    ...
    if (tier) {
      issues.push({ ... });
    }
  }
}
```

The sweep skips cells only when `expiresAt` is null. Because AWAITING_REVIEW cells had a non-null `expiresAt`, the sweep could fire `T_30_DAYS` ("URGENT renewal") and `T_0_OVERDUE` / `T_30_OVERDUE` ("Notice of Non-Compliance") notifications — and auto-create Non-Compliance tasks — for documents that are only waiting for the Registrar's review.

## Tests (written first, run before the fix)

### T50a: matrix test (`t50-awaiting-review-expiresAt.test.ts`)

Seeds 1 union + 4 required rules + 4 documents:
- COMPLIANT (APPROVED, 30d ago)
- EXPIRING (APPROVED, 335d ago)
- OVERDUE (APPROVED, 400d ago)
- AWAITING_REVIEW (PENDING, 340d ago — would expire in ~25d if the date were computed)

Calls the real `fetchMatrixData()` + `buildComplianceMatrix()`, then asserts:
- `awaiting.expiresAt === null` (the fix)
- `compliant.expiresAt`, `expiring.expiresAt`, `overdue.expiresAt` are all non-null (the fix doesn't over-exclude)

**Before the fix:** test failed with `expected null, received "2026-10-30T10:41:11.850Z"`.

### T50b: sweep test (`t50-sweep-awaiting-review.test.ts`)

Seeds 1 union + 2 required rules + 2 documents:
- AWAITING_REVIEW (PENDING, 340d ago — would land in T_30_DAYS if the date were computed)
- OVERDUE (APPROVED, 400d ago — should fire T_30_OVERDUE)

Calls the real `collectSweepIssues()` (the extracted function the cron route uses), then asserts:
- No issues for "Awaiting Doc" (the fix)
- At least 1 issue for "Overdue Doc" (proves the function isn't just returning empty)
- The overdue issue's tier is `T_30_OVERDUE`

## The fix

### matrix.ts

```typescript
const expiresAt =
  latestVersion && status !== "NOT_APPLICABLE" && status !== "MISSING" && status !== "AWAITING_REVIEW"
    ? computeExpiryDate(latestVersion.uploadedAt, rule.renewalYears).toISOString()
    : null;
```

One condition added. The comment now explains why:
> T50: AWAITING_REVIEW is excluded because the renewal clock should not start until the Registrar approves the document. Computing an expiry date from the upload date would make a document that sat in review for 6 months show as "expires in 6 months" when finally approved — misleading, and it caused the compliance sweep to send renewal notices for un-approved documents.

### sweep-issues.ts (new)

Extracted the issue-collection loop into `collectSweepIssues(matrix, renewalByType, now)`. The cron route now calls this function. The function includes a defensive guard:

```typescript
// AWAITING_REVIEW defensive guard (T50): even if a future change
// re-introduces an expiry date on these cells, the sweep must never
// send renewal notices for documents that haven't been approved.
if (cell.status === "AWAITING_REVIEW") continue;
```

This is defense-in-depth: the matrix.ts fix makes `expiresAt` null for AWAITING_REVIEW, so the `if (!cell.expiresAt) continue;` guard already skips them. But the explicit AWAITING_REVIEW guard ensures that even if a future change re-introduces a date, the sweep still won't notify.

### dashboard.tsx comment

L41: `//   - 6 stat cards (unions, documents, compliant, expiring, overdue, missing)` → `//   - 7 stat cards (unions, documents, compliant, expiring, overdue, awaiting review, missing)`

## Other consumers of `expiresAt` (grep result)

| Consumer | Pattern | Effect of T50 fix |
|---|---|---|
| `src/components/app/views/dashboard.tsx:1659,1714` | `score.expiresAt ? new Date(score.expiresAt) : null` | AWAITING_REVIEW → null → skipped in needs-attention (already correct) |
| `src/components/app/views/compliance.tsx:363` | `{cell.expiresAt && (...)}` | AWAITING_REVIEW → no "Expires:" line in tooltip (correct — no date to show) |
| `src/components/portal/views/compliance.tsx:117` | `{cell.expiresAt && (...)}` | AWAITING_REVIEW → no date line (correct) |
| `src/app/reports/compliance/page.tsx:85` | `score.expiresAt ? new Date(score.expiresAt) : null` | AWAITING_REVIEW → null (correct) |
| `src/app/api/v1/compliance/status/route.ts:117` | `if (cell.expiresAt)` | AWAITING_REVIEW → skipped (correct) |
| `src/app/api/portal/dashboard/route.ts:91` | `.filter((cell) => cell.expiresAt !== null)` | AWAITING_REVIEW → filtered out (correct) |
| `src/app/api/calendar/route.ts:135` | `if (!cell.expiresAt) continue;` | AWAITING_REVIEW → skipped (correct) |
| `src/app/api/export/compliance-matrix/route.ts:30` | `cell.expiresAt ? ... : ""` | AWAITING_REVIEW → blank cell (correct) |
| `src/app/api/export/compliance/route.ts:26` | `cell.expiresAt ?? ""` | AWAITING_REVIEW → blank (correct) |
| `src/app/api/export/expiry-forecast/route.ts:37` | `if (!cell.expiresAt) continue;` | AWAITING_REVIEW → skipped (correct) |

All consumers handle `null` gracefully. No consumer expects a date on an AWAITING_REVIEW cell. No UI will show a blank where a date was previously shown — AWAITING_REVIEW cells were already not showing dates in most places (the date was computed but the UI guarded on `expiresAt` being truthy, and where it did show, it was misleading).

## Verification

| Command | Result |
|---|---|
| `npm run typecheck 2>&1 \| grep '^src/' \| wc -l` | 0 (baseline match) |
| `npm run lint` | 3 errors, 2 warnings (baseline match) |
| `npm test` | 633 passed / 36 files (was 631/34; +2 new tests, +2 files) |
| `SESSION_SECRET=ci-check-only npx next build` | pass |

## Defaults relied on

none

## Deviations from task

none

## Out-of-scope findings

- **Renewal clock start date:** the fix makes AWAITING_REVIEW cells have `expiresAt: null`, so no expiry is computed until approval. But the renewal period still starts at the upload date (not the approval date) for APPROVED documents. Whether it should start at approval is an open question for the Registrar — left unchanged per the task.
- **`src/lib/compliance/calculator.ts:354-388` `STATUS_BADGE_CLASSES`** — still orphaned (not imported anywhere). Pre-existing, out of scope.

---

# T51: Make the unions-export test exercise the real route

**Branch:** `fix/t51-unions-export-real-route-test` (branched from T50)  
**Commit:** `72d06ef`  
**Status:** done

## Files changed

- `src/lib/compliance/unions-export.ts` (new) — extracted `buildUnionsExport()` (query + row-building) used by both the route and the test
- `src/app/api/export/unions/route.ts` — route now calls `buildUnionsExport()`, does auth + scoping + CSV response only
- `src/lib/__tests__/export-unions-documents-count.test.ts` — replaced the two T40 tests (which copied the query) with two tests that call the real `buildUnionsExport()`; removed the "OLD query shape" test

## The problem

T40's tests copied the route's query inline (`testDb.union.findMany({ select: { _count: { ... } } })`), so a future regression in the route's actual query would not fail the tests. The tests asserted the Prisma query shape works, not that the route's code works.

## The fix: extract `buildUnionsExport()`

`src/lib/compliance/unions-export.ts` (new) exports `buildUnionsExport(opts: { assignedUnionId?: string | null })` which:
1. Runs the Prisma query (with the T40 filtered relation count: `_count: { select: { documents: { where: { disposedAt: null } } } }`)
2. Builds the rows (same field order + defaults as before)
3. Returns `{ csv, rows }`

The route handler (`src/app/api/export/unions/route.ts`) now does:
1. Auth (`getAuthUserOrApiKey` + `hasScope`)
2. Scoping (Officer → `assignedUnionId`)
3. Calls `buildUnionsExport({ assignedUnionId })`
4. Wraps the CSV in a download response

The test calls `buildUnionsExport()` directly — no Next server, no auth faking, but the REAL query + row-building code runs.

## Tests (2 new, replacing the 2 old T40 tests)

1. **"a union with 2 active + 1 disposed document gives Documents = 2"** — seeds 1 union + 3 documents (2 active + 1 disposed), calls `buildUnionsExport()`, asserts `rows[0]["Documents"] === 2` (not undefined, not NaN), and the CSV contains `2` not `,1,`.
2. **"the CSV column is not undefined or NaN for a union with zero documents"** — seeds 1 union + 0 documents, calls `buildUnionsExport()`, asserts `rows[0]["Documents"] === 0`.

The old "OLD query shape returns undefined" test was removed per the task.

## Guard proof

Temporarily put the old array-style select back in `buildUnionsExport()`:
```typescript
documents: { select: { _count: true } },  // old shape
// ...
"Documents": (u as unknown as { documents: { _count: number }[] }).documents._count,
```

Both tests failed:
```
AssertionError: expected undefined to be 2
AssertionError: expected undefined to be +0
```

Reverted; tests pass.

## Verification

| Command | Result |
|---|---|
| `npm run typecheck 2>&1 \| grep '^src/' \| wc -l` | 0 |
| `npm run lint` | 3 errors, 2 warnings (baseline match) |
| `npm test` | 633 passed / 36 files (no change from T50 — T51 is a test-quality refactor: replaced 2 copied-logic tests with 2 real-code tests) |
| `SESSION_SECRET=ci-check-only npx next build` | pass |

## Defaults relied on

none

## Deviations from task

none

## Out-of-scope findings

none

---

# T52: Portal compliance status badge

**Branch:** `fix/t52-portal-compliance-status-badge` (branched from T51)  
**Commit:** `71ba82f`  
**Status:** done

## Files changed

- `src/components/app/compliance-status-badge.tsx` (new) — `ComplianceStatusBadge` component using `COMPLIANCE_STATUS_CONFIG` labels + the same visual tokens as the staff compliance view's `STATUS_VISUAL`
- `src/components/portal/views/compliance.tsx` — replaced `StatusBadge` import/usage with `ComplianceStatusBadge`
- `src/lib/__tests__/t52-compliance-status-badge.test.ts` (new) — 7 tests (6 per-status + 1 icon check)

## Step 1: What a rep saw before T52 (confirmed)

`StatusBadge` (`src/components/app/status-badge.tsx:30-39`):

```typescript
const STATUS_CONFIG: Record<string, StatusBadgeConfig> = {
  ACTIVE: { icon: CheckCircle2, variant: "default", className: "bg-chart-3/15 text-chart-3 border-chart-3/30" },
  SUSPENDED: { icon: Pause, variant: "secondary", className: "bg-accent/15 text-accent-foreground border-accent/30" },
  DEREGISTERED: { icon: XCircle, variant: "secondary", className: "bg-muted text-muted-foreground border-border" },
};

export function StatusBadge({ status }: { status: UnionStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.DEREGISTERED;  // ← fallback
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={`gap-1 ${config.className}`}>
      <Icon className="h-3 w-3" />
      {getUnionStatusLabel(status as "ACTIVE" | "SUSPENDED" | "DEREGISTERED")}  // ← raw enum for unknown
    </Badge>
  );
}
```

- Line 31: `STATUS_CONFIG[status] ?? STATUS_CONFIG.DEREGISTERED` — any unknown status (all 6 compliance statuses) falls back to DEREGISTERED (muted/grey tint + XCircle icon)
- Line 37: `getUnionStatusLabel(status)` calls `UNION_STATUS_CONFIG[status]?.label ?? status` — for a compliance status like "AWAITING_REVIEW", the lookup fails and it returns the raw string "AWAITING_REVIEW"

**Before T52 — what a rep saw for each compliance status:**

| ComplianceStatus | Visual (DEREGISTERED fallback) | Text |
|---|---|---|
| COMPLIANT | grey/muted tint + XCircle icon | "COMPLIANT" (raw enum) |
| EXPIRING | grey/muted tint + XCircle icon | "EXPIRING" (raw enum) |
| OVERDUE | grey/muted tint + XCircle icon | "OVERDUE" (raw enum) |
| AWAITING_REVIEW | grey/muted tint + XCircle icon | "AWAITING_REVIEW" (raw enum) |
| MISSING | grey/muted tint + XCircle icon | "MISSING" (raw enum) |
| NOT_APPLICABLE | grey/muted tint + XCircle icon | "NOT_APPLICABLE" (raw enum) |

**Report confirmed: the report is correct.** Every compliance status showed deregistered styling and raw enum text in capitals.

## The fix: new `ComplianceStatusBadge` component

`src/components/app/compliance-status-badge.tsx` (new):

```typescript
const COMPLIANCE_VISUAL: Record<ComplianceStatus, { icon: LucideIcon; className: string }> = {
  COMPLIANT: { icon: CheckCircle2, className: "bg-chart-3/15 text-chart-3 border-chart-3/30" },
  EXPIRING: { icon: AlertTriangle, className: "bg-accent/15 text-accent-foreground border-accent/30" },
  OVERDUE: { icon: XCircle, className: "bg-destructive/10 text-destructive border-destructive/30" },
  AWAITING_REVIEW: { icon: Clock, className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900" },
  MISSING: { icon: FileQuestion, className: "bg-muted text-muted-foreground border-border" },
  NOT_APPLICABLE: { icon: Ban, className: "bg-muted/50 text-muted-foreground border-border" },
};

export function ComplianceStatusBadge({ status }: { status: ComplianceStatus }) {
  const visual = COMPLIANCE_VISUAL[status] ?? COMPLIANCE_VISUAL.MISSING;
  const Icon = visual.icon;
  const label = COMPLIANCE_STATUS_CONFIG[status]?.label ?? status;
  return (
    <Badge variant="outline" className={`gap-1 ${visual.className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
```

- Visual tokens (icon + className) match the staff compliance view's `STATUS_VISUAL` (from `compliance.tsx:64-71`) — consistent colors + icons across staff + portal
- Label comes from `COMPLIANCE_STATUS_CONFIG[status].label` (single source per T20/D4)
- `StatusBadge` (for union statuses) is unchanged — it still handles ACTIVE/SUSPENDED/DEREGISTERED for the union list, union detail, etc.

The portal compliance view (`src/components/portal/views/compliance.tsx:129`) now uses `<ComplianceStatusBadge status={cell.status} />` instead of `<StatusBadge status={cell.status} />`.

## Tests (7 new, all passing)

`src/lib/__tests__/t52-compliance-status-badge.test.ts`:

1-6. **One test per compliance status** (iterates `COMPLIANCE_STATUSES`): renders `ComplianceStatusBadge` with `renderToStaticMarkup`, asserts the HTML contains `COMPLIANCE_STATUS_CONFIG[status].label` and does NOT contain the raw enum text (e.g. "AWAITING_REVIEW").
7. **"renders an icon (svg) for every compliance status"** — asserts each badge renders an `<svg` (lucide icons are SVGs).

## On-screen changes (old → new)

| ComplianceStatus | Before (visual + text) | After (visual + text) |
|---|---|---|
| COMPLIANT | grey + XCircle, "COMPLIANT" | green tint + CheckCircle2, "Compliant" |
| EXPIRING | grey + XCircle, "EXPIRING" | gold tint + AlertTriangle, "Expiring" |
| OVERDUE | grey + XCircle, "OVERDUE" | red tint + XCircle, "Overdue" |
| AWAITING_REVIEW | grey + XCircle, "AWAITING_REVIEW" | blue tint + Clock, "Awaiting Review" |
| MISSING | grey + XCircle, "MISSING" | muted tint + FileQuestion, "Missing" |
| NOT_APPLICABLE | grey + XCircle, "NOT_APPLICABLE" | muted/50 tint + Ban, "Not Applicable" |

## Verification

| Command | Result |
|---|---|
| `npm run typecheck 2>&1 \| grep '^src/' \| wc -l` | 0 |
| `npm run lint` | 3 errors, 2 warnings (baseline match) |
| `npm test` | 640 passed / 37 files (was 633/36; +7 new tests, +1 file) |
| `SESSION_SECRET=ci-check-only npx next build` | pass |

## Defaults relied on

D4 (label from `COMPLIANCE_STATUS_CONFIG`)

## Deviations from task

The test uses `renderToStaticMarkup` from `react-dom/server` (already a dependency) + `createElement` instead of `@testing-library/react` (not installed, and the task says no new dependencies). The test file uses `.ts` extension with `createElement` instead of JSX because the vitest config's `include` pattern only matches `*.test.ts` (not `*.test.tsx`); changing the config is out of scope.

## Out-of-scope findings

none

---

## Combined impact

| Metric | Before T50 | After T52 | Delta |
|---|---|---|---|
| src tsc errors | 0 | 0 | 0 (baseline maintained) |
| Lint errors / warnings | 3 / 2 | 3 / 2 | 0 (baseline match) |
| Tests passing | 631 / 34 files | 640 / 37 files | +9 tests, +3 files |
| Build | pass | pass | — |

**T50** fixed a real false-notification bug: AWAITING_REVIEW documents no longer get expiry dates or renewal notices. The matrix.ts comment now matches the code; the sweep has a defensive guard; the dashboard comment is corrected. 2 new tests (matrix + sweep) exercise the real code.

**T51** made the unions-export test exercise the real route code (not a copy of the query). The query + row-building are extracted into `buildUnionsExport()`, used by both the route and the test. Guard proven: temporarily reverting to the old array-style select fails both tests.

**T52** fixed the portal compliance badge: reps now see correct labels ("Compliant", "Awaiting Review", etc.) and correct visual tokens (green/gold/red/blue/muted) instead of raw enum text with deregistered styling. 7 new tests lock the contract for all 6 compliance statuses.

All three branches are ready for PR. Recommended merge order: T50 → T51 → T52 (T51 branches from T50; T52 branches from T51).
