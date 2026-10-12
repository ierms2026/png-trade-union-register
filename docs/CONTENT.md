# CONTENT — Plain-Language Glossary for Testers

This document defines every domain term shown in the Union Records
Management System UI, in plain language a union officer can follow.
It is the **single source of truth** for the help text shown in the
"?" popovers next to status badges and key labels, and for the
onboarding welcome panels.

If you change a definition here, also change it in
`src/lib/dashboard/content-definitions.ts` (the runtime mirror). The
test `src/lib/__tests__/content-definitions.test.ts` enforces that
every popover key used in the UI exists in that mirror, so a missing
key fails the build.

---

## 1. Compliance Statuses (the 6 colors you see on the matrix)

These describe whether a required document is in good standing for a
given union. The colors are the same everywhere they appear (dashboard
tiles, compliance matrix, document list, public portal).

### Compliant
The document is filed, has been approved by the Registrar, and its
renewal date (counted from the approval date) is more than 90 days
away. **Green.** This is the only status that counts toward the
compliance rate.

### Expiring
The document is filed and approved, but its renewal date is within
the next 90 days. **Amber/orange.** The union should start preparing
a renewal now so it does not slip into Overdue.

### Overdue
The document is filed and approved, but its renewal date has already
passed. **Red.** The union is out of compliance for this document
type and should file a renewal immediately.

### Awaiting Review
The document has been uploaded by the union, but the Registrar has
not yet approved it (or has rejected it and is waiting for a new
upload). **Blue.** This is **not** a gap in compliance — the union
has done their part. The document is on the Registrar's desk. It
does **not** count toward the compliance rate until approved.

### Missing
No document has been filed for this type, or a previously-filed
document was disposed under retention rules. **Grey.** The union
needs to file a new document.

### Not Applicable
This document type is not required for this union. **Light grey.**
No action is needed.

---

## 2. Review Statuses (what the Registrar does with an uploaded document)

These describe the Registrar's review of a document the union has
uploaded. A document must be **Approved** before it counts toward
compliance.

### Pending Review
The document has been uploaded by a union representative or officer,
but the Registrar has not yet approved it. A document in this state
does **not** count toward compliance — it must be approved first.

### Approved
The document has been reviewed and approved by the Registrar. Only
approved documents count toward compliance.

### Rejected
The document was reviewed by the Registrar and rejected. The union
should upload a corrected version. A rejected document does **not**
count toward compliance.

---

## 3. Union Statuses (the badge on each union record)

### Active
The union is currently registered and operating. It has met the
requirements of the Industrial Organizations Act and its registration
is in good standing. **Green.**

### Suspended
The union's registration has been **temporarily** suspended by the
Registrar. A suspended union cannot operate as a registered trade
union, **but the suspension may be lifted** once the issues are
resolved. **Amber.** Think of this as "on pause" — the union is
still on the register, just not allowed to act as a union right now.

### Deregistered
The union's registration has been **cancelled** by the Registrar. A
deregistered union is **no longer recognised** as a trade union
under the Industrial Organizations Act. The record is kept on the
register for historical reference. **Grey.** This is permanent —
unlike Suspended, there is no "lift" action.

#### Suspended vs Deregistered — the short version
- **Suspended** = temporary. The union can come back.
- **Deregistered** = permanent. The union is gone; the record stays
  for history.

---

## 4. Document Types (the kinds of records a union must file)

These are the standard document types tracked by the system. Each
union may be required to file some or all of them, depending on the
compliance rules configured by the Registrar.

- **Registration Certificate** — the official certificate issued by
  the Registrar when the union was first registered. This is the
  union's "birth certificate."
- **Constitution** — the union's governing rules. It sets out how
  the union is run, how office bearers are elected, and how
  decisions are made.
- **Financial Return** — the union's annual financial statements.
  Shows the union's income, expenses, assets, and liabilities.
- **Election of Office Bearers** — the record of the most recent
  election of the union's office bearers (president, secretary,
  treasurer, etc.).
- **Financial Membership List** — the current list of financial
  members of the union.
- **Awards** — any industrial awards or agreements the union is a
  party to.
- **Affiliations** — records of the union's affiliations with other
  bodies (e.g. a national trade union congress).

---

## 5. Retention (how long documents are kept)

Retention is the rule that says how long a document must be kept
**after it has been superseded or expired**. For example, a
Financial Return filed in 2020 that was renewed in 2021 becomes
"historical" — but the 2020 record cannot just be deleted. Retention
rules say how long it must be kept before disposal.

- **retentionYrs** (Retention Years) — the number of years a
  document of a given type must be kept after it is superseded or
  expired. The default is 7 years for most document types.
- **Retention & Disposal** — the staff view that lists documents that
  have reached the end of their retention period and are ready for
  disposal. The Registrar must approve each disposal before it
  happens.

A document does **not** go to the Retention & Disposal the moment it
expires. It goes there once its retention period has also elapsed
(i.e. it has been historical for `retentionYrs` years).

---

## 6. Disposal (destroying a document at end of retention)

Disposal is the act of permanently removing a document from the
active register once its retention period has ended. Disposal is
**not** automatic — it must be requested, go through a cooldown
period, and then be executed by the Registrar.

- **Disposition Request** — a formal request to dispose of a
  document. Created from the Retention & Disposal.
- **Cooldown** — a mandatory waiting period between requesting a
  disposal and executing it. This gives interested parties a chance
  to object. The cooldown length is configured per system.
- **Certificate of Disposal** — a JSON certificate generated when a
  disposal is executed. It records what was disposed, when, by whom,
  and why — for audit history.

### Disposition Statuses

- **Scheduled** — the disposal has been requested and is in its
  cooldown. It cannot be executed yet.
- **Cancelled** — the disposal was cancelled (e.g. a legal hold was
  placed, or the Registrar changed their mind). The document stays
  on the register.
- **Executed** — the disposal has been carried out. The document is
  no longer on the active register; the certificate of disposal is
  kept for audit.
- **Blocked** — the disposal cannot proceed (e.g. a legal hold is
  in place, or the document is needed for an open review).

---

## 7. Legal Hold (freezing a document from disposal)

A legal hold is a flag the Registrar can place on a document to
prevent it from being disposed, even if its retention period has
ended. Legal holds are typically used when a document is relevant
to an active investigation, court case, or complaint.

- **Place a Hold** — flag the document as frozen. No disposition
  request can be executed while the hold is in place.
- **Lift a Hold** — remove the flag. The document can then be
  disposed normally (subject to its retention period).

---

## 8. Roles (who can do what)

### Registrar
The system administrator. The Registrar can do everything: register
and deregister unions, approve or reject documents, configure
compliance rules, manage users, place and lift legal holds, and
approve disposals. There is typically only one Registrar account
(or a small number).

### Inspector
An oversight role. The Inspector can view everything the Registrar
can see (unions, documents, compliance, audit log) but **cannot
make changes** — they cannot approve documents, configure rules,
manage users, or dispose of records. The Inspector is for
auditors and reviewers.

### Officer
A union-scoped staff user. An Officer is assigned to **one specific
union** and can only see data for that union. They can file
documents for their union and view their union's compliance status.
They cannot see other unions' data, manage users, or configure
rules.

---

## 9. Tasks (the to-do list)

Tasks are the system's to-do list. They are created by the Registrar
(or by automated compliance alerts) and assigned to a staff user.

- **To Do** — the task has been created but not yet started. This is
  the default state for new tasks.
- **In Progress** — the task is actively being worked on by the
  assignee.
- **Done** — the task has been finished. Completed tasks stay on
  the list for audit history.
- **Cancelled** — the task has been cancelled and is no longer being
  worked on. The task stays on the list for audit history — it is
  not deleted.

---

## 10. Contact Updates (when a union wants to change its details)

When a union wants to update its contact details (address, phone,
email), the change does not happen directly — it goes through an
approval flow.

- **Pending** — the union has submitted a contact update request.
  The Registrar has not yet approved it.
- **Approved** — the Registrar has approved the request. The
  union's contact details have been updated.
- **Rejected** — the Registrar has rejected the request. The
  union's contact details are unchanged. The union can submit a
  new request.

---

## 11. Webhooks (sending events to other systems)

A webhook is a way for the system to notify another system when
something happens (e.g. a document is approved, a union is
deregistered). The other system receives an HTTP POST with details
of the event.

- **Pending** — the webhook delivery has been queued but not yet
  sent.
- **Delivered** — the webhook was sent and the receiving system
  responded with a success status (2xx).
- **Failed** — the webhook was sent but the receiving system
  responded with an error, or did not respond at all. Failed
  deliveries are retried automatically.

---

## 12. Audit Log (the system's history)

The audit log records every meaningful action taken in the system:
who did what, when, and what changed. The audit log cannot be
edited or deleted — it is the permanent record of the system's
activity. The Audit view lets the Registrar and Inspector browse
the log by date, actor, action type, and severity.

### Severity

Each audit entry has a severity level:

- **INFO** — a normal event (e.g. a document was filed).
- **WARNING** — something that may need attention (e.g. a document
  is expiring soon).
- **CRITICAL** — something that needs immediate attention (e.g. a
  union was deregistered, a legal hold was lifted).

---

## 13. Compliance Rate (the headline number on the dashboard)

The compliance rate is the percentage of required document slots
that are **Compliant**. The formula is:

```
Compliance Rate = Compliant
                  ────────────────────────────────────────────
                  Compliant + Expiring + Overdue + Awaiting Review + Missing
```

Notes:
- **Not Applicable** slots are excluded from both numerator and
  denominator (they are not required, so they do not help or hurt
  the rate).
- **Awaiting Review** is in the denominator but not the numerator —
  the union has done their part, but the document does not count
  as compliant until the Registrar approves it.
- If the denominator is zero (no required documents at all), the
  rate is 0%, not 100%.

This formula lives in one place: `computeRateFromCounts` in
`src/lib/dashboard/metrics.ts`. Every chart, tile, and export uses
that helper. No code may re-implement the formula.
