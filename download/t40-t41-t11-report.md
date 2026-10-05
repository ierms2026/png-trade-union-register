# T40 / T41 / T11 — Combined Report

**Tasks:** T40, T41, T11 (done in this order, one branch per task)  
**Status:** all done  
**Date:** 2026-10-05

---

## Branch structure

| Task | Branch | Branched from | Commit |
|---|---|---|---|
| T40 | `fix/t40-unions-export-docs-column` | `main` (`9f54d4f`) | `8d8d83b` |
| T41 | `fix/t41-clear-src-type-errors` | `fix/t40-…` (`8d8d83b`) | `02a255d` |
| T11 | `fix/t11-retention-404-no-env-name` | `fix/t41-…` (`02a255d`) | `8b4a4e3` |

`main` was reset back to `9f54d4f` (the pre-T40 base) after the task commits were redirected to their own branches. No commits lost, no rebase, no push.

---

## Verification summary (on `fix/t11-…`, which contains all three tasks)

| Command | Baseline before T40 | After all three |
|---|---|---|
| `npm run typecheck 2>&1 \| grep '^src/' \| wc -l` | 9 | **0** |
| `npm run typecheck 2>&1 \| grep -v '^src/' \| grep -E '\.ts\(' \| wc -l` | 13 (scripts/ + vitest.config.ts — ignored per task) | 13 (unchanged) |
| `npm run lint` | 3 errors, 2 warnings | 3 errors, 2 warnings (baseline match) |
| `npm test` | 621 passed / 31 files | **626 passed / 33 files** (+5 tests, +2 files) |
| `SESSION_SECRET=ci-check-only npx next build` | pass | pass |

Defaults relied on: **D5** (T11 only). T40 and T41 relied on none.

---

# T40: Fix the Documents column in the unions export

**Branch:** `fix/t40-unions-export-docs-column`  
**Commit:** `8d8d83b`  
**Status:** done

## Files changed

- `src/app/api/export/unions/route.ts` — replaced `documents: { select: { _count: true } }` (returns an array) with `_count: { select: { documents: { where: { disposedAt: null } } } }` (Prisma 6 filtered relation count); changed `u.documents._count` → `u._count.documents`; added a comment explaining the bug + the counting convention
- `src/lib/__tests__/export-unions-documents-count.test.ts` (new) — 2 tests following the `report-html-awaiting-review.test.ts` pattern

## The bug

`src/app/api/export/unions/route.ts` (original L27 + L36):

```typescript
documents: { select: { _count: true } },   // returns: { _count: number }[]
// ...
"Documents": u.documents._count,            // reading ._count on the ARRAY → undefined
```

The select returns an **array** of `{ _count: N }` objects (one per document). Reading `._count` on the array itself is `undefined`. The "Documents" column in the CSV export was therefore blank for every union.

## Counting convention (decided per task step 1)

Two existing routes count documents and both exclude disposed documents via `disposedAt: null`:

- `src/app/api/dashboard/stats/route.ts` L44-52 — comment "disposedAt: null excludes the 2 disposed docs", filter `disposedAt: null` in both the all-unions and officer-scoped branches
- `src/app/api/public/stats/route.ts` L27 — `db.document.count({ where: { disposedAt: null } })`

T40 matches this convention: "Documents" = active (non-disposed) docs only. The fix uses Prisma 6's filtered relation count so the filter is applied inside the query rather than post-fetch.

## Tests (written first, run before the fix)

`src/lib/__tests__/export-unions-documents-count.test.ts` — 2 tests:

1. **"Documents column equals the count of non-disposed documents (not undefined)"** — seeds 1 union with 3 documents (2 active + 1 disposed), mirrors the route's query with the new `_count` shape, and asserts the Documents value is `2` (not `undefined`, not `NaN`). Also serializes via `toCsv()` and asserts the CSV contains `2` and does not contain `,1,` (the disposed count).
2. **"the OLD query shape (array select) yields undefined — confirms the bug exists"** — uses the original `documents: { select: { _count: true } }` shape and asserts that `documents._count` on the array is `undefined`. This locks in the bug shape so a future "simplification" that reverts to the array select will fail this test loudly.

Both tests passed against the new query shape. Test 2 confirmed the bug exists in the old shape.

## Search for the same misuse

`grep -rn "documents: { select: { _count: true } }\|versions: { select: { _count: true } }\|\.documents\._count\|\.versions\._count" src/app/api` — only the fixed route matched (in comments explaining the old shape). No other identical bugs.

## Verification

| Command | Result |
|---|---|
| `npm run typecheck 2>&1 \| grep '^src/'` | 8 errors (was 9; the `export/unions:36` error is gone; zero in touched files) |
| `npm run lint` | 3 errors, 2 warnings (baseline match, no new) |
| `npm test` | 623 passed / 32 files (was 621/31; +2 new tests) |
| `SESSION_SECRET=ci-check-only npx next build` | pass |

## Defaults relied on

none

## Deviations from task

none

## Out-of-scope findings

none

---

# T41: Clear the remaining src type errors with NO behavior change

**Branch:** `fix/t41-clear-src-type-errors` (branched from T40)  
**Commit:** `02a255d`  
**Status:** done

## Files changed

- `src/app/api/cron/compliance-digest/route.ts` — moved `interface DigestItem` from inside `POST` (~L49) to module scope, above `DigestEmailParams` (pure move)
- `src/app/api/dashboard/document-types/route.ts` — split the officer-scoping logic into an early-return `if` branch with a local `scopedUnionId` const for proper TS narrowing; no `!`, no `as any`
- `src/app/api/tasks/route.ts` — typed `data` as `Prisma.TaskUncheckedCreateInput` (was `Record<string, unknown>`); imported the `Prisma` namespace
- `src/app/api/unions/route.ts` — typed `data` as `Prisma.UnionUncheckedCreateInput`; replaced the optional-fields `for` loop with an inline object literal + `opt()` helper
- `src/lib/__tests__/dashboard-heatmap.test.ts` — changed `new Set<string>()` to `new Set<ComplianceStatus>()` (type already imported)

## Item 1: DigestItem move (compliance-digest/route.ts)

The `interface DigestItem` was declared inside `POST` at ~L49, but referenced at module scope by `DigestEmailParams` (L211-213) and `renderDigestEmail` (L223). TypeScript cannot find a name declared inside a function from outside it → 4 "Cannot find name 'DigestItem'" errors.

Fix: moved the interface to module scope, just above `DigestEmailParams`. Pure move, no behavior change.

## Item 2: dashboard/document-types route — guard analysis

**Question from the task:** Can `assignedUnionId` be null at the point `unionWhere` is built for any role? If yes, runtime bug → STOP and report needs-human.

**Answer:** No — not a runtime bug. The guard is:

```typescript
const officerScoped = user.role === "OFFICER" && user.assignedUnionId;
const unionWhere = officerScoped ? { id: user.assignedUnionId } : {};
```

`officerScoped` is truthy **only** when both `user.role === "OFFICER"` AND `user.assignedUnionId` is truthy (non-null, non-empty string). So when `unionWhere = { id: user.assignedUnionId }`, `assignedUnionId` is guaranteed non-null at runtime.

The original `!` at L31 (`docWhere.unionId = user.assignedUnionId!`) was therefore safe. The error was a TypeScript limitation: it cannot narrow `string | null` to `string` through a boolean variable assigned from an `&&` expression.

**Fix:** split into an early-return `if (user.role === "OFFICER" && user.assignedUnionId)` branch with a local `const scopedUnionId = user.assignedUnionId` — inside the block, TS narrows `assignedUnionId` to `string`. The non-officer path (REGISTRAR / INSPECTOR) falls through with no scoping. No `!`, no `as any`, no behavior change.

## Item 3: tasks/route.ts + unions/route.ts — Prisma create input types

Both routes built `data` as `Record<string, unknown>` then passed it to `db.task.create({ data })` / `db.union.create({ data })`. Prisma's create signature expects `XOR<XxxCreateInput, XxxUncheckedCreateInput>` — `Record<string, unknown>` doesn't overlap.

**Type discovery:** `TaskUncheckedCreateInput` and `UnionUncheckedCreateInput` are NOT top-level exports from `@prisma/client`. They live under the `Prisma` namespace (declared at `node_modules/.prisma/client/index.d.ts:530` as `export namespace Prisma`). Import: `import { ..., Prisma } from "@prisma/client"`.

**tasks/route.ts:** `data` typed as `Prisma.TaskUncheckedCreateInput`. The field-allowlist logic (title, description, priority, createdById, dueDate, unionId, assigneeId) is unchanged — all those fields exist on `TaskUncheckedCreateInput`.

**unions/route.ts:** `data` typed as `Prisma.UnionUncheckedCreateInput`. The original code used a `for` loop over optional field names with `data[field] = ...` indexed assignment, which doesn't type-check against the Prisma type. Replaced with an inline object literal using an `opt()` helper:

```typescript
const opt = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

const data: Prisma.UnionUncheckedCreateInput = {
  unionName: body.unionName.trim(),
  registrationNo: body.registrationNo.trim(),
  status,
  fileNumber: opt(body.fileNumber),
  address: opt(body.address),
  contactPerson: opt(body.contactPerson),
  contactEmail: opt(body.contactEmail),
  contactPhone: opt(body.contactPhone),
  remarks: opt(body.remarks),
};
```

Same fields, same null-on-empty behavior — just expressed in a way that satisfies the Prisma type. The field-allowlist logic is preserved exactly (the task said: "Keep the explicit field-allowlist logic exactly as is — it was reviewed and is correct").

## Item 4: dashboard-heatmap.test.ts — Set typing

L212: `const matrixStatuses = new Set<string>()` — then `cellStatuses.has(status)` at L222 fails because `cellStatuses` is `Set<ComplianceStatus>` (from `cells.map((c) => c.status)`) and `has()` expects `ComplianceStatus`, not `string`.

Fix: `new Set<ComplianceStatus>()`. `ComplianceStatus` was already imported at L8. No cast hacks.

## Verification

| Command | Result |
|---|---|
| `npm run typecheck 2>&1 \| grep '^src/' \| wc -l` | **0** (was 8 after T40; all 8 cleared) |
| `npm run typecheck 2>&1 \| grep -v '^src/' \| grep -E '\.ts\(' \| wc -l` | 13 (scripts/ + vitest.config.ts — baseline, ignored per task) |
| `npm run lint` | 3 errors, 2 warnings (baseline match) |
| `npm test` | 623 passed / 32 files (no change — no behavior change) |
| `SESSION_SECRET=ci-check-only npx next build` | pass |

Did NOT touch `next.config.ts`. Did NOT fix the 13 non-src baseline errors (scripts/ + vitest.config.ts).

## Defaults relied on

none

## Deviations from task

none

## Out-of-scope findings

none

---

# T11: Retention flag off returns a bare 404 (decision D5)

**Branch:** `fix/t11-retention-404-no-env-name` (branched from T41)  
**Commit:** `8b4a4e3`  
**Status:** done

## Files changed

- `src/lib/retention-flag.ts` — changed `RETENTION_DISABLED_MESSAGE` from a string exposing the env var name to `"Not found."`; updated the header comment to explain why the env var name must not appear in the body (D5) and point to `.env.example` for the enable instruction
- `src/lib/__tests__/retention-flag.test.ts` (new) — 3 tests asserting the 404 body does not contain `NEXT_PUBLIC_RETENTION_ENABLED`
- `.env.example` (new) — all 20 env var names the app reads, no values; includes a comment block for `NEXT_PUBLIC_RETENTION_ENABLED` pointing to D5
- `.gitignore` — added `!.env.example` exception after `.env*` so `.env.example` is tracked

## The leak

`src/lib/retention-flag.ts` (original L46-47):

```typescript
export const RETENTION_DISABLED_MESSAGE =
  "The retention workflow is not enabled. Set NEXT_PUBLIC_RETENTION_ENABLED=true to enable it.";
```

8 retention/disposition/legal-hold API routes import this constant and return it in the 404 response body when the flag is off:

- `src/app/api/retention/route.ts`
- `src/app/api/retention/[documentId]/approve/route.ts`
- `src/app/api/retention/[documentId]/reject/route.ts`
- `src/app/api/dispositions/route.ts`
- `src/app/api/dispositions/[documentId]/cancel/route.ts`
- `src/app/api/dispositions/[documentId]/execute/route.ts`
- `src/app/api/legal-holds/[documentId]/place/route.ts`
- `src/app/api/legal-holds/[documentId]/lift/route.ts`

Anyone hitting those URLs when retention is off would see `NEXT_PUBLIC_RETENTION_ENABLED` in the response body — leaking the env var name and the fact that a hidden feature exists.

## Fix

`RETENTION_DISABLED_MESSAGE` changed to `"Not found."`. The 8 route files were NOT touched — they import the constant, so the fix propagates automatically. The header comment now explains:

> WHY THE ENV VAR NAME IS NOT IN THE 404 BODY (decision D5):
> The 404 body returned by retention routes must be a generic "not found" message. Naming the env var in the body would leak implementation detail to anyone hitting the URL — including parties who shouldn't know the feature exists. The enable instruction lives in .env.example + the README, not in the response body.

## Tests (written first, run before the fix)

`src/lib/__tests__/retention-flag.test.ts` — 3 tests:

1. **"RETENTION_DISABLED_MESSAGE does not contain the env var name"** — asserts the message does not contain `NEXT_PUBLIC_RETENTION_ENABLED` or `RETENTION_ENABLED`. This is the core D5 contract.
2. **"RETENTION_DISABLED_MESSAGE is a generic not-found message"** — asserts the message matches `/not found|not available|not enabled/i` and is under 200 chars. Locks in the generic wording.
3. **"isRetentionEnabled reads the env var (does not throw when unset)"** — sanity check that the function returns a boolean in the test environment (where the env var is unset).

Test 1 failed before the fix (message contained `NEXT_PUBLIC_RETENTION_ENABLED`). All 3 passed after the fix.

## .env.example

Created (was absent). Contains all 20 env var names the app reads (discovered via `grep -rhoE "process\.env\.[A-Z_]+" src/`), with comments explaining each. No values. The retention block:

```
# Retention workflow feature flag.
# When NOT set (or "false"), the retention/disposition/legal-hold workflow
# is completely hidden: the Retention Queue nav entry + view are removed,
# and the /api/retention, /api/legal-holds, /api/dispositions routes
# return 404 with a generic body. This prevents anyone from disposing of
# real records until the office is ready (retention rules configured,
# staff trained, policy signed off). See docs/decisions-and-defaults.md D5.
# To enable: NEXT_PUBLIC_RETENTION_ENABLED=true
NEXT_PUBLIC_RETENTION_ENABLED=
```

`.gitignore` updated: the existing `.env*` rule now has a `!.env.example` exception so the example file is tracked while `.env` and other env files remain ignored.

## No README section

The task says "if a README.md exists, a short section." No root `README.md` exists in the repo (only `download/README*.md` files, which are deploy-package artifacts). Per the task's conditional, no README section was added. The enable instruction lives in `.env.example` instead.

## Not touched (per task)

- The Compliance view subtitle — "handled in another session" per the task.

## Verification

| Command | Result |
|---|---|
| `npm run typecheck 2>&1 \| grep '^src/' \| wc -l` | 0 (unchanged from T41) |
| `npm run lint` | 3 errors, 2 warnings (baseline match) |
| `npm test` | 626 passed / 33 files (was 623/32; +3 new tests) |
| `SESSION_SECRET=ci-check-only npx next build` | pass |

## Defaults relied on

D5 (retention flag off: bare 404, no env-var text in responses)

## Deviations from task

No root `README.md` exists (only `download/README*.md` deploy-package artifacts), so no README section was added per the task's "if a README.md exists" condition. `.env.example` created with the enable instruction instead.

## Out-of-scope findings

none

---

## Combined impact

| Metric | Before T40 | After T11 | Delta |
|---|---|---|---|
| src tsc errors | 9 | 0 | **−9** (all cleared) |
| Non-src tsc errors (scripts/ + vitest.config.ts) | 13 | 13 | 0 (baseline, ignored) |
| Lint errors / warnings | 3 / 2 | 3 / 2 | 0 (baseline match) |
| Tests passing | 621 / 31 files | 626 / 33 files | +5 tests, +2 files |
| Build | pass | pass | — |

**T40** fixed a real bug (Documents column was undefined for every union in the CSV export) and reduced tsc errors from 9 to 8.

**T41** cleared the remaining 8 src tsc errors with zero behavior change. The most interesting decision was Item 2 (document-types route): the runtime was correct, only the typing was broken — TS couldn't narrow `string | null` through a boolean variable. Fixed by splitting into an early-return branch with a local const, no `!` or `as any`.

**T11** closed D5: retention routes now return `{"error":"Not found."}` with no env var name in the body. The enable instruction moved to `.env.example` (variable name only, no value). 3 new tests lock the contract.

All three branches are ready for PR. Recommended merge order: T40 → T41 → T11 (T41 depends on T40's branch per the task; T11 depends on T41's).
