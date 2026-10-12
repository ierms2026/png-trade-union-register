# STAKEHOLDER TEST SCRIPT

This script guides stakeholder testing of the Register of Trade Unions.
Each section is a self-contained walkthrough for one role. Work through
the tasks in order — each builds on the one before.

**Time needed:** 20–30 minutes per role.

**Demo accounts** (ask the Industrial Registrar for the demo password):
- Industrial Registrar: `registrar@example.com`
- Inspector: `inspector@example.com`
- Union Official: `officer@example.com` (assigned to Papua Maritime Workers Union)

**How to report issues:** use the **"Give feedback"** link in the
top-right of the app (click your account initials → Give feedback). It
opens your email with the page URL + your role pre-filled. Or add a
line to `BACKLOG.md` directly.

> **Note:** the user-facing role labels are "Industrial Registrar",
> "Inspector", and "Union Official". The internal system names
> (REGISTRAR, INSPECTOR, OFFICER) are unchanged — only the labels you
> see on screen are different.

---

## 1. Industrial Registrar

The Industrial Registrar is the system administrator — can do
everything. This walkthrough covers five core workflows: finding
overdue unions by category, previewing a rule change, approving a
disposal, creating a Union Official account, and reading a union's
audit trail.

**Log in as `registrar@example.com` (ask for the demo password).**

### Task 1.1 — Find overdue unions by category

- **Do:** click **Compliance** in the sidebar. You land on the
  Compliance Overview tab — a color-coded matrix of all unions × all
  document types.
- **What you should see:** the matrix has a **category super-header
  row** above the column names: **Registration**, **Annual Filings**,
  **Governance**, **Oversight**. Each category header spans the
  columns for the types in that category. Hover a category header to
  see its description.
- **Do:** click the **Overdue** filter (the status filter dropdown in
  the top-right of the matrix card).
- **What you should see:** cells that are NOT Overdue dim to 25%
  opacity. The Overdue cells stay bright red. Scan the **Annual
  Filings** category columns (Financial Return, Financial Membership
  List, Affiliations, Welfare Fund) — any red cells there are the
  unions with overdue annual filings.
- **Do:** scroll down to the **Documents by Category** card on the
  dashboard (click Dashboard in the sidebar). Click the **Annual
  Filings** row to expand it.
- **What you should see:** a per-type breakdown showing how many of
  each Annual Filings type are on file across all unions (e.g.
  "Financial Return: 4 of 6 on file (67%)"). Types with low
  percentages are the ones most overdue.

### Task 1.2 — Preview a rule change before saving

- **Do:** click **Compliance** in the sidebar, then click the **Rules**
  tab.
- **What you should see:** a table of all 13 document types with their
  Required/Optional status, Renewal period, and Retention period.
  Each row has an **Edit** button.
- **Do:** click **Edit** on the **Financial Return** row.
- **What you should see:** a dialog opens with editable fields
  (Required, Renewal years, Retention years). Below the fields there's
  a **Preview Impact** section.
- **Do:** change the Renewal period from 1 to 2 years, then click
  **Preview Impact**.
- **What you should see:** the preview shows which unions would change
  compliance status if you saved this rule. For example: "3 unions
  would move from Overdue to Expiring" or "1 union would move from
  Expiring to Compliant". The preview does NOT save the change — it's
  a what-if.
- **Do:** click **Cancel** (don't save). The rule stays at 1 year.

### Task 1.3 — Approve a disposal (type-the-title confirm)

- **Do:** click **Retention & Disposal** in the sidebar (under Review
  & Audit).
- **What you should see:** a list of documents whose retention period
  has elapsed, ready for disposal. Each row shows the document type,
  union name, retention expiry date, and an **Approve** button.
- **Do:** click **Approve** on one document.
- **What you should see:** a confirmation dialog opens. It asks you
  to **type the document type name exactly** to enable the Confirm
  button. This is the type-to-confirm pattern (same as GitHub uses for
  repo deletion).
- **Do:** type the document type name (e.g. "Constitution") in the
  confirmation field.
- **What you should see:** the **Confirm Disposal** button becomes
  enabled (it was greyed out before you typed the exact name).
- **Do:** click **Confirm Disposal**.
- **What you should see:** the document leaves the Retention & Disposal
  queue. A toast confirms "Document disposed". The document is now
  marked as disposed — it no longer appears in the compliance matrix.

### Task 1.4 — Create a Union Official account

- **Do:** click **Users** in the sidebar (under Administration).
- **What you should see:** a list of all user accounts. Each row shows
  email, role, assigned union, and status.
- **Do:** click **Create User**.
- **What you should see:** a dialog with fields for Email, Role
  (dropdown: Industrial Registrar / Inspector / Union Official),
  Assigned Union (dropdown — appears when Role = Union Official),
  and a checkbox for "Send password reset email".
- **Do:** fill in a test email (e.g. `test-officer@example.com`),
  select **Union Official** as the role, select **Papua Maritime
  Workers Union** as the assigned union, then click **Save**.
- **What you should see:** the new user appears in the users list
  with role "Union Official" and assigned union "Papua Maritime
  Workers Union". A password reset token is generated — the user
  will be prompted to set their own password on first login.

### Task 1.5 — Read the audit trail for a union

- **Do:** click **Unions** in the sidebar (under Registry). Click any
  union to open the Union Hub.
- **What you should see:** the Union Hub with tabs: Overview,
  Documents, Compliance, Tasks, History.
- **Do:** click the **History** tab.
- **What you should see:** a list of audit entries for this union
  only — every action taken on this union's record (who did what,
  when, what changed). Each entry shows the action (e.g.
  "document_approved", "union_updated"), the actor's name, and the
  timestamp. The entries are ordered newest-first.
- **Do:** scroll through the list. If there are more than 20 entries,
  note that the list is capped at 20 here — for the full audit log,
  click **Audit Log** in the sidebar (under Review & Audit).

### Task 1.6 — Tell us what was confusing

- **Do:** click your account initials (top-right) → **Give feedback**.
- **What you should see:** your email client opens with a message
  pre-filled with the current page URL + "Industrial Registrar" role.
- **Do:** type one or two sentences about anything that was confusing
  or didn't work as expected. Send the email (or close it — either is
  fine). Your feedback goes into `BACKLOG.md` for the team to triage.

---

## 2. Inspector

The Inspector is an oversight role — can view everything, but cannot
make changes. This walkthrough confirms the Inspector can see all the
data but has NO action buttons (no Approve, no Edit, no Delete).

**Log in as `inspector@example.com` (ask for the demo password).**

### Task 2.1 — Compare 3 unions on Annual Filings

- **Do:** click **Compliance** in the sidebar, then click the
  **Compare** tab.
- **What you should see:** a union picker with a dropdown to add
  unions + a list of selected unions (up to 6).
- **Do:** select 3 unions from the dropdown (e.g. Papua Maritime
  Workers Union, Highlands Coffee Growers Association, Port Moresby
  Teachers Federation).
- **What you should see:** a "Compliance Gap Matrix" table appears
  below. Rows = document types, columns = the 3 selected unions.
  Each cell shows a status letter (C/E/O/R/M/N/A) with color coding.
- **Do:** find the **Annual Filings** rows (Financial Return,
  Financial Membership List, Affiliations, Welfare Fund). Compare the
  3 unions across these 4 rows.
- **What you should see:** you can quickly spot which union is
  Compliant (green C) on all 4 Annual Filings types, and which has
  gaps (red O for Overdue, or grey M for Missing). The side-by-side
  view makes differences obvious.

### Task 2.2 — Open a union's Inspection Reports

- **Do:** click **Unions** in the sidebar (under Registry). Click any
  union to open the Union Hub.
- **What you should see:** the Union Hub with tabs: Overview,
  Documents, Compliance, Tasks, History.
- **Do:** click the **Documents** tab.
- **What you should see:** documents grouped by category: Registration,
  Annual Filings, Governance, Oversight. Each category section has a
  heading, a description, and an "x of y current" count.
- **Do:** scroll to the **Oversight** category section. Look for
  **Inspection Reports**.
- **What you should see:** if the union has an Inspection Report on
  file, it appears as a card in the Oversight section. Click the
  document to open its detail page. You can view + download the
  document, but there are no "Edit", "Upload", or "Delete" buttons
  (Inspector is read-only).
- **If the union has no Inspection Reports filed:** the Oversight
  section shows "No documents filed in this category." Try another
  union.

### Task 2.3 — Reject a pending disposal

- **Do:** click **Retention & Disposal** in the sidebar (under Review
  & Audit).
- **What you should see:** a list of documents whose retention period
  has elapsed. Each row shows the document type, union name, retention
  expiry date, and action buttons.
- **What you should see (critical):** there is **NO Approve button**
  on any row. The Inspector can see the list but cannot approve
  disposals. There **is** a **Reject** button (or a Snooze button,
  depending on the configuration) — the Inspector can reject/snooze
  but not approve.
- **Do:** click **Reject** on one document (if the button is present).
- **What you should see:** the document leaves the queue. A toast
  confirms the rejection. The document stays on the register (it is
  not disposed).

### Task 2.4 — Confirm there is no Approve button

- **Do:** still on the **Retention & Disposal** page, scan every row
  carefully.
- **What you should see:** every row has a Reject/Snooze button but
  **NO Approve button**. The Approve action is Industrial
  Registrar-only — it's hidden from the Inspector at the server level
  (not just the UI). If you tried to call the approve API directly, it
  would return 403.
- **Do:** also check the **Review Queue** (if visible in the sidebar).
  You should see the list of pending documents but **NO Approve or
  Reject buttons** — those are Industrial Registrar-only.

### Task 2.5 — Confirm no access to Administration

- **Do:** look at your sidebar.
- **What you should NOT see:** there is no **Administration** group
  in the sidebar. No Users, no Access Monitoring, no API Keys, no
  Webhooks, no Resources. These are Industrial Registrar-only.
- **Do:** try to manually visit `/?view=users` by typing it in the
  URL.
- **What you should see:** you're redirected to the Dashboard (the
  route is blocked for Inspectors at the server level).

### Task 2.6 — Tell us what was confusing

- **Do:** click your account initials (top-right) → **Give feedback**.
- **What you should see:** your email client opens with "Inspector"
  role pre-filled.
- **Do:** type one or two sentences about anything that was confusing.
  Send the email (or close it).

---

## 3. Union Official

The Union Official is a union-scoped user — assigned to ONE union
(Papua Maritime Workers Union). This walkthrough confirms the Union
Official can only see their own union's data and CANNOT access other
unions.

**Log in as `officer@example.com` (ask for the demo password).**
This account is assigned to **Papua Maritime Workers Union**.

### Task 3.1 — Find "My filings" and what's due first

- **Do:** after logging in, you land on the Dashboard. The KPI tiles
  show numbers scoped to YOUR union only (e.g. "Total Unions" shows
  1, not 6).
- **Do:** click **My Union** in the sidebar (under Registry).
- **What you should see:** the Union Hub for Papua Maritime Workers
  Union. The header card shows the union name, registration number,
  and status badge. Below it are tabs: Overview, Documents,
  Compliance, Tasks. (No History tab — that's Industrial Registrar +
  Inspector only.)
- **Do:** click the **Documents** tab.
- **What you should see:** the tab is titled **"My filings"** (not
  "Documents" — the label is different for Union Officials). The
  documents are grouped by category (Registration, Annual Filings,
  Governance, Oversight). Each category shows "x of y current" (how
  many of the required types you've filed). Within each category,
  documents are **sorted by next due date** — the oldest filing is
  first (it's the most likely to need renewal).
- **What you should see:** the first document in each category is the
  one closest to needing renewal. If any document is expiring soon or
  overdue, it should be at the top of its category.

### Task 3.2 — Upload a Financial Return

- **Do:** still on the **My filings** tab, click **Upload Document**
  (the button in the union header card, top-right).
- **What you should see:** a dialog with a **Document Type** dropdown.
  The dropdown is grouped by category: Registration (Application for
  Registration, Registration Certificate, Constitution), Annual
  Filings (Financial Return, Financial Membership List, Affiliations,
  Welfare Fund), Governance (Election of Office Bearers, Secret
  Ballots, General Secretary Appointments), Oversight (Inspection
  Reports, Awards, General Matters).
- **Do:** select **Financial Return** from the Annual Filings group.
  Enter a title (e.g. "2025 Financial Return"). Choose any PDF file from
  your computer. Click **Upload**.
- **What you should see:** the upload completes. The document appears
  in your My filings tab under the Annual Filings category with
  review status **"Pending Review"**. It does NOT count as Compliant
  yet — it will only count after the Industrial Registrar approves it.
  A toast confirms "Document uploaded".

### Task 3.3 — Try to find another union's data (should be impossible)

- **Do:** this is the critical test. Try to access another union's
  data:
  1. Go to the Compliance view. You should see ONLY Papua Maritime
     Workers Union's row — no other unions.
  2. Try to manually visit `/?view=unions` (the Industrial Registrar's
     full unions list) by typing it in the URL. You should be
     redirected to My Union or see a "you don't have access" state —
     NOT the full list.
  3. Try to visit a specific union's detail page by typing
     `/unions/IO-02` (Highlands Coffee Growers Association) in the
     URL. The public detail page may load, but the staff-side
     document management for that union should be blocked.
  4. Try the global search (Ctrl+K). Search for "Coffee" or
     "Highlands". You should get NO results — your search is scoped
     to your own union only.
- **What you should see:** your data is scoped to your union. No way
  to see other unions' compliance data, documents, tasks, or audit
  entries from the staff app.

### Task 3.4 — Create a task

- **Do:** click **Tasks** in the sidebar (under Work).
- **What you should see:** a list of tasks for your union. Tasks
  assigned to you appear here.
- **Do:** click **Create Task**.
- **What you should see:** a dialog with fields for Title,
  Description, Due Date, Priority, and Assignee.
- **Do:** fill in a test task (e.g. "Renew Financial Return" with a
  due date next month) and click **Save**.
- **What you should see:** the new task appears in your task list. It
  has status "To Do". You can mark it "In Progress" or "Done" using
  the status dropdown on the task row.

### Task 3.5 — Read a notification

- **Do:** click the **bell icon** (top-right, next to your account
  initials).
- **What you should see:** a dropdown listing your recent
  notifications. Each notification has a title, a short body, and a
  timestamp. Notifications are scoped to your union — you won't see
  notifications about other unions.
- **Do:** click one of the notifications.
- **What you should see:** the notification is marked as read (the
  unread count badge on the bell icon decreases). If the notification
  has a link, you're navigated to the relevant page (e.g. a
  compliance alert might link to the Compliance view).

### Task 3.6 — Tell us what was confusing

- **Do:** click your account initials (top-right) → **Give feedback**.
- **What you should see:** your email client opens with "Union
  Official" role pre-filled.
- **Do:** type one or two sentences about anything that was confusing
  or didn't work as expected. Send the email (or close it). Your
  feedback goes into `BACKLOG.md` for the team to triage.

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
