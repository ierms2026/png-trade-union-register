# STAKEHOLDER TEST SCRIPT

This script guides stakeholder testing of the Register of Trade Unions.
Each section is a self-contained walkthrough for one role. Work through
the tasks in order — each builds on the one before.

**Time needed:** 20–30 minutes per role. You don't need to do all four
roles in one sitting.

**Demo accounts** (password for all: `Test!2345`):
- Registrar: `registrar@example.com`
- Inspector: `inspector@example.com`
- Officer: `officer@example.com` (assigned to Papua Maritime Workers Union)
- Public: no login needed — just visit the home page

**How to report issues:** use the **"Give feedback"** link in the
top-right of the app (click your account initials → Give feedback). It
opens your email with the page URL + your role pre-filled. Or add a
line to `BACKLOG.md` directly.

---

## 1. Registrar

The Registrar is the system administrator — can do everything. This
walkthrough covers the core Registrar workflow: review documents,
register a union, configure rules, check the audit log.

**Log in as `registrar@example.com` / `Test!2345`.**

### Task 1.1 — Land on the dashboard
- **Do:** after logging in, you land on the Dashboard.
- **What you should see:** a welcome panel at the top ("Welcome,
  Registrar") with 3–4 lines on what you can do here. Below it, a
  Quick Actions row, then KPI tiles (Total Unions, Documents,
  Compliance Rate, Compliant, Expiring, Overdue, Awaiting Review,
  Missing). A "Recent Activity" feed at the bottom.
- **Dismiss the welcome panel** by clicking the X — it should not
  reappear on your next login.

### Task 1.2 — Review an uploaded document
- **Do:** click **Review Queue** in the nav bar.
- **What you should see:** a list of documents uploaded by unions,
  waiting for your approval. Each row shows the union name, document
  type, upload date, and Approve / Reject buttons.
- **Do:** click **Approve** on one document.
- **What you should see:** the document leaves the queue. A toast
  confirms "Document approved". The union's compliance status updates
  (the document now counts as Compliant).

### Task 1.3 — Register a new union
- **Do:** click **Unions** in the nav, then **Register Union**.
- **What you should see:** a dialog asking for union name, registration
  number, and file number.
- **Do:** fill in test data (e.g. "Test Union" / "IO-TEST-001" /
  "DLIR-2026-TEST") and save.
- **What you should see:** the new union appears in the unions list with
  status "Active".

### Task 1.4 — Configure compliance rules
- **Do:** click **Rules** in the nav (under the Compliance group).
- **What you should see:** a table of document types with their renewal
  years and retention years. Each row is editable.
- **Do:** change the renewal years for "Financial Return" from 1 to 2,
  and save.
- **What you should see:** the change saves. The compliance matrix
  (Task 1.5) now reflects the new renewal cycle for that document type.

### Task 1.5 — View the compliance matrix
- **Do:** click **Compliance** in the nav.
- **What you should see:** a grid: unions (rows) × document types
  (columns). Each cell is color-coded: green (Compliant), amber
  (Expiring), red (Overdue), blue (Awaiting Review), grey (Missing /
  Not Applicable). Click a "?" next to a status label to see its
  plain-language definition.

### Task 1.6 — Generate a compliance report (PDF)
- **Do:** still on the Compliance view, click **Generate Report** (the
  PDF download button).
- **What you should see:** a PDF downloads. Open it. The cover page
  shows the title, date, scope, and overall compliance rate. The
  document has sections: Executive Summary, Compliance Matrix, Needs
  Attention, Expiry Forecast, Status Legend. The PDF metadata (title)
  should say "Compliance Report — Register of Trade Unions".

### Task 1.7 — Check the audit log
- **Do:** click **Audit** in the nav.
- **What you should see:** a list of every action taken in the system
  — who did what, when, what changed. Filter by action type (e.g.
  "document_approved") to see the approvals you've done today.

### Task 1.8 — Give feedback
- **Do:** click your account initials (top-right) → **Give feedback**.
- **What you should see:** your email client opens with a message
  pre-filled with the current page URL + "Registrar" role. Type a
  note and send, or close it — either is fine.

---

## 2. Inspector

The Inspector is an oversight role — can view everything, but cannot
make changes. This walkthrough confirms the Inspector can see all the
data but has NO action buttons (no Approve, no Edit, no Delete).

**Log in as `inspector@example.com` / `Test!2345`.**

### Task 2.1 — Land on the dashboard
- **Do:** after logging in, you land on the Dashboard.
- **What you should see:** a welcome panel ("Welcome, Inspector"). The
  KPI tiles show the same numbers the Registrar sees (Inspector sees
  ALL unions' data, not a scoped subset).

### Task 2.2 — View the compliance matrix
- **Do:** click **Compliance** in the nav.
- **What you should see:** the full compliance matrix (all unions × all
  document types). Color-coded cells. You can click cells to drill into
  a union's documents, but there should be NO "Edit Rule" or "Approve"
  buttons anywhere on this page.

### Task 2.3 — Confirm NO Approve button on the Retention Queue
- **Do:** click **Retention Queue** in the nav (if visible — it's
  feature-flagged; if you don't see it, skip this task).
- **What you should see:** the list of documents whose retention period
  has elapsed, ready for disposal. Each row shows the document type,
  union name, and retention expiry date. **There must be NO "Approve"
  or "Snooze" buttons** — those are Registrar-only. You should see the
  list (Inspector can view) but cannot act on it.

### Task 2.4 — View the audit log
- **Do:** click **Audit** in the nav.
- **What you should see:** the full audit log. You can filter + read,
  but there are no "Delete entry" or "Edit entry" buttons (the audit
  log is immutable).

### Task 2.5 — Compare two unions
- **Do:** click **Compare** in the nav. Select two unions from the
  dropdown (e.g. "Papua Maritime Workers Union" + "Highlands Coffee
  Growers Association").
- **What you should see:** a side-by-side view of the two unions'
  compliance statuses. Each document type is a row; each union is a
  column. Differences are easy to spot.

### Task 2.6 — Inspect a union's detail page
- **Do:** click **Unions** in the nav, then click any union.
- **What you should see:** the union's detail page with its documents,
  contact info, and compliance history. You can view + download
  documents, but there are no "Edit", "Upload", or "Delete" buttons.

### Task 2.7 — Confirm no access to Users, Security, Rules
- **Do:** look at your nav bar.
- **What you should NOT see:** "Users", "Security", "API Keys",
  "Webhooks", "Rules". These are Registrar-only. If you manually type
  `/?view=users` in the URL, the page should show you the Dashboard
  (the route is blocked for Inspectors at the server level).

### Task 2.8 — Give feedback
- **Do:** click your account initials → **Give feedback**.
- **What you should see:** email opens pre-filled with "Inspector" role
  + current page URL.

---

## 3. Officer

The Officer is a union-scoped staff user — assigned to ONE union. This
walkthrough confirms the Officer can only see their own union's data
and CANNOT access other unions.

**Log in as `officer@example.com` / `Test!2345`.**
This account is assigned to **Papua Maritime Workers Union** (IO-01).

### Task 3.1 — Land on the dashboard
- **Do:** after logging in, you land on the Dashboard.
- **What you should see:** a welcome panel ("Welcome, Officer"). The
  KPI tiles show numbers scoped to YOUR union only (e.g. "Total Unions"
  may show 1, not 6). The Recent Activity feed shows only actions
  related to your union.

### Task 3.2 — View "My Union"
- **Do:** click **My Union** in the nav (this is the Officer's
  union-scoped view, replacing the Registrar's "Unions" list).
- **What you should see:** YOUR union's detail page — Papua Maritime
  Workers Union. Its documents, contact info, compliance status. You
  should NOT see a list of all unions.

### Task 3.3 — Confirm you CANNOT see other unions
- **Do:** this is the critical test. Try to access another union's
  data:
  1. Go to the Compliance view. You should see ONLY Papua Maritime
     Workers Union's row — no other unions.
  2. Try to manually visit `/?view=unions` (the Registrar's full unions
     list) by typing it in the URL. You should be redirected or shown
     a "you don't have access" state — NOT the full list.
  3. Try to visit a specific union's detail page by typing
     `/unions/IO-02` (Highlands Coffee Growers Association) in the
     URL. The public detail page may load, but the staff-side document
     management for that union should be blocked.
- **What you should see:** your data is scoped to your union. No way
  to see other unions' compliance data, documents, or audit entries
  from the staff app.

### Task 3.4 — Upload a document
- **Do:** from My Union, find a document type (e.g. "Financial Return")
  and click **Upload**.
- **What you should see:** a file picker. Upload any PDF. The document
  appears in your union's document list with review status "Pending
  Review". (It will NOT count as Compliant until the Registrar approves
  it — that's the correct workflow.)

### Task 3.5 — View your compliance matrix
- **Do:** click **Compliance** in the nav.
- **What you should see:** a single-row matrix (your union only). The
  cells show your document statuses. Click a "?" next to a status to
  see its definition.

### Task 3.6 — Check your tasks
- **Do:** click **Tasks** in the nav.
- **What you should see:** tasks assigned to you. You can mark a task
  "In Progress" or "Done". You should NOT see tasks assigned to other
  unions' officers.

### Task 3.7 — Search documents
- **Do:** press **Cmd+K** (or Ctrl+K) to open the global search. Type
  a search term.
- **What you should see:** search results scoped to YOUR union's
  documents only. You should not see other unions' document contents
  in the results.

### Task 3.8 — Give feedback
- **Do:** click your account initials → **Give feedback**.
- **What you should see:** email opens pre-filled with "Officer" role
  + current page URL.

---

## 4. Public (no login)

The public portal is for anyone — union members, researchers, the
general public. No login required. This walkthrough confirms a visitor
can search the register, view a union's public details, and download
public documents.

**Visit the home page (`/`) — do NOT log in.**

### Task 4.1 — Land on the public portal
- **Do:** visit the home page.
- **What you should see:** the public registry. A search bar, a list of
  registered unions (with their status badges — Active / Suspended /
  Deregistered). A "What do these terms mean?" glossary section
  explaining the statuses in plain language.

### Task 4.2 — Search for a union
- **Do:** type "Maritime" in the search bar.
- **What you should see:** the list filters to show "Papua Maritime
  Workers Union". Clear the search to see all unions again.

### Task 4.3 — View a union's public detail page
- **Do:** click "Papua Maritime Workers Union" in the list.
- **What you should see:** the union's public detail page at
  `/unions/IO-01`. It shows the union name, registration number, file
  number, status, and a list of PUBLIC documents (documents marked
  `isPublic: true` — not all documents are public). There is a
  Registrar contact info section at the bottom.

### Task 4.4 — Download a public document
- **Do:** on the union detail page, find a public document and click
  **Download** (or the document name).
- **What you should see:** the document downloads (or opens in a new
  tab, depending on your browser). The document is a real PDF.

### Task 4.5 — Confirm private documents are NOT visible
- **Do:** on the union detail page, compare the document list with what
  the Registrar sees (Task 1.2 — the Review Queue).
- **What you should see:** the public list is SHORTER than the
  Registrar's list. Documents marked `isPublic: false` do NOT appear
  on the public page. (You can confirm this by asking the Registrar
  what documents exist for the union — the public list should be a
  subset.)

### Task 4.6 — Confirm the status badge has a help popover
- **Do:** on the public union list, look for a "?" next to a status
  badge (Active / Suspended / Deregistered).
- **What you should see:** clicking the "?" opens a small popover with
  a plain-language definition of the status. For "Suspended" it says
  the suspension is temporary. For "Deregistered" it says the union is
  no longer registered.

### Task 4.7 — Try to access the staff dashboard
- **Do:** manually type `/?view=dashboard` in the URL.
- **What you should see:** you're redirected to the public portal (or
  the login screen) — NOT the staff dashboard. The staff app requires
  authentication; the public portal does not.

### Task 4.8 — View a deregistered union
- **Do:** search the public list for a deregistered union (status
  badge: grey "Deregistered"). Click it.
- **What you should see:** the union's detail page still loads (the
  record is kept for historical reference). The status badge clearly
  says "Deregistered" with a help popover explaining this is permanent.
  No documents are available for download (deregistered unions have
  no active documents).

---

## After testing

When you've finished a role's walkthrough:
1. Note anything that didn't match "what you should see" — that's a bug.
2. Note anything that confused you, even if it "worked" — that's a
   question.
3. Note anything you wished you could do but couldn't — that's a
   feature request.
4. File them via the **Give feedback** link (top-right → your account
   → Give feedback) or add them to `BACKLOG.md` directly.

Thank you for testing.
