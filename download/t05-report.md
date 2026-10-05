# T05: Config Hygiene — Report

**Task:** T05  
**Status:** done  
**Date:** 2026-10-05  

---

## Files changed

- `package.json` — added `"typecheck": "tsc --noEmit"` script (one line, between `lint` and `test`)
- `tsconfig.json` — added `"upload"`, `"download"`, `"skills"`, `"examples"` to the `exclude` array (merged with existing `"node_modules"`)
- `eslint.config.mjs` — added `"upload/**"`, `"download/**"` to the `ignores` array; changed `"skills"` to `"skills/**"` for consistency (already had `"examples/**"`)

---

## Verification

| Command | Result |
|---|---|
| `npm run typecheck` | → runs; 9 errors under `src/` (unchanged from T06c baseline) |
| `npm run lint` | → 3 errors, 2 warnings (all in `src/`); **zero** errors/warnings outside `src/` |
| `npm test` | → 621 passed / 31 files (baseline match) |
| `SESSION_SECRET=ci-check-only npx next build` | → pass |
| `git status --short` | → `M eslint.config.mjs` / `M package.json` / `M tsconfig.json` (only 3 files) |

---

## Defaults relied on

none (`docs/decisions-and-defaults.md` not found; D11 is approved per task instructions)

---

## Deviations from task

- `docs/decisions-and-defaults.md` does not exist. D11 is referenced as "approved" in the task prompt; proceeded since the task is self-contained (config-file changes only).
- The ESLint config already ignored `"examples/**"` and `"skills"` (bare, without `/**`). I added `"upload/**"` and `"download/**"`, and normalized `"skills"` to `"skills/**"` for consistency. No rules were changed, added, or relaxed.

---

## Out-of-scope findings

None

---

## What changed

### 1. `package.json` — added typecheck script

```json
"lint": "eslint .",
"typecheck": "tsc --noEmit",
"test": "VITE_CONFIG_NATIVE_IGNORE_WARNING=true vitest run",
```

One line added between `lint` and `test`. Nothing else in package.json changed.

### 2. `tsconfig.json` — excluded 4 directories

Before:
```json
"exclude": [
  "node_modules"
]
```

After:
```json
"exclude": [
  "node_modules",
  "upload",
  "download",
  "skills",
  "examples"
]
```

Merged with existing `node_modules` exclusion. `scripts/` and `vitest.config.ts` are NOT excluded (per task instructions).

### 3. `eslint.config.mjs` — added 4 directories to ignores

Before:
```javascript
ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills"]
```

After:
```javascript
ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills/**", "upload/**", "download/**"]
```

Added `"upload/**"` and `"download/**"`. Normalized `"skills"` to `"skills/**"` for pattern consistency. No rules changed, added, or relaxed.

### 4. `next.config.ts` — NOT changed

`ignoreBuildErrors: true` stays as-is per task instructions.

---

## Remaining non-src typecheck errors (Step 5 report)

`npm run typecheck` produces 13 errors outside `src/` (down from 17+ before the tsconfig exclusion — the `upload/` errors are now gone):

| File | Line | Error |
|---|---|---|
| `scripts/check-notification-links.ts` | L22 | `TS2345: Argument of type '{...}' is not assignable to parameter of type 'never'.` |
| `scripts/check-notification-links.ts` | L24 | same |
| `scripts/check-notification-links.ts` | L26 | same |
| `scripts/check-notification-links.ts` | L37 | `TS2339: Property 'id' does not exist on type 'never'.` |
| `scripts/check-notification-links.ts` | L37 | `TS2339: Property 'linkUrl' does not exist on type 'never'.` |
| `scripts/check-notification-links.ts` | L37 | `TS2339: Property 'title' does not exist on type 'never'.` |
| `scripts/check-notification-links.ts` | L46 | `TS2339: Property 'id' does not exist on type 'never'.` |
| `scripts/check-notification-links.ts` | L46 | `TS2339: Property 'linkUrl' does not exist on type 'never'.` |
| `scripts/check-notification-links.ts` | L46 | `TS2339: Property 'title' does not exist on type 'never'.` |
| `scripts/test-pdf-parse.ts` | L5 | `TS2307: Cannot find module 'pdf-parse'` |
| `scripts/test-portal-contact-flow.ts` | L193 | `TS18047: 'union' is possibly 'null'.` |
| `scripts/test-portal-contact-flow.ts` | L196 | `TS18047: 'union' is possibly 'null'.` |
| `vitest.config.ts` | L9 | `TS2769: No overload matches this call. ('singleThread' not in InlineConfig)` |

### Remaining lint output (Step 5 report)

`npm run lint` now produces exactly 5 problems, all in `src/`:

| File | Line | Severity | Rule | Message |
|---|---|---|---|---|
| `src/components/app/theme-toggle.tsx` | L13 | error | `react-hooks/set-state-in-effect` | Calling setState synchronously within an effect |
| `src/lib/webhooks/dispatcher.ts` | L387 | error | `@typescript-eslint/no-require-imports` | A `require()` style import is forbidden |
| `src/lib/webhooks/dispatcher.ts` | L400 | error | `@typescript-eslint/no-require-imports` | A `require()` style import is forbidden |
| `src/lib/sms.ts` | L33 | warning | — | Unused eslint-disable directive |
| `src/lib/sms.ts` | L35 | warning | — | Unused eslint-disable directive |

**Zero errors or warnings outside `src/`** — the `upload/`, `download/`, `skills/`, and `examples/` directories are no longer scanned. Previously, `npm run lint` (which runs `eslint .`) would scan the entire repo and produce thousands of problems from `upload/work-backup/src-tree/` and `skills/`. Now it produces only the 5 baseline problems.

---

## Impact summary

| Metric | Before T05 | After T05 |
|---|---|---|
| `npm run typecheck` available | No (had to run `npx tsc --noEmit` manually) | Yes (`npm run typecheck`) |
| `npm run typecheck` scans `upload/` | Yes (17+ errors from stale backup) | No (excluded) |
| `npm run typecheck` scans `download/` | Yes | No (excluded) |
| `npm run typecheck` scans `skills/` | Yes (2 errors) | No (excluded) |
| `npm run typecheck` scans `examples/` | Yes (2 errors) | No (excluded) |
| `npm run lint` scans `upload/` | Yes (thousands of problems) | No (ignored) |
| `npm run lint` scans `download/` | Yes | No (ignored) |
| `npm run lint` scans `skills/` | Yes | No (ignored) |
| `npm run lint` scans `examples/` | No (already ignored) | No (still ignored) |
| `npm run lint` total problems | ~3057 | 5 (all in `src/`) |
| `src/` tsc errors | 9 | 9 (unchanged) |
| `src/` lint problems | 3 errors, 2 warnings | 3 errors, 2 warnings (unchanged) |
| Tests | 621 / 31 files | 621 / 31 files (unchanged) |
| Build | Pass | Pass (unchanged) |
