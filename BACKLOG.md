# BACKLOG — Stakeholder Feedback

This file collects feedback from stakeholder testing. It is the single
place to file bugs, ask questions, and request features for the Register
of Trade Unions.

**How to add an item:** copy the template line under the right section,
fill it in, and save. One item per line. Don't group multiple issues.

**Who reads this:** the Registrar (decides priority) and the development
team (implements). Items are reviewed at the weekly checkpoint.

**Status conventions:** write `[OPEN]` when you add an item. When it's
picked up, change to `[IN PROGRESS]` and add the owner's name. When
done, change to `[DONE]` and add the date. Don't delete items — the
history is valuable.

---

## Bugs

Things that are broken: wrong data, crashes, broken links, pages that
don't load, actions that don't work. If you expected X and got Y, file
it here.

**Template:**
```
- [OPEN] [BUG] <short title> — <what you did> → <what you expected> → <what actually happened>. Page: <URL>. Role: <Registrar/Inspector/Officer/Public>. Reported by: <name>, <date>.
```

**Example:**
```
- [OPEN] [BUG] Review Queue "Approve" button shows no confirmation — clicked Approve on a Financial Return → expected a "are you sure?" dialog → the document was approved instantly with no way to undo. Page: /?view=reviews. Role: Registrar. Reported by: Jane, 2026-10-12.
```

<!-- Add bugs below this line -->

---

## Questions

Things you're not sure about: "should this work this way?", "what does
this term mean?", "where do I find X?", "is this intentional?". If it's
not broken but you're confused, file it here. Don't worry about whether
it's a "silly" question — if you're confused, someone else will be too.

**Template:**
```
- [OPEN] [Q] <short title> — <what you're unsure about>. Context: <which page / which action>. Role: <Registrar/Inspector/Officer/Public>. Asked by: <name>, <date>.
```

**Example:**
```
- [OPEN] [Q] What does "Awaiting Review" mean for compliance? — I uploaded a document and it shows as Awaiting Review, but the compliance rate went down. Is that right? Context: /?view=compliance. Role: Officer. Asked by: John, 2026-10-12.
```

<!-- Add questions below this line -->

---

## Feature requests

Things that would make the system better but aren't broken today: "it
would be nice if...", "I wish I could...", "in the old system we
could...". These are NOT bugs — they're improvements. File them here
even if they seem small.

**Template:**
```
- [OPEN] [FR] <short title> — <what you want to be able to do> → <why it would help>. Page: <URL or "whole app">. Role: <Registrar/Inspector/Officer/Public>. Requested by: <name>, <date>.
```

**Example:**
```
- [OPEN] [FR] Export compliance matrix as Excel — I want to download the compliance matrix as an .xlsx file so I can sort and filter it myself. Page: /?view=compliance. Role: Inspector. Requested by: Mary, 2026-10-12.
```

<!-- Add feature requests below this line -->

---

## How to give feedback without editing this file

If you can't edit this file directly (or prefer not to), use the
**"Give feedback"** link in the top-right of the app (next to your
account menu). It opens your email client with the current page URL and
your role pre-filled — just type what you saw and hit send. The
development team will add it to this file for you.

For urgent issues (system down, data loss, security), contact the
Registrar directly — do not wait for the weekly checkpoint.
