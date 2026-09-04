import { describe, it, expect } from "vitest";
import { formatAbsolute, formatRelative, formatDueDate } from "../dashboard/date-utils";

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
});
