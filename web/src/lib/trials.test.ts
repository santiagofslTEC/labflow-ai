import { describe, expect, it } from "vitest";

import { csvNumber, csvRows, recentLines, tableRows } from "./trials";

const variables = [
  { id: 1, name: "Temperatura", unit: "°C" },
  { id: 2, name: "pH", unit: null },
];

const cell = (variable_id: number, value: number) => ({
  variable_id,
  value,
  said_text: null,
  saved_at: "2026-10-29T12:00:00Z",
});

describe("tableRows", () => {
  it("places cells by variable order, null for a missing value", () => {
    expect(
      tableRows(variables, [
        { id: 5, number: 2, cells: [cell(2, 7), cell(1, 65)] },
        { id: 6, number: 4, cells: [cell(2, 6.5)] },
      ]),
    ).toEqual([
      { id: 5, number: 2, values: [65, 7] },
      { id: 6, number: 4, values: [null, 6.5] },
    ]);
  });
});

describe("recentLines", () => {
  it("names the trial, the variable, and the value with its unit", () => {
    const lines = recentLines(variables, [
      {
        trial_number: 6,
        variable_id: 1,
        value: 73.5,
        saved_at: "2026-10-29T12:00:00Z",
      },
      {
        trial_number: 6,
        variable_id: 99,
        value: 1,
        saved_at: "2026-10-29T12:00:00Z",
      },
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      "Ensayo 6 · Temperatura 73,5 °C",
    ]);
  });
});

describe("csv", () => {
  it.each([
    [73.5, "73.5"],
    [1200, "1200"],
    [-0.25, "-0.25"],
    [0.1 + 0.2, "0.3"],
  ])("csvNumber(%s) → %s", (value, text) => {
    expect(csvNumber(value)).toBe(text);
  });

  it("writes the trial number, then each value or an empty field", () => {
    expect(
      csvRows([
        { id: 1, number: 3, values: [70, null] },
        { id: 2, number: 10, values: [65.5, 7] },
      ]),
    ).toEqual([
      ["3", "70", ""],
      ["10", "65.5", "7"],
    ]);
  });
});
