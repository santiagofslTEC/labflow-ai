import { describe, expect, it } from "vitest";

import {
  dayLabel,
  groupByDay,
  understoodBefore,
  type ThreadLine,
} from "./conversation";

const NOW = new Date(2026, 9, 30, 15, 0, 0);

const line = (id: number, at: Date): ThreadLine => ({
  id,
  role: id % 2 ? "user" : "assistant",
  text: `línea ${id}`,
  source: id % 2 ? "voice" : null,
  created_at: at.toISOString(),
  readings: [],
});

describe("dayLabel", () => {
  it.each([
    [new Date(2026, 9, 30, 0, 5), "Hoy"],
    [new Date(2026, 9, 29, 23, 59), "Ayer"],
    [new Date(2026, 9, 21, 9, 0), "21 oct"],
    [new Date(2025, 8, 3, 9, 0), "3 sept 2025"],
  ])("%s reads %s", (date, expected) => {
    expect(dayLabel(date, NOW)).toBe(expected);
  });
});

describe("groupByDay", () => {
  it("keeps the order and starts a group on each new day", () => {
    const days = groupByDay(
      [
        line(1, new Date(2026, 9, 29, 10, 0)),
        line(2, new Date(2026, 9, 29, 10, 1)),
        line(3, new Date(2026, 9, 30, 9, 0)),
      ],
      NOW,
    );
    expect(days.map((d) => d.label)).toEqual(["Ayer", "Hoy"]);
    expect(days.map((d) => d.lines.map((l) => l.id))).toEqual([[1, 2], [3]]);
  });

  it("is empty for no lines", () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe("understoodBefore", () => {
  it("gives a reply the readings of the line before it", () => {
    const reading = {
      variable: "Temperatura",
      said_text: "cincuenta grados",
      value: 50,
      unit: "°C",
      trial_number: 4,
    };
    const lines = [
      { ...line(1, NOW), readings: [reading] },
      line(2, NOW),
      line(4, NOW),
    ];
    expect(understoodBefore(lines, 1)).toEqual([reading]);
    expect(understoodBefore(lines, 0)).toEqual([]);
    expect(understoodBefore(lines, 2)).toEqual([]);
  });
});
