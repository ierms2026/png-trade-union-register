# T71: The renewal period starts at approval (D15, simple variant) — Report

**Task:** T71  
**Status:** done  
**Date:** 2026-10-06  
**Branch:** `fix/t71-renewal-clock-at-approval` (from `main` @ `fd79ab8`)  
**Commit:** `8f9cf47`

---

## Branch structure

| Task | Branch | Branched from | Commit |
|---|---|---|---|
| T71 | `fix/t71-renewal-clock-at-approval` | `main` (`fd79ab8`) | `8f9cf47` |

---

## Verification summary

| Command | Baseline before T71 | After T71 |
|---|---|---|
| `npm run typecheck` | 0 errors, exit code 0 | 0 errors, exit code 0 (baseline match) |
| `npm run lint` | 3 errors, 2 warnings | 3 errors, 2 warnings (baseline match) |
| `npm test` | 668 passed / 42 files | **674 passed / 43 files** (+6 tests, +1 file) |
| `SESSION_SECRET=ci-check-only npx next build` | pass | pass |

Defaults relied on: **D15, D1**.

---

## Files changed (7)

| File | Change |
|---|---|
| `src/lib/compliance/calculator.ts` | Added `reviewedAt` to `DocumentInput`; added `computeExpiryDateFromApproval(document, latestVersion, renewalYears)` (the ONE function); `calculateStatus` now uses it instead of `computeExpiryDate(filedAt, ...)`; updated `calculateStatusFromRows` to pass `reviewedAt`; removed unused `filedAt` variable; updated algorithm comments |
| `src/lib/compliance/matrix.ts` | Added `reviewedAt` to Document select + `MatrixData` type; replaced inline `computeExpiryDate(uploadedAt, ...)` with `computeExpiryDateFromApproval(doc!, latestVersion, ...)`; updated comments |
| `src/lib/dashboard/vocabulary.ts` | Updated COMPLIANT/EXPIRING/OVERDUE definitions to say "(counted from approval date)" |
| `src/lib/dashboard/status-config.ts` | Same definition updates (templated with `${EXPIRING_WINDOW_DAYS}`) |
| `src/lib/__tests__/t71-renewal-clock-at-approval.test.ts` (new) | 6 tests |
| `src/lib/__tests__/dashboard-status-config.test.ts` | Relaxed OVERDUE definition regex to accommodate inserted text |
| `src/lib/__tests__/dashboard-tooltips.test.ts` | Same regex relaxation |

---

## Step 1: Callers of `calculateStatus` and `computeExpiryDate`

### `calculateStatus` callers

| Caller | file:line | Notes |
|---|---|---|
| `calculateStatusFromRows` | `src/lib/compliance/calculator.ts:506` | The only direct caller — wraps `calculateStatus` and is the public API |
| `matrix.ts` (via `calculateStatusFromRows`) | `src/lib/compliance/matrix.ts:157` | The matrix builder calls `calculateStatusFromRows` |

### `computeExpiryDate` callers (before T71)

| Caller | file:line | Date passed in |
|---|---|---|
| `calculateStatus` | `src/lib/compliance/calculator.ts:301` (before) | `latestVersion.uploadedAt` (as `filedAt`) |
| `matrix.ts` inline | `src/lib/compliance/matrix.ts:171` (before) | `latestVersion.uploadedAt` |

### After T71

Both callers now use `computeExpiryDateFromApproval(document, latestVersion, renewalYears)` — the ONE function that implements the D15 rule. `computeExpiryDate` is still exported (it's the low-level calendar-math helper used by `computeExpiryDateFromApproval`), but no caller passes `uploadedAt` directly anymore.

---

## Step 2: The ONE function

`src/lib/compliance/calculator.ts` — new `computeExpiryDateFromApproval`:

```typescript
export function computeExpiryDateFromApproval(
  document: { reviewedAt?: Date | null },
  latestVersion: { uploadedAt: Date },
  renewalYears: number,
): Date {
  // D15: clock starts at reviewedAt (approval date). Fall back to uploadedAt
  // if reviewedAt is null (e.g., approved before the field existed).
  const clockStart = document.reviewedAt ?? latestVersion.uploadedAt;
  return computeExpiryDate(clockStart, renewalYears);
}
```

Both `calculateStatus` (calculator.ts:330) and `matrix.ts:171` call this function. No second copy of the logic.

PENDING and REJECTED documents still get no expiry date — `calculateStatus` returns `AWAITING_REVIEW` before reaching the expiry computation (step 3 of the algorithm), and `matrix.ts` checks `status !== "AWAITING_REVIEW"` before computing `expiresAt`.

---

## Step 3: `reviewedAt` added to `fetchMatrixData`

`src/lib/compliance/matrix.ts`:
- `MatrixData.documents` type: added `"reviewedAt"` to the `Pick<>` (L64)
- `fetchMatrixData` select: added `reviewedAt: true` (L98)

The `reviewedAt` value flows through to `calculateStatusFromRows` (which now accepts `Pick<Document, "disposedAt" | "reviewStatus" | "reviewedAt">`) and to `computeExpiryDateFromApproval` (via the `doc` variable in `buildComplianceMatrix`).

---

## Step 4: Code paths that set `reviewStatus` to APPROVED

| Path | Sets `reviewedAt`? | file:line |
|---|---|---|
| `POST /api/reviews/[documentId]/approve` | **Yes** — `reviewedAt: now` | `src/app/api/reviews/[documentId]/approve/route.ts:54-56` |
| `scripts/seed-approved-reviews.ts` | **Yes** — `reviewedAt: new Date()` | `scripts/seed-approved-reviews.ts:13-14` |
| `scripts/test-review-workflow.ts` | **Yes** (L78) / **No** (L118 — intentionally tests the null case) | `scripts/test-review-workflow.ts:78,118` |
| Seed (`prisma/seed-demo.ts`, `prisma/seed.ts`) | No APPROVED documents in seed | n/a |
| Upload routes (`unions/[unionId]/documents/route.ts`, `v1/unions/[unionId]/documents/route.ts`) | Set `PENDING` (not APPROVED) — correct | `unions/[unionId]/documents/route.ts:412`, `v1/unions/[unionId]/documents/route.ts:300` |
| Reject route (`reviews/[documentId]/reject/route.ts`) | Sets `REJECTED` + `reviewedAt: now` — correct | `reviews/[documentId]/reject/route.ts:72-74` |

**All approval paths set `reviewedAt`.** The fallback (uploadedAt) is only needed for documents approved before the field existed or via a data migration that didn't set it. No fix needed — the fallback handles it.

---

## Step 5: No new fields in external responses

No new field added to any API response, CSV, or webhook payload. The `expiresAt` field in the compliance matrix response, the v1 API, and the exports all use the same field name — only the value changes (from upload-based to approval-based). This is a contract change under D16, but it's a value change, not a shape change. The task explicitly says "Add NO new field."

`effectiveDate` was not touched.

---

## Step 6: Tests (6 new, all passing)

`src/lib/__tests__/t71-renewal-clock-at-approval.test.ts`:

1. **"approved with reviewedAt 30d ago, uploadedAt 100d ago, 1y rule → expiry ~335d from now (COMPLIANT)"** — proves the expiry date is based on `reviewedAt`, not `uploadedAt`. Both dates produce COMPLIANT, but the expiry date differs. Asserts the exact timestamp matches `reviewedAt + 1 year`.
2. **"approved with reviewedAt equal to uploadedAt → same as before"** — when both dates are the same, the behavior is unchanged.
3. **"approved with reviewedAt null → falls back to uploadedAt"** — the fallback case. Asserts the expiry matches `uploadedAt + 1 year`.
4. **"pending and rejected → no expiry date (unchanged)"** — PENDING and REJECTED documents still get `expiresAt: null` (T50 behavior unchanged).
5. **"EXPIRING and OVERDUE boundaries use the new expiry date (from reviewedAt)"** — seeds documents with `reviewedAt` 340d ago (→ EXPIRING) and 400d ago (→ OVERDUE), with `uploadedAt` 100d earlier to prove the date comes from `reviewedAt`.
6. **"sweep + digest: document uploaded long ago but approved recently produces no notices"** — seeds a document uploaded 340d ago but approved only 30d ago. Before T71, this would fire `T_30_DAYS` (expiry 25d from now). After T71, expiry is 335d from now → no sweep or digest issue.

### Existing tests updated

| Test file | Line | Change | Reason |
|---|---|---|---|
| `dashboard-status-config.test.ts` | 211 | Relaxed regex from `/renewal date has passed/i` to `/renewal date.*has passed/i` | The OVERDUE definition now has "(counted from approval date)" inserted between "renewal date" and "has passed" |
| `dashboard-tooltips.test.ts` | 176 | Same regex relaxation | Same reason |

No other existing tests broke — all 668 baseline tests still pass, plus the 6 new T71 tests.

---

## Step 7: Wording changes (on-screen text)

| Location | Old | New |
|---|---|---|
| `vocabulary.ts` COMPLIANT definition | "Document filed, approved by Registrar, with renewal date more than 90 days away." | "Document filed, approved by Registrar, with renewal date (counted from approval date) more than 90 days away." |
| `vocabulary.ts` EXPIRING definition | "Document filed and approved, but renewal date is within 90 days." | "Document filed and approved, but renewal date (counted from approval date) is within 90 days." |
| `vocabulary.ts` OVERDUE definition | "Document filed and approved, but renewal date has passed." | "Document filed and approved, but renewal date (counted from approval date) has passed." |
| `status-config.ts` COMPLIANT definition | same old | same new (templated with `${EXPIRING_WINDOW_DAYS}`) |
| `status-config.ts` EXPIRING definition | same old | same new |
| `status-config.ts` OVERDUE definition | same old | same new |

These definitions appear in:
- Dashboard KPI tile tooltips (via `STATUS_CONFIG[status].definition`)
- Compliance view legend tooltips (via `COMPLIANCE_STATUS_CONFIG[status].definition`)
- Help glossary (via `COMPLIANCE_STATUS_CONFIG[status].definition`)

No other text in help-guide.tsx, portal views, or other components mentions "upload date" or "filing date" in the context of the renewal clock. The portal documents view shows "uploaded {date}" which is about when the file was uploaded (correct — it's the version's upload timestamp, not the renewal clock start).

---

## Step 8: Before/after on seed data (aggregate only)

The seed has **0 APPROVED documents**. All documents are PENDING → AWAITING_REVIEW with `expiresAt: null`. The rate is 0% (0 COMPLIANT / 78 applicable).

**No change on seed data** — the T71 fix only affects APPROVED documents, and there are none in the seed. The fix is invisible until a document is approved.

---

## Verification

| Command | Result |
|---|---|
| `npm run typecheck` | 0 errors, exit code 0 |
| `npm run lint` | 3 errors, 2 warnings (baseline match) |
| `npm test` | 674 passed / 43 files (was 668/42; +6 new tests, +1 file) |
| `SESSION_SECRET=ci-check-only npx next build` | pass |

---

## Defaults relied on

D15 (renewal clock starts at approval date), D1 (compliance rate rule — unchanged, the rate formula itself is not touched)

---

## Deviations from task

none

---

## Out-of-scope findings

none

---

## Impact summary

**T71** implements the D15 simple variant: the renewal clock starts at `Document.reviewedAt` (the approval date) for APPROVED documents, falling back to `uploadedAt` if `reviewedAt` is null. One function (`computeExpiryDateFromApproval`) is used by both `calculateStatus` and `matrix.ts` — no second copy of the logic. PENDING and REJECTED documents still get no expiry date (T50 behavior unchanged). No new fields in any external response (D16 contract preserved).

The fix is invisible on seed data (0 APPROVED documents). In production, a document that waits months for review will no longer look partly expired the moment it's approved — the clock starts at the approval date, giving the union a full renewal period from that point.

6 new tests with constructed data (the seed has no approved documents) cover: the approval-date computation, the fallback, the equal-dates case, PENDING/REJECTED (no expiry), EXPIRING/OVERDUE boundaries, and the sweep+digest no-notice case. 2 existing tests had their OVERDUE definition regex relaxed to accommodate the inserted "(counted from approval date)" text.

The branch is ready for PR.
