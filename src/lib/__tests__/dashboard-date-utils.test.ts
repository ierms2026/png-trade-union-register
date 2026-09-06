import { describe, it, expect } from "vitest";
import {
  formatAbsolute,
  formatRelative,
  formatDueDate,
  formatEventRelative,
  RELATIVE_THRESHOLD_DAYS,
} from "../dashboard/date-utils";

// Frozen time for deterministic tests: 2026-06-15T12:00:00Z
const NOW = new Date("2026-06-15T12:00:00Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("date-utils", () => {
  describe("formatAbsolute", () => {
    it("formats a date as 'Jun 12, 2026'", () => {
      const date = new Date("2026-06-12T10:00:00Z");
      expect(formatAbsolute(date)).toBe("Jun 12, 2026");
    });

    it("formats a date with single-digit day", () => {
      const date = new Date("2026-01-03T10:00:00Z");
      expect(formatAbsolute(date)).toBe("Jan 3, 2026");
    });
  });

  describe("formatRelative", () => {
    it("returns 'today' when same day", () => {
      const date = new Date(NOW.getTime() + 2 * 60 * 60 * 1000); // 2 hours later same day
      expect(formatRelative(date, NOW)).toBe("today");
    });

    it("returns 'in 12 days' for 12 days in the future", () => {
      const date = new Date(NOW.getTime() + 12 * MS_PER_DAY);
      expect(formatRelative(date, NOW)).toBe("in 12 days");
    });

    it("returns 'in 1 day' for 1 day in the future", () => {
      const date = new Date(NOW.getTime() + 1 * MS_PER_DAY);
      expect(formatRelative(date, NOW)).toBe("in 1 day");
    });

    it("returns '3 days overdue' for 3 days in the past", () => {
      const date = new Date(NOW.getTime() - 3 * MS_PER_DAY);
      expect(formatRelative(date, NOW)).toBe("3 days overdue");
    });

    it("returns '1 day overdue' for 1 day in the past", () => {
      const date = new Date(NOW.getTime() - 1 * MS_PER_DAY);
      expect(formatRelative(date, NOW)).toBe("1 day overdue");
    });

    it("returns 'in 2 hours' for 2 hours in the future", () => {
      const date = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
      expect(formatRelative(date, NOW)).toBe("today"); // same calendar day
    });

    it("is deterministic — same input always produces same output", () => {
      const date = new Date(NOW.getTime() + 5 * MS_PER_DAY);
      const result1 = formatRelative(date, NOW);
      const result2 = formatRelative(date, NOW);
      expect(result1).toBe(result2);
      expect(result1).toBe("in 5 days");
    });
  });

  describe("formatDueDate", () => {
    it("combines absolute and relative: '12 Jun 2026 · in 3 days'", () => {
      const date = new Date(NOW.getTime() + 3 * MS_PER_DAY);
      const result = formatDueDate(date, NOW);
      expect(result).toContain("·");
      expect(result).toContain(formatAbsolute(date));
      expect(result).toContain("in 3 days");
    });

    it("combines for overdue: '12 Jun 2026 · 3 days overdue'", () => {
      const date = new Date(NOW.getTime() - 3 * MS_PER_DAY);
      const result = formatDueDate(date, NOW);
      expect(result).toContain("·");
      expect(result).toContain(formatAbsolute(date));
      expect(result).toContain("3 days overdue");
    });
  });

  // ===========================================================================
  // 5.2 — formatEventRelative (event-timestamp semantics, distinct from
  // formatRelative's due-date semantics). Always past, "ago" form, with
  // fallback to absolute at RELATIVE_THRESHOLD_DAYS (7 days).
  // ===========================================================================
  describe("formatEventRelative (chunk 5.2)", () => {
    it("RELATIVE_THRESHOLD_DAYS is 7 (regression guard; 6.2 may tune)", () => {
      expect(RELATIVE_THRESHOLD_DAYS).toBe(7);
    });

    it("returns 'just now' for < 1 minute (past)", () => {
      const date = new Date(NOW.getTime() - 30 * 1000); // 30 seconds ago
      expect(formatEventRelative(date, NOW)).toBe("just now");
    });

    it("returns 'just now' for < 1 minute (FUTURE — clock-skew defense)", () => {
      // Events are always past in production, but clock skew or test
      // fixtures could produce future dates. < 1 minute → "just now",
      // never negative "ago" strings.
      const date = new Date(NOW.getTime() + 30 * 1000); // 30 seconds in the future
      expect(formatEventRelative(date, NOW)).toBe("just now");
    });

    it("returns 'N minute(s) ago' for 1 min ≤ diff < 1 hour — singular for 1, plural for >1", () => {
      const oneMin = new Date(NOW.getTime() - 60 * 1000);
      expect(formatEventRelative(oneMin, NOW)).toBe("1 minute ago");

      const twoMin = new Date(NOW.getTime() - 2 * 60 * 1000);
      expect(formatEventRelative(twoMin, NOW)).toBe("2 minutes ago");

      const fiftyNineMin = new Date(NOW.getTime() - 59 * 60 * 1000);
      expect(formatEventRelative(fiftyNineMin, NOW)).toBe("59 minutes ago");
    });

    it("returns 'N hour(s) ago' for 1 hour ≤ diff < 1 day — singular for 1, plural for >1", () => {
      const oneHour = new Date(NOW.getTime() - 60 * 60 * 1000);
      expect(formatEventRelative(oneHour, NOW)).toBe("1 hour ago");

      const twoHours = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
      expect(formatEventRelative(twoHours, NOW)).toBe("2 hours ago");

      const twentyThreeHours = new Date(NOW.getTime() - 23 * 60 * 60 * 1000);
      expect(formatEventRelative(twentyThreeHours, NOW)).toBe("23 hours ago");
    });

    it("returns 'N day(s) ago' for 1 day ≤ diff < 7 days — singular for 1, plural for >1", () => {
      const oneDay = new Date(NOW.getTime() - 1 * MS_PER_DAY);
      expect(formatEventRelative(oneDay, NOW)).toBe("1 day ago");

      const twoDays = new Date(NOW.getTime() - 2 * MS_PER_DAY);
      expect(formatEventRelative(twoDays, NOW)).toBe("2 days ago");

      const sixDays = new Date(NOW.getTime() - 6 * MS_PER_DAY);
      expect(formatEventRelative(sixDays, NOW)).toBe("6 days ago");
    });

    it("returns formatAbsolute(date) for diff ≥ RELATIVE_THRESHOLD_DAYS (7-day threshold)", () => {
      const sevenDays = new Date(NOW.getTime() - 7 * MS_PER_DAY);
      expect(formatEventRelative(sevenDays, NOW)).toBe(formatAbsolute(sevenDays));

      const thirtyDays = new Date(NOW.getTime() - 30 * MS_PER_DAY);
      expect(formatEventRelative(thirtyDays, NOW)).toBe(formatAbsolute(thirtyDays));

      const oneYear = new Date(NOW.getTime() - 365 * MS_PER_DAY);
      expect(formatEventRelative(oneYear, NOW)).toBe(formatAbsolute(oneYear));
    });

    it("BOUNDARY: 6 days → '6 days ago'; 7 days → absolute (boundary is INCLUSIVE on the absolute side)", () => {
      // The boundary is `days < RELATIVE_THRESHOLD_DAYS` for the "N days ago"
      // branch; `days >= RELATIVE_THRESHOLD_DAYS` falls through to absolute.
      // So 6 days = "6 days ago", 7 days = absolute.
      const sixDays = new Date(NOW.getTime() - 6 * MS_PER_DAY);
      expect(formatEventRelative(sixDays, NOW)).toBe("6 days ago");

      const sevenDays = new Date(NOW.getTime() - 7 * MS_PER_DAY);
      expect(formatEventRelative(sevenDays, NOW)).toBe(formatAbsolute(sevenDays));
    });

    it("BOUNDARY: 59 minutes → '59 minutes ago'; 60 minutes (1 hour) → '1 hour ago'", () => {
      const fiftyNineMin = new Date(NOW.getTime() - 59 * 60 * 1000);
      expect(formatEventRelative(fiftyNineMin, NOW)).toBe("59 minutes ago");

      const sixtyMin = new Date(NOW.getTime() - 60 * 60 * 1000);
      expect(formatEventRelative(sixtyMin, NOW)).toBe("1 hour ago");
    });

    it("BOUNDARY: 23 hours → '23 hours ago'; 24 hours (1 day) → '1 day ago'", () => {
      const twentyThreeHours = new Date(NOW.getTime() - 23 * 60 * 60 * 1000);
      expect(formatEventRelative(twentyThreeHours, NOW)).toBe("23 hours ago");

      const twentyFourHours = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
      expect(formatEventRelative(twentyFourHours, NOW)).toBe("1 day ago");
    });

    it("future dates ≥ 1 minute return formatAbsolute (defensive, no negative 'ago' strings)", () => {
      // Events shouldn't be in the future; clock skew or test fixtures
      // could produce them. The function returns the absolute format (not
      // "in N minutes/hours/days" — that's formatRelative's domain).
      const futureOneHour = new Date(NOW.getTime() + 60 * 60 * 1000);
      expect(formatEventRelative(futureOneHour, NOW)).toBe(formatAbsolute(futureOneHour));
    });

    it("is pure — same (date, now) always produces same output (frozen-time determinism)", () => {
      const date = new Date(NOW.getTime() - 3 * 60 * 60 * 1000); // 3 hours ago
      const r1 = formatEventRelative(date, NOW);
      const r2 = formatEventRelative(date, NOW);
      const r3 = formatEventRelative(date, NOW);
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
      expect(r1).toBe("3 hours ago");
    });

    it("mutation test — advancing frozen now across a boundary updates the relative label; the absolute (via title) is stable", () => {
      // Event at 2026-06-15T09:00:00Z (3 hours before NOW at 12:00).
      const eventDate = new Date("2026-06-15T09:00:00Z");

      // At NOW=12:00, the event was 3 hours ago.
      expect(formatEventRelative(eventDate, NOW)).toBe("3 hours ago");

      // Advance NOW by 4 hours → NOW = 16:00. The event was 7 hours ago.
      const NOW_PLUS_4H = new Date("2026-06-15T16:00:00Z");
      expect(formatEventRelative(eventDate, NOW_PLUS_4H)).toBe("7 hours ago");

      // Advance NOW by 1 day → NOW = 2026-06-16T12:00:00Z. Event was 1 day + 3 hours ago.
      // The function uses floor(absMs / MS_PER_DAY) = 1, so it should be "1 day ago".
      const NOW_PLUS_1D = new Date("2026-06-16T12:00:00Z");
      expect(formatEventRelative(eventDate, NOW_PLUS_1D)).toBe("1 day ago");

      // The absolute value (via title attribute, computed in the component)
      // is STABLE — it doesn't depend on `now`. The component computes
      // `formatAbsolute(eventDate)` ONCE; that value is "Jun 15, 2026" and
      // doesn't change as `now` advances. (Verified at the component layer
      // by the <time dateTime={ISO} title={absolute}> invariant — the
      // title attribute never changes when `now` advances.)
      expect(formatAbsolute(eventDate)).toBe("Jun 15, 2026");
    });
  });
});
