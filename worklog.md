# Worklog — Union Records Management System

Shared multi-agent work log. Append-only. Newest entries at the bottom.

---
Task ID: 4
Agent: main (continuation)
Task: Chunk 4 — API Key Authentication wiring audit + gap fixes

Work Log:
- Audited all GET routes that should accept API keys per the `ALLOWED_SCOPES` whitelist
  (`unions:read`, `documents:read`, `compliance:read`, `audit:read`).
- Already wired correctly (use `getAuthUserOrApiKey`):
  * GET /api/audit
  * GET /api/unions
- Gaps identified:
  * GET /api/compliance — uses `getAuthUser` only (should accept `compliance:read` keys)
  * GET /api/unions/[unionId]/documents/[documentId]/versions — uses `getAuthUser` only
    (should accept `documents:read` keys); ALSO missing Officer scoping (any Officer
    could read any union's version history by guessing IDs)
- Public routes (`/api/public/*`) intentionally do NOT accept API keys — they are
  unauthenticated and rely on per-IP rate limiting.

Stage Summary:
- Audit complete. Two gaps to fix in this chunk.

---
Task ID: 5
Agent: main (continuation)
Task: Chunk 5 — Schema Integrity (FK relations on Task + Notification)

Work Log:
- Audited schema: Document already had `@@unique([unionId, documentType])` ✓.
- Identified Task model lacked FK relations: `unionId`, `assigneeId`, `createdById`
  were bare String columns with no `@relation` → Prisma `include` clauses in
  tasks/route.ts failed with "Type 'X' is not assignable to type 'never'".
- Identified Notification model lacked FK relation to User.
- Added to User model:
  * `assignedTasks Task[] @relation("TaskAssignee")` back-relation
  * `createdTasks  Task[] @relation("TaskCreator")`  back-relation
  * `notifications Notification[]` back-relation
- Added to Union model: `tasks Task[]` back-relation.
- Updated Task model with three FK relations:
  * `union    Union? @relation(onDelete: SetNull)`  — optional, keeps task if union deleted
  * `assignee User?  @relation("TaskAssignee", onDelete: SetNull)` — optional
  * `creator  User   @relation("TaskCreator",  onDelete: Restrict)` — required, blocks user-delete if tasks exist
- Updated Notification model:
  * `user User @relation(onDelete: Cascade)` — notifications die with the user
- Ran `prisma db push --skip-generate` → DB in sync (23ms, no migration files
  needed for SQLite dev workflow).
- Ran `prisma generate` → client regenerated.
- Verified via `tsc --noEmit`: all Task/Notification type errors resolved.

Stage Summary:
- Schema integrity restored. `db.task.findMany({ include: { union, assignee, creator } })`
  now type-checks and resolves correctly at runtime.
- onDelete semantics chosen to preserve audit trail (Restrict on creator) while
  allowing optional-relations cleanup (SetNull on union/assignee).

---
Task ID: 6
Agent: main (continuation)
Task: Chunk 6 — Cleanup + Hardening (sign 2FA token, type-error fixes, PDF integrity check)

Work Log:
- **2FA challenge token now HMAC-signed.** Previously the challenge token was
  just `base64("userId:timestamp")` — unsigned, forgeable by anyone who
  knew the format. Added `signChallengeToken(userId)` and `parseChallengeToken(token)`
  helpers to `session.ts` (uses the same HMAC SECRET as session cookies,
  30s TTL). Updated login/route.ts to use `signChallengeToken`; updated
  login/2fa/route.ts to use `parseChallengeToken` from `session.ts` (fixes
  the missing `SESSION_COOKIE_NAME` import — it's now in the same import
  block).
- **Type-error fixes** (all `src/` errors now clean):
  * `restore/route.ts`: added `currentVersionId: true` to the Prisma select.
  * `documents/route.ts`: refactored the transaction to use the
    pre-computed `documentId` directly instead of `document.id` from a
    conditional create — eliminates the `Document | null` narrowing issues
    AND the `versions` include mismatch.
  * `page.tsx`: captured `user` into a local `currentUser` const after the
    null-check guard, so TypeScript narrows it correctly inside the
    `renderView()` closure.
  * `totp.ts`: otplib v13 — moved `epochTolerance` from the TOTP constructor
    (where it's not a valid option) to per-call `verify()` (where it is).
    Cleaned up the dead `typeof result === "boolean"` branch.
  * `public/files/[id]/route.ts` + `download/route.ts`: cast Buffer →
    `BodyInit` to satisfy TS 5.9's stricter `Uint8Array<ArrayBufferLike>`
    typing (runtime is fine — Node Buffer is a valid BodyInit).
- **PDF integrity check on upload.** New `src/lib/file-validation.ts`:
  * `hasPdfMagicBytes(buffer)` — cheap `%PDF-` prefix check.
  * `validatePdfIntegrity(buffer)` — runs `pdfinfo` (poppler-utils) on a
    temp file to verify structural integrity. Gracefully degrades to
    "accept" if `pdfinfo` isn't installed (with a console warning).
  Wired into `/api/unions/[unionId]/documents` POST — `.pdf` uploads now
  fail fast with 400 if the magic bytes are wrong or pdfinfo can't parse
  the file. Non-PDF files skip the check.
- Verified `tsc --noEmit` reports zero `src/` errors. Remaining errors are
  in `examples/` and `skills/` (unrelated sample/skill files).
- Verified dev server (port 3000, PID 1057) is still healthy and the
  changed routes (`/api/compliance`, `/api/audit`) return proper 401 for
  unauthenticated requests.

DEFERRED (lower-priority items from the original Chunk 6 brief):
- Audit-log retention (auto-prune old audit entries) — operational concern,
  no security impact; can be added as a cron job later.
- Rate-limiting on file download/upload routes — public search already
  rate-limits; the authed upload route is gated by session+role already.
- UI breadcrumbs — visual polish, not security; can be added when the
  view component is re-styled.

Stage Summary:
- All TypeScript errors in `src/` resolved.
- 2FA challenge token is now signed (closes a real forgeability gap).
- PDF uploads are validated for integrity before being persisted.
- Dev server confirmed healthy post-changes.

---
Task ID: 7
Agent: main (continuation)
Task: Chunk 7 — User lifecycle gap fixes (delete cascade, admin password reset, cron timing)

Work Log:
- **7-a: Fixed user-DELETE cascade crash.** My Chunk 5 schema change
  (`Task.creator @relation(onDelete: Restrict)`) meant `db.user.delete()`
  would throw a Prisma FK constraint error if the user had created any
  tasks. The DELETE route didn't detect this — it would have crashed with
  a raw 500. Added a pre-delete `db.task.count({ where: { createdById: id } })`
  check that returns a clear 400 with the count + actionable guidance
  (delete tasks first, or disable the user instead). Also documented the
  full cascade map in the route comment (Session→Cascade, LoginAttempt→
  SetNull, AuditLog→SetNull, ApiKey→SetNull, Task.assignee→SetNull,
  Task.creator→Restrict, Notification→Cascade).
- **7-b: Added POST /api/users/[id]/reset-password.** The schema documents
  `passwordResetToken` as "generated at create time or on admin reset" but
  there was NO route for an admin to trigger a reset on an existing user.
  The only way to get a reset token was at creation time. New route:
  REGISTRAR-only, generates a fresh 256-bit token (24h expiry), sets
  `passwordHash` to "!pending" (immediately invalidates the old password),
  writes a WARNING-severity audit entry, and returns the token ONE TIME
  with a ready-to-share `?token=xxx` URL. Idempotent — re-calling
  generates a fresh token and expires the old one.
- **7-c: Fixed cron-secret timing comparison.** The compliance-sweep cron
  route used plain `token !== process.env.CRON_SECRET` — short-circuits
  on the first non-matching byte, theoretically leaking the secret via
  response timing. Replaced with `timingSafeEqual(Buffer.from(token),
  Buffer.from(secret))` with a length pre-check (timingSafeEqual throws
  on length mismatch). Removed the unused `getAuthUser` import that was
  left over from an earlier draft. Also updated the route header comment
  to document the constant-time comparison.

Stage Summary:
- User deletion no longer crashes when the user created tasks — returns
  a clear 400 with the count + remediation guidance.
- Admins can now reset any user's password via the API (previously only
  possible at user-creation time). The old password is invalidated
  immediately; the user sets the new one via the existing set-password
  flow.
- Cron secret comparison is now constant-time.
- `tsc --noEmit` clean; dev server healthy; both new/changed routes
  return proper 401s for unauthenticated requests.

---
Task ID: 8
Agent: main (continuation)
Task: Chunk 8 — Rate-limiting on authed upload/download/restore routes

Work Log:
- **8a: Created shared `src/lib/rate-limit.ts` helper.**
  - Fixed-window counter (simplest correct implementation; burst-at-
    boundary is acceptable for abuse prevention).
  - Per-identifier keying: caller passes `user.id` (authed) or IP (public).
  - Returns `{ allowed, limit, remaining, resetAt }` so callers can emit
    `X-RateLimit-*` headers on EVERY response (not just 429s) — lets
    polite clients self-throttle.
  - `rateLimitedResponse()` builder emits 429 with `Retry-After` + the
    three `X-RateLimit-*` headers.
  - Pre-configured buckets: documentUpload (10/min), documentDownload
    (30/min), documentRestore (10/min), publicSearch (60/min).
  - In-memory Map — fine for single-process; documented that multi-
    instance would need Redis.
  - No explicit cleanup sweep — keyspace is bounded for authed routes
    (user count) and auto-overwrites for public routes (stale IP entries
    are small). Documented the sweep fallback if memory ever matters.

- **8b: Wired into upload POST.** Check goes after auth + Officer scoping
  (need `user.id`), before union-existence check. 10/min per user.
  `rlHeaders` attached to the 201 success response.

- **8c: Wired into download GET.** Same pattern. 30/min per user —
  generous for normal browsing (5-10 docs in a row), blocks a scraping
  script. Headers attached to the file-serving response.

- **8d: Wired into restore POST.** 10/min per user — restore is a write
  op (creates a new DocumentVersion), same budget as uploads. Headers
  attached to the 201.

- **8e: Refactored public unions route** to use the shared helper.
  Previously had its own in-line `rateLimitStore` Map + `checkRateLimit`
  function — now DRYed up to call the shared one. Public route now also
  emits `X-RateLimit-*` headers on 200s (it didn't before). Removed the
  `any` cast on the `where` clause while I was in there — replaced with
  a proper typed `{ OR?: Array<Record<string, unknown>> }`.

- **8f: Smoke-tested by hammering `/api/public/unions`.**
  - First 60 requests: HTTP 200 with `x-ratelimit-limit: 60`,
    `x-ratelimit-remaining: 59` (decrementing).
  - Requests 61+: HTTP 429 with `retry-after: 59`, `x-ratelimit-remaining: 0`.
  - After 60s window reset: back to 200.
  - No errors in dev log.
  - `tsc --noEmit` clean.

Stage Summary:
- Three authed routes (upload, download, restore) now rate-limited per-user.
- Public search route refactored to share the same helper.
- All four routes emit `X-RateLimit-*` headers on every response (not just
  429s) so polite clients can self-throttle.
- 429s include `Retry-After` per RFC 7231.
- Verified end-to-end: 200 → 200 → ... → 429 → 429 → (wait 60s) → 200.
