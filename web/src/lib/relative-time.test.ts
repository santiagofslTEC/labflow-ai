import { describe, expect, it } from "vitest";

import { formatRelative, formatShortDate } from "./relative-time";

const NOW = new Date(2026, 9, 28, 12, 0, 0);
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelative (spec 0005, AC-1)", () => {
  it.each([
    [0, "ahora"],
    [59_000, "ahora"],
    [-5 * MINUTE, "ahora"],
    [MINUTE, "hace 1 minuto"],
    [5 * MINUTE, "hace 5 minutos"],
    [3 * HOUR, "hace 3 horas"],
    [DAY, "ayer"],
    [4 * DAY, "hace 4 días"],
    [6 * DAY + 23 * HOUR, "hace 6 días"],
    [7 * DAY, "21 oct"],
  ])("%i ms ago reads %s", (elapsed, expected) => {
    expect(formatRelative(ago(elapsed), NOW)).toBe(expected);
  });

  it("adds the year to an older date from another year", () => {
    expect(formatRelative(new Date(2025, 8, 3), NOW)).toBe("3 sept 2025");
  });
});

describe("formatShortDate", () => {
  it("shows day and month this year, and the year otherwise", () => {
    expect(formatShortDate(new Date(2026, 9, 28), NOW)).toBe("28 oct");
    expect(formatShortDate(new Date(2025, 9, 28), NOW)).toBe("28 oct 2025");
  });
});
