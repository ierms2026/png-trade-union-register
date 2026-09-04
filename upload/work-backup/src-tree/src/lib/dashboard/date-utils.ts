// =============================================================================
// Date formatting utilities for the dashboard.
//
// Pure functions — all accept an injectable `now` so tests can freeze time.
// Created in chunk 3.1 for the Needs Attention panel. Chunk 5.2 will
// consolidate all date formatting on this module.
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
