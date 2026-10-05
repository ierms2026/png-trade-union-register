# T00: Baseline Report

**Task:** T00  
**Status:** done  
**Date:** 2026-10-05  

---

## Files changed

None (read-only task — no source edits). `bun.lock` was modified by `bun install` then reverted per instructions. Only `db/custom.db` (data, not source) shows as modified.

---

## Verification

| Command | Result |
|---|---|
| `npx prisma generate` | → pass (client generated) |
| `npx tsc --noEmit` | → fail (23 errors in `src/`, 17 errors elsewhere) |
| `npx eslint src/` | → fail (3 errors, 2 warnings) |
| `VITE_CONFIG_NATIVE_IGNORE_WARNING=true npx vitest run` | → pass (610 tests, 30 files, 0 failures) |
| `SESSION_SECRET=baseline-build-check-only npx next build` | → pass (compiled successfully, all routes generated) |

---

## Deviations from task

- **`bun install` modified `bun.lock`** — reverted per instructions. The change was bun resolving twilio sub-dependencies that weren't previously locked. Only `db/custom.db` (data) remains as a modified tracked file.
- **No `typecheck` script exists** in package.json — used `npx tsc --noEmit` as the de facto typecheck command.
- **Lint via `npm run lint`** runs `eslint .` which includes non-source directories (`download/`, `upload/`, `skills/`, `examples/`) producing 3057 problems. Used `npx eslint src/` to isolate project source (5 problems).

---

## Out-of-scope findings

- The `upload/work-backup/src-tree/` directory contains a full copy of the source tree that is included in `tsc --noEmit` and `eslint .` scans, producing 17+ typecheck errors and thousands of lint warnings. This backup directory should be excluded from tsconfig and eslint config.
- `vitest.config.ts:9` has a `singleThread` property that TypeScript doesn't recognize (`TS2769`), but vitest accepts it at runtime — tests pass fine.
- `examples/websocket/` references `socket.io` and `socket.io-client` which are not installed — these are example files, not project source.

---

## Baseline table

| Command | Result | Counts | Notes |
|---|---|---|---|
| **Typecheck** (`npx tsc --noEmit`) | **Fail** | 23 errors in `src/`; 17 errors elsewhere (scripts, skills, examples, vitest.config.ts, upload/work-backup) | No dedicated `typecheck` script in package.json — `tsc --noEmit` is the de facto command. Most `src/` errors are pre-existing (DigestItem, Prisma type mismatches, AWAITING_REVIEW missing from test fixtures). |
| **Lint** (`npx eslint src/`) | **Fail** | 3 errors, 2 warnings | Errors: `theme-toggle.tsx:13` (setState in effect), `webhooks/dispatcher.ts:387,400` (require() imports). Warnings: `sms.ts:33,35` (unused eslint-disable). |
| **Test** (`npm test` / `VITE_CONFIG_NATIVE_IGNORE_WARNING=true npx vitest run`) | **Pass** | 610 passed, 0 failed, 0 skipped; 30 test files | All tests pass. Vitest uses esbuild (no typecheck), so the TS errors don't affect test results. |
| **Build** (`npm run build` / `npx next build`) | **Pass** (with env) | Compiled successfully in ~73s; all routes generated | Fails WITHOUT `SESSION_SECRET` because `next build` runs in production mode and `src/lib/auth/session.ts:69` throws. This is by design — the env var is required for production. |

---

## Exact commands found (for reuse by later tasks)

| Purpose | Command |
|---|---|
| **Typecheck** | `npx tsc --noEmit` (no script in package.json) |
| **Lint** | `npx eslint src/` (package.json has `"lint": "eslint ."` but that includes `download/`, `upload/`, `skills/` — use `npx eslint src/` for project source only) |
| **Test** | `npm test` (or `VITE_CONFIG_NATIVE_IGNORE_WARNING=true npx vitest run`) |
| **Build** | `SESSION_SECRET=<secret> npx next build` (the `npm run build` script adds `cp -r` steps after, but the compilation itself is `next build`) |
| **Install** | `bun install` (lockfile is `bun.lock`) |

---

## package.json scripts

```json
{
  "scripts": {
    "dev": "next dev -p 3000 2>&1 | tee dev.log",
    "build": "next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/",
    "start": "NODE_ENV=production bun .next/standalone/server.js 2>&1 | tee server.log",
    "lint": "eslint .",
    "test": "VITE_CONFIG_NATIVE_IGNORE_WARNING=true vitest run",
    "test:watch": "VITE_CONFIG_NATIVE_IGNORE_WARNING=true vitest",
    "db:push": "prisma db push --accept-data-loss",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:reset": "prisma migrate reset"
  }
}
```

**Key observations:**
- No dedicated `typecheck` script — `tsc --noEmit` must be run manually.
- `lint` script (`eslint .`) scans the entire repo including non-source dirs; use `npx eslint src/` for project source.
- `test` script sets `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress a vitest config warning.
- `build` script runs `next build` then copies static assets into the standalone output directory.
- Lockfile: `bun.lock` (bun is the primary package manager).

---

## Audit claim verification

The earlier audit claimed "610 tests passing across 30 test files in `src/lib/__tests__/`."

**This matches exactly what I observe:**
- Test files: **30** ✓ (all in `src/lib/__tests__/`)
- Tests passed: **610** ✓
- Tests failed: **0** ✓

---

## Baseline failures (not fixed — listed per instructions)

### Typecheck errors in `src/` (23 errors across 6 files)

| File | First error line | Error |
|---|---|---|
| `src/app/api/cron/compliance-digest/route.ts` | `:211` | `TS2304: Cannot find name 'DigestItem'` (4 occurrences) |
| `src/app/api/dashboard/document-types/route.ts` | `:37` | `TS2322: Type '{ id: string \| null; } \| { id?: undefined; }' is not assignable to type 'UnionWhereInput'` |
| `src/app/api/export/unions/route.ts` | `:36` | `TS2339: Property '_count' does not exist on type` |
| `src/app/api/tasks/route.ts` | `:195` | `TS2322: Type 'Record<string, unknown>' is not assignable to TaskCreateInput` |
| `src/app/api/unions/route.ts` | `:201` | `TS2322: Type 'Record<string, unknown>' is not assignable to UnionCreateInput` |
| `src/components/app/views/dashboard.tsx` | `:1456` | `TS2322: ComplianceCounts missing AWAITING_REVIEW` |
| `src/lib/__tests__/dashboard-heatmap.test.ts` | `:222` | `TS2345: Argument of type 'string' is not assignable to ComplianceStatus` |
| `src/lib/__tests__/dashboard-mutation.test.ts` | `:574` | `TS2741: Property 'AWAITING_REVIEW' is missing` (1 occurrence) |
| `src/lib/__tests__/dashboard-mutation.test.ts` | `:927` | `TS2345: UnionSummary status type mismatch` (14 occurrences) |

#### Full typecheck error listing for `src/`

```
src/app/api/cron/compliance-digest/route.ts(211,12): error TS2304: Cannot find name 'DigestItem'.
src/app/api/cron/compliance-digest/route.ts(212,15): error TS2304: Cannot find name 'DigestItem'.
src/app/api/cron/compliance-digest/route.ts(213,15): error TS2304: Cannot find name 'DigestItem'.
src/app/api/cron/compliance-digest/route.ts(223,31): error TS2304: Cannot find name 'DigestItem'.
src/app/api/dashboard/document-types/route.ts(37,22): error TS2322: Type '{ id: string | null; } | { id?: undefined; }' is not assignable to type 'UnionWhereInput | undefined'.
src/app/api/export/unions/route.ts(36,30): error TS2339: Property '_count' does not exist on type '{ _count: { union: number; versions: number; reviewedBy: number; legalHolds: number; dispositionRequests: number; }; }[]'.
src/app/api/tasks/route.ts(195,39): error TS2322: Type 'Record<string, unknown>' is not assignable to type '(Without<TaskCreateInput, TaskUncheckedCreateInput> & TaskUncheckedCreateInput) | (Without<...> & TaskCreateInput)'.
src/app/api/unions/route.ts(201,41): error TS2322: Type 'Record<string, unknown>' is not assignable to type '(Without<UnionCreateInput, UnionUncheckedCreateInput> & UnionUncheckedCreateInput) | (Without<...> & UnionCreateInput)'.
src/components/app/views/dashboard.tsx(1456,9): error TS2322: Type '{ COMPLIANT: number; EXPIRING: number; OVERDUE: number; MISSING: number; NOT_APPLICABLE: number; } | null' is not assignable to type 'ComplianceCounts | null'.
src/lib/__tests__/dashboard-heatmap.test.ts(222,31): error TS2345: Argument of type 'string' is not assignable to parameter of type 'ComplianceStatus'.
src/lib/__tests__/dashboard-mutation.test.ts(1008,44): error TS2345: Argument of type '{ id: string; name: string; registrationNo: string; status: string; }[]' is not assignable to parameter of type 'UnionSummary[]'.
src/lib/__tests__/dashboard-mutation.test.ts(1040,45): error TS2345: Argument of type '{ id: string; name: string; registrationNo: string; status: string; }[]' is not assignable to parameter of type 'UnionSummary[]'.
src/lib/__tests__/dashboard-mutation.test.ts(1049,44): error TS2345: Argument of type '{ id: string; name: string; registrationNo: string; status: string; }[]' is not assignable to parameter of type 'UnionSummary[]'.
src/lib/__tests__/dashboard-mutation.test.ts(1063,46): error TS2345: Argument of type '{ id: string; name: string; registrationNo: string; status: string; }[]' is not assignable to parameter of type 'UnionSummary[]'.
src/lib/__tests__/dashboard-mutation.test.ts(1077,46): error TS2345: Argument of type '{ id: string; name: string; registrationNo: string; status: string; }[]' is not assignable to parameter of type 'UnionSummary[]'.
src/lib/__tests__/dashboard-mutation.test.ts(1078,46): error TS2345: Argument of type '{ id: string; name: string; registrationNo: string; status: string; }[]' is not assignable to parameter of type 'UnionSummary[]'.
src/lib/__tests__/dashboard-mutation.test.ts(1087,46): error TS2345: Argument of type '{ id: string; name: string; registrationNo: string; status: string; }[]' is not assignable to parameter of type 'UnionSummary[]'.
src/lib/__tests__/dashboard-mutation.test.ts(574,11): error TS2741: Property 'AWAITING_REVIEW' is missing in type '{ COMPLIANT: number; EXPIRING: number; OVERDUE: number; MISSING: number; NOT_APPLICABLE: number; }' but required in type 'ComplianceCounts'.
src/lib/__tests__/dashboard-mutation.test.ts(927,46): error TS2345: Argument of type '{ id: string; name: string; registrationNo: string; status: string; }[]' is not assignable to parameter of type 'UnionSummary[]'.
src/lib/__tests__/dashboard-mutation.test.ts(933,46): error TS2345: Argument of type '{ id: string; name: string; registrationNo: string; status: string; }[]' is not assignable to parameter of type 'UnionSummary[]'.
src/lib/__tests__/dashboard-mutation.test.ts(957,46): error TS2345: Argument of type '{ id: string; name: string; registrationNo: string; status: string; }[]' is not assignable to parameter of type 'UnionSummary[]'.
src/lib/__tests__/dashboard-mutation.test.ts(993,46): error TS2345: Argument of type '{ id: string; name: string; registrationNo: string; status: string; }[]' is not assignable to parameter of type 'UnionSummary[]'.
src/lib/__tests__/dashboard-mutation.test.ts(999,45): error TS2345: Argument of type '{ id: string; name: string; registrationNo: string; status: string; }[]' is not assignable to parameter of type 'UnionSummary[]'.
```

### Lint errors in `src/` (3 errors, 2 warnings)

| File | Line | Severity | Rule | Message |
|---|---|---|---|---|
| `src/components/app/theme-toggle.tsx` | `:13` | error | `react-hooks/set-state-in-effect` | Calling setState synchronously within an effect can trigger cascading renders |
| `src/lib/webhooks/dispatcher.ts` | `:387` | error | `@typescript-eslint/no-require-imports` | A `require()` style import is forbidden |
| `src/lib/webhooks/dispatcher.ts` | `:400` | error | `@typescript-eslint/no-require-imports` | A `require()` style import is forbidden |
| `src/lib/sms.ts` | `:33` | warning | — | Unused eslint-disable directive |
| `src/lib/sms.ts` | `:35` | warning | — | Unused eslint-disable directive |

### Build

Build passes when `SESSION_SECRET` is provided. Without it, fails at `src/lib/auth/session.ts:70`:

```
Error: SESSION_SECRET environment variable is required in production. Generate one with: openssl rand -hex 32
```

This is by design — the env var is required for production builds.

---

## Summary

| Check | Pass/Fail | Key detail |
|---|---|---|
| Typecheck | **Fail** | 23 errors in `src/` — pre-existing, mostly from AWAITING_REVIEW enum addition + Prisma type mismatches |
| Lint | **Fail** | 3 errors in `src/` — setState-in-effect + require() imports |
| Test | **Pass** | 610/610 tests pass across 30 files — matches audit claim exactly |
| Build | **Pass** | Compiles successfully with `SESSION_SECRET` set |
