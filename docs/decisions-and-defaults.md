# Decisions & Defaults Register: Register of Trade Unions remediation

Purpose: let the build proceed while human decisions are pending. Each default is the
lowest-risk, most reversible option. Nothing here is a final policy decision.

**Launch status (2026-10-05):** the app is still in development mode and not yet public. Items below that mention "public" are **launch gates**, not live incidents. See "Pre-launch gates" at the end.

**Proposed checkpoint date:** 2026-10-19 (change as needed). At the checkpoint, every
OPEN item below is either answered, re-defaulted with a new date, or escalated.

**Conventions for agents and reviewers**
- Code that depends on a provisional default carries a comment: `// PROVISIONAL(D<n>): see decisions-and-defaults.md`
  placed in ONE spot per decision (a single function or constant), never scattered.
- Every agent report adds a line: `Defaults relied on: D<n>, D<n>` (or `none`).
- An agent must stop and report if a task would require departing from a default or
  making a decision that isn't listed here.

---

## Summary

| ID | Decision | Default | Status | Reversal cost | Blocks |
|---|---|---|---|---|---|
| D1 | Do filed-but-unreviewed documents count against a union's compliance rate? | Yes: in the denominator, not the numerator (current code) | CONFIRMED by the Registrar 2026-10-06 (provisional, not final) | Low (one function + tests) | Nothing |
| D2 | Public compliance rate / `/api/public/stats` | Align the route with the D1 rule; whether the public should see a rate at all stays open | PARTLY DECIDED | Low | Showing a rate on any public page |
| D3 | Is `db/custom.db` seed data or real records? | Treat as possibly real until confirmed | OPEN, owner check (more pressing after T02) | n/a | Git history cleanup |
| D4 | "Not Applicable" label policy | Canonical "Not Applicable" + `shortLabel: "N/A"` for tight spaces | DEFAULTED | Low | B7 |
| D5 | Retention flag off: behavior | Bare 404, no env-var text in responses | DEFAULTED | Low | T11 |
| D6 | Public "Last updated" meaning | Deferred; no change | DEFERRED | n/a | Nothing |
| D7 | Officer vs. Representative role model; Registrar-only bottleneck (B17, B18) | No structural change; proceed on current role model | DEFERRED | Medium if roles later merge | T23/T24 are label-only, so low impact |
| D8 | The 22 baseline type errors; `ignoreBuildErrors: true` | UPDATED: errors in src/ are cleared; fix the 13 non-src errors, then turn the flag off (T61) | DEFAULTED | Low (one line) | T61 |
| D9 | Editing contact details without a rebuild (B14) | Documented rebuild process (README), no admin UI | DEFAULTED | Low | Nothing |
| D10 | Legislation storage (B13) | Plan T30 (move to DB) before launch; no code yet | DEFAULTED, T02 = risk (deployment unconfirmed) | n/a | T30 |
| D11 | Config hygiene (T05) | Approved: exclude non-source dirs, add `typecheck` script; leave `ignoreBuildErrors` | APPROVED | Low | Reliable lint/tsc signals |
| D12 | Announcing the denominator change (58 → 78 on seed data) | Don't announce until D1 is confirmed | DEFAULTED | n/a | Stakeholder comms |
| D13 | Public register crawlability (B15) | Server-render the list, keep the client filter; sitemap waits for the production URL | DEFAULTED | Low | T31 |
| D14 | Rate limiting on public API routes | Deferred; low priority | DEFERRED | Low | Nothing |
| D15 | When does a document's renewal clock start? | DECIDED 2026-10-06: the renewal period starts on the approval date. Needs a careful scoping task before code | DECIDED, not yet implemented | Medium | Expiry dates, statuses and the rate for approved documents |
| D16 | Will outside systems use webhooks or API keys? | YES (Registrar/owner, 2026-10-06). Treat `/api/v1/*` and webhook payloads as supported contracts | DECIDED | n/a | Integration docs, security review, contract tests |
| D17 | Officers/Representatives with no assigned union | Fail closed: they see no data (a plain Forbidden), never everything | DEFAULTED | Low | T75 |

---

## Details

### D1: Compliance rate rule
- **Default:** numerator = COMPLIANT; denominator = COMPLIANT + EXPIRING + OVERDUE + AWAITING_REVIEW + MISSING; NOT_APPLICABLE excluded. This is what `snapshot.ts` already used.
- **Why this default:** it's existing behavior, now consistent across all routes and the printable report. Changing it later means editing `computeRateFromCounts()` and its tests.
- **Risk accepted:** a union that has filed on time can show as non-compliant until the Registrar reviews, because of the office's own backlog.
- **Alternatives to put to the Registrar:** (B) exclude awaiting-review from both sides; (C) show it as a separate figure with no single rate.
- **Who decides:** the Registrar (possibly with legal advice if the Act defines compliance).
- **Registrar's answer (2026-10-06):** keep the rule as it is, with Awaiting Review documents counting toward the total (denominator). "It's not final yet, but it's written in one place, so if we need to change it later, it's a quick fix." Recorded as confirmed but provisional; the `PROVISIONAL(D1)` marker stays.
- **Guardrails until decided:** the rule lives in `computeRateFromCounts()` only, marked PROVISIONAL(D1). No new code may re-implement it.

### D2: Public rate
- **Finding (T08):** the premise "no public rate" is false. `GET /api/public/stats` is reachable without authentication, has no rate limiting, and already returns `overallComplianceRate`, computed without AWAITING_REVIEW in the denominator, so it is overstated whenever any document is compliant. No page displays it and nothing documents it as an external API, but anyone can read it. On seed data it returns 0, so the discrepancy is invisible there.
- **Default:** no change to the route's behavior or fields yet. Any change to a published figure should be deliberate (this is an official register).
- **Status:** the app is not live, so no figure has been published and nothing needs retracting. This is a launch gate: decide it with D1 before go-live.
- **If the endpoint has been exposed anywhere already** (a staging or demo URL shared outside the team), treat it as live: compare its figure with the dashboard and check access logs.
- **Escalation trigger:** evidence that an outside party already uses the endpoint.
- **Update (2026-10-06):** the Registrar confirmed the D1 rule, so the public stats route will be aligned with it (it currently leaves Awaiting Review out of the denominator). This publishes nothing new; the route already serves a rate. Whether the public should be shown a rate on any page at all is still open (no page displays it today).

### D3: `db/custom.db`
- **Default:** treat as possibly containing real records.
- **Agent rules:** report aggregate counts only; never print or paste row-level data (names, emails, phone numbers); never stage or commit the file; restore it after any task that modifies it.
- **Not decided yet:** removing it from git and history. That's a deliberate, separate task once the owner answers.
- **Owner action:** confirm seed vs real, and who has repository access.
- **New evidence (T02):** the only Dockerfile mounts a persistent volume at `/app/db` to keep the SQLite database across restarts, which suggests a deployed database may live at the same path as the tracked file. That raises the odds it holds real data.
- **Dev-mode note:** in a development environment this is probably seed data, but confirm before launch. If it is seed data, gitignore and untrack it before go-live (rewriting history is cheaper now than after the repo is widely shared). A tracked database file should never ship.
- **Observation (round 2 merge):** automated commits made by the tooling environment have already included a change to `db/custom.db` on main, even though every agent was told to keep it out. Agent rules alone cannot keep it out of history. Don't untrack it yet: the environment appears to restore the project from git between sessions, so removing it could wipe the working data. First find out whether a seed script can rebuild it.

### D4: Label policy
- **Default:** one canonical `label: "Not Applicable"` plus an optional `shortLabel: "N/A"` used only in space-constrained UI (KPI tiles, matrix cells). Applied during B7 (B1 is folded into B7).

### D5: Retention flag off
- **Default:** respond with a bare 404 and no explanatory text. The enable instruction moves to `.env.example` and the README.

### D6: Public "Last updated"
- **Deferred:** nothing depends on it. No change until the Registrar's session.

### D7: Role model and delegation
- **Deferred:** T23 (portal nav) only aligns labels and T24 only adds discoverability. Neither depends on the answer. If the roles are later merged or restructured, expect small rework in those two areas.

### D8: Type errors and the build flag
- **Original default:** don't flip `ignoreBuildErrors` until the type errors are understood.
- **Update (round 3):** all type errors in `src/` are cleared. The flag can now be turned off once the 13 errors outside `src/` (in `scripts/` and `vitest.config.ts`) are fixed (task T61). Turning it off makes any future type error fail the build, which would have caught the Awaiting Review omissions. Reverting is one line.

### D9: Contact details
- **Default:** document the rebuild process in the README (which env vars, who runs the rebuild). No admin UI for now.

### D10: Legislation storage
- **Default:** T02 reports only. If T02 returns `risk` or `unknown`, ask the hosting owner before any code change.
- **Finding (T02):** edits are written to `public/legislation/legislation.json` on the local filesystem. The only Dockerfile (in `download/`, which the audit calls historical) persists only `/app/db`, so edits would be lost on container restart IF that Dockerfile reflects the real deployment. Questions for the hosting owner: how is the app actually deployed, and is the legislation editor in real use? No code change until answered.
- **Revised default (app not yet deployed):** because hosting isn't chosen, plan T30 (move legislation into the database) before launch. Everything else already persists in the DB, so this removes any dependence on filesystem persistence. It is a small design call; veto it if you'd rather use a volume mount.

### D11: Config hygiene (T05) approved
- **Scope:** add a `typecheck` script; exclude `upload/`, `download/`, `skills/`, `examples` from `tsconfig` and ESLint. No rule changes. `ignoreBuildErrors` stays as is.

### D12: Communications
- **Default:** hold. Announce the figure change once, after D1 is confirmed. Since the app isn't live, nobody has seen the old figures, so there may be nothing to announce.

### D13: Crawlability of the public register
- **Finding (T03):** the register list at `/` is rendered client-side, so non-JavaScript crawlers, link previews and archives see an empty shell. Union detail pages are server-rendered but not discoverable from the shell. (Google does run JavaScript in a delayed second pass, so it may index the list eventually.)
- **Default:** proceed with T31: server-render the list, keep the client-side filter as an enhancement. A sitemap waits until the production base URL is confirmed.

### D14: Rate limiting on public API routes
- **Finding (T08):** `/api/public/unions` and `/api/public/files/[id]` are rate limited (the latter by its own in-route limiter, not the shared one); `/api/public/unions/[id]` and `/api/public/stats` are not.
- **Default:** deferred, low priority. Revisit with D2.

### D15: When does the renewal clock start?
- **Finding (T50):** a document's renewal period is counted from the day it was **uploaded**, not the day the Registrar approved it. A document that waits months for review looks partly expired the moment it is approved. As part of T50, documents still awaiting review no longer get an expiry date or renewal notices.
- **Registrar's answer (2026-10-06):** the renewal period starts on the **approval date**, and compliance statuses (and so the compliance rate) are worked out from it. The rate formula itself stays as in D1.
- **Interim default (done in T50):** documents awaiting review have no expiry date and trigger no renewal notices.
- **To find out before coding (scoping task):** whether the system records a reliable approval date; how already-approved documents should be treated if it doesn't (the fallback would be the upload date, flagged); and what the status should show while a renewal upload is awaiting approval but an older approved version is still valid. If that last point is ambiguous, it becomes one follow-up question for the Registrar.
- **Reversal cost:** medium. It changes the expiry computation in `matrix.ts`, and the expiry dates, statuses and rate shown for already-approved documents would shift. The seed data has no approved documents, so tests must use constructed data.
- **Status:** decided; not implemented. Plan: read-only scoping first, then implementation with tests.

### D16: Outside systems will use webhooks and API keys
- **Answer (2026-10-06):** yes, outside systems will use them. Which systems and when are not yet known.
- **What this means:** the response shapes of `/api/v1/*` and the webhook payloads are now supported contracts. Changes must be additive or versioned, and every change to them (for example D15's effect on expiry dates, or the `awaitingReview` field) must be treated as a contract change.
- **Required before launch:** (1) a security review of the external surface (API-key authentication and scopes, rate limiting on `/api/v1`, how API keys and webhook secrets are stored and shown, where webhooks are allowed to send); (2) an integration guide covering the endpoints, authentication, scopes, rate limits, error format, and the webhook events with payload examples and signature verification; (3) contract tests that fail if a documented response shape changes.
- **Open:** who the outside systems are and their target date.

### D17: Officers and Representatives with no assigned union
- **Finding (T60):** an Officer with no assigned union can currently export ALL unions and see document-type data for ALL unions, because the scoping code treats "no union" as "no restriction" (it fails open). The same pattern may exist elsewhere.
- **Default:** fail closed. A user who is supposed to be limited to one union but has none assigned sees no data (a plain "Forbidden" response), never everything. Under the existing rule that Officers and Representatives are scoped to a union, an unassigned one is an invalid state.
- **How:** one shared helper decides a user's union scope and every scoped route uses it. First applied to the two known routes (T75), then to any others the sweep finds.
- **Also to check:** how a user can end up in that state (editing a user, deleting a union), and whether a user can reach another union's records by guessing an ID.
- **Reversal cost:** low.

---

## What proceeds now vs what is held

| Proceeds now | Held |
|---|---|
| Merge T06a then T06b, after the review checks | Showing a public compliance rate on any page (D2) |
| T06c (exhaustiveness sweep) | Publishing any compliance rate (D2) |
| T02, T03, T04, T07, T08 (read-only) | Removing `db/custom.db` from git (D3) |
| T05 config hygiene (D11) | Legislation code changes (D10) |
| B7 status-source merge with B1 folded in, then T21 contract tests (D4) | Role-model-dependent redesigns (D7) |
| T10 and T14 (after T06c merges) | Stakeholder announcements (D12) |
| T11 retention 404 (D5) | "Last updated" change (D6) |

## Checkpoint agenda (proposed 2026-10-19)

1. Registrar: D1 and D15 are answered (recorded above). Still open: D2 (show a public rate at all?) and, if the scoping task finds it ambiguous, what status a renewal awaiting approval should show.
2. Project owner answers D3.
3. Review results from T02, T08 and T07, and re-default or escalate what they surface.
4. Hold one session with the Registrar's office on D6 and D7.

---

## Pre-launch gates (the app is in dev mode; none of these block current work)

- [ ] D1 confirmed (done, provisional); public stats route aligned with the rule; D2 decided (should the public see a rate at all?)
- [ ] D3: `db/custom.db` confirmed as seed data, untracked and gitignored
- [ ] D10: legislation persistence resolved (T30 or a volume mount)
- [ ] Production URL known; sitemap added (D13); register list server-rendered (T31)
- [ ] Public API routes rate limited (D14)
- [ ] `ignoreBuildErrors` revisited: type errors cleared per the T07 triage, then the flag set to false
- [ ] Production environment set: `SESSION_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_REGISTRAR_*` (real contact details, not placeholders), retention flag
- [ ] Cron jobs scheduled (compliance sweep, snapshot, digest, webhook retry, retention sweeps)
- [ ] Seed/demo data, seed accounts and demo credentials removed
- [ ] Backup plan for the SQLite database
- [ ] Accessibility check (B16) of public pages
- [ ] Agent report files and the work log removed from the repository (automated commits added them)
- [ ] External surface (D16, decided: yes): security review done; `/api/v1` rate limited; integration guide written; contract tests in place; outside systems and their dates identified
- [ ] D15 implemented and tested (renewal period starts at approval)
- [ ] Union scoping fails closed everywhere (D17): sweep done, the shared helper used by every scoped route, record-level access checks confirmed
