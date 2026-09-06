// =============================================================================
// Date formatting utilities for the dashboard.
//
// Pure functions — all accept an injectable `now` so tests can freeze time.
// Created in chunk 3.1 for the Needs Attention panel. Chunk 5.2 added
// formatEventRelative for the Recent Activity panel.
//
// TWO RELATIVE FUNCTIONS (do not conflate them):
//   - formatRelative(date, now)       — DUE-DATE semantics (future = "in 12
//     days", past = "3 days overdue"). Used by formatDueDate for the Needs
//     Attention panel + Compliance Heatmap.
//   - formatEventRelative(date, now)  — EVENT-TIMESTAMP semantics (always
//     past = "just now" / "5 minutes ago" / "3 days ago", with fallback to
//     absolute at RELATIVE_THRESHOLD_DAYS). Used by the Recent Activity
//     panel (chunk 5.2).
// =============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Format a date as an absolute date string: "12 Jun 2026".
 * Uses en-US locale with short month + numeric day + numeric year.
 */
export function formatAbsolute(date: Date): string {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format the relative time between `date` and `now`.
 *
 * - Future: "in 12 days" / "in 1 day" / "in 2 hours" / "today"
 * - Past: "3 days overdue" / "1 day overdue" / "2 hours overdue" / "overdue"
 *
 * @param date The target date (e.g. expiry date)
 * @param now  Injectable "now" — defaults to new Date()
 * @returns Relative time string
 */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(Math.abs(diffMs) / MS_PER_DAY);

  if (diffMs === 0 || (Math.abs(diffMs) < MS_PER_DAY && diffMs > 0 && diffDays === 0)) {
    return "today";
  }

  if (diffMs > 0) {
    // Future
    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
      return diffHours > 0 ? `in ${diffHours} hour${diffHours === 1 ? "" : "s"}` : "today";
    }
    return `in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
  } else {
    // Past (overdue)
    if (diffDays === 0) {
      const diffHours = Math.floor(Math.abs(diffMs) / (60 * 60 * 1000));
      return diffHours > 0 ? `${diffHours} hour${diffHours === 1 ? "" : "s"} overdue` : "overdue";
    }
    return `${diffDays} day${diffDays === 1 ? "" : "s"} overdue`;
  }
}

/**
 * Format a due date as "absolute · relative": "12 Jun 2026 · in 12 days"
 * or "3 Jan 2026 · 3 days overdue".
 *
 * @param date The expiry/due date
 * @param now  Injectable "now" — defaults to new Date()
 * @returns Combined absolute + relative string
 */
export function formatDueDate(date: Date, now: Date = new Date()): string {
  return `${formatAbsolute(date)} · ${formatRelative(date, now)}`;
}

// =============================================================================
// Chunk 5.2 — formatEventRelative: EVENT-TIMESTAMP semantics for the Recent
// Activity panel. Distinct from formatRelative (which has due-date
// semantics). Repurposing formatRelative would break existing due-date
// callers (Needs Attention panel, Compliance Heatmap).
// =============================================================================

/**
 * Threshold at which formatEventRelative stops returning relative phrasing
 * and falls back to the absolute date format. Past this threshold, the
 * relative phrasing ("42 days ago") becomes harder to scan than the
 * absolute ("12 Jun 2026").
 *
 * Default 7 days. 6.2 may tune. Lives HERE (beside the function that uses
 * it) so all date-formatting thresholds have a single home — a future
 * "config audit" can grep this file for every threshold constant.
 */
export const RELATIVE_THRESHOLD_DAYS = 7;

/**
 * Format an event's timestamp as a relative, scannable string.
 *
 * EVENT-TIMESTAMP semantics (always past, "ago" form):
 *   - < 1 minute  → "just now"
 *   - < 1 hour    → "N minute(s) ago"
 *   - < 1 day     → "N hour(s) ago"
 *   - < 7 days    → "N day(s) ago"
 *   - ≥ 7 days    → formatAbsolute(date) — fallback for scannability
 *
 * The 7-day threshold is RELATIVE_THRESHOLD_DAYS (above). Beyond it,
 * "42 days ago" is harder to read than "12 Jun 2026"; the absolute form
 * also makes the year visible (the relative form obscures it).
 *
 * Future events: events are always in the past (they've already happened).
 * If a future date is passed (clock skew or test fixture), the function
 * returns "just now" for differences < 1 minute, and the absolute format
 * otherwise — never produces negative "ago" strings.
 *
 * Pure: no I/O, no Date.now() leaks. Pass `now` in tests to freeze time.
 *
 * @param date The event's timestamp (always past in production; defensive
 *             against future dates).
 * @param now  Injectable "now" — defaults to new Date().
 * @returns A scannable relative string, OR the absolute date format when
 *          the difference exceeds RELATIVE_THRESHOLD_DAYS.
 */
export function formatEventRelative(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime(); // positive when date is in the past
  const absMs = Math.abs(diffMs);

  // < 1 minute → "just now" (handles future < 1 minute too — clock skew defense)
  if (absMs < 60 * 1000) {
    return "just now";
  }

  // Future dates ≥ 1 minute: defensive fallback (events shouldn't be in
  // the future, but clock skew or test fixtures could produce them).
  if (diffMs < 0) {
    return formatAbsolute(date);
  }

  // Past dates from here on.
  if (absMs < 60 * 60 * 1000) {
    // < 1 hour: minutes
    const minutes = Math.floor(absMs / (60 * 1000));
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (absMs < MS_PER_DAY) {
    // < 1 day: hours
    const hours = Math.floor(absMs / (60 * 60 * 1000));
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(absMs / MS_PER_DAY);
  if (days < RELATIVE_THRESHOLD_DAYS) {
    // < 7 days: days
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  // ≥ 7 days: absolute fallback
  return formatAbsolute(date);
}
