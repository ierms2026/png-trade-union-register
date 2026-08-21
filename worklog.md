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
