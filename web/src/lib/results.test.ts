import { describe, expect, it } from "vitest";

import { sampleDetail } from "@/test/experiments";

import {
  bestTrial,
  chartData,
  extremeText,
  meanText,
  parseSelection,
  pointsInXOrder,
  pointText,
  selectionQuery,
  skippedText,
  trialsText,
} from "./results";

// sampleDetail: 1 Temperatura °C, 2 Duración min, 3 pH (no unit).
const [temp, dur, ph] = sampleDetail.variables as [
  (typeof sampleDetail.variables)[number],
  (typeof sampleDetail.variables)[number],
  (typeof sampleDetail.variables)[number],
];

const params = (query: string) => new URLSearchParams(query);

const cell = (variable_id: number, value: number) => ({
  variable_id,
  value,
  said_text: null,
  saved_at: "2026-10-29T12:00:00Z",
});

const trials = [
  { id: 1, number: 1, cells: [cell(1, 70), cell(2, 20), cell(3, 7)] },
  { id: 2, number: 2, cells: [cell(1, 50), cell(3, 6.5)] },
  { id: 3, number: 3, cells: [cell(2, 30)] },
];

describe("parseSelection (spec 0009, AC-2, AC-6)", () => {
  it("defaults to the first two variables and the last, max", () => {
    expect(parseSelection(params(""), sampleDetail.variables)).toEqual({
      x: 1,
      y: 2,
      best: 3,
      dir: "max",
    });
  });

  it("reads the URL and falls back on unknown ids", () => {
    expect(
      parseSelection(params("x=3&y=99&best=1&dir=min"), sampleDetail.variables),
    ).toEqual({ x: 3, y: 2, best: 1, dir: "min" });
    expect(
      parseSelection(params("x=1.5&dir=up"), sampleDetail.variables),
    ).toEqual({
      x: 1,
      y: 2,
      best: 3,
      dir: "max",
    });
    expect(selectionQuery({ x: 3, y: 1, best: 2, dir: "min" })).toBe(
      "x=3&y=1&best=2&dir=min",
    );
  });
});

describe("chartData (AC-3, AC-4)", () => {
  it("plots trials with both values and counts the rest", () => {
    const data = chartData(trials, temp, ph);
    expect(data.points).toEqual([
      { trial: 1, x: 70, y: 7 },
      { trial: 2, x: 50, y: 6.5 },
    ]);
    expect(data.skipped).toBe(1);
    expect(skippedText(data.skipped, data.missing)).toBe(
      "1 ensayo sin Temperatura o pH no aparece",
    );
    expect(chartData(trials, dur, temp).missing).toBe("Duración o Temperatura");
    expect(pointsInXOrder(data.points).map((p) => p.trial)).toEqual([2, 1]);
    expect(pointText(data.points[1]!, temp, ph)).toBe(
      "Ensayo 2 · Temperatura 50 °C · pH 6,5",
    );
  });
});

describe("summary texts (AC-5)", () => {
  it("names the trials of an extreme and rounds the mean", () => {
    expect(trialsText([10])).toBe("ensayo 10");
    expect(trialsText([3, 7, 9])).toBe("ensayos 3, 7 y 9");
    expect(extremeText(83, "%", [3, 7])).toBe("83 % · ensayos 3 y 7");
    expect(meanText(78.33333, "%")).toBe("78,333 %");
  });
});

describe("bestTrial (AC-6)", () => {
  const results = {
    variables: [
      {
        variable_id: 1,
        count: 2,
        min: 50,
        max: 70,
        mean: 60,
        min_trials: [2],
        max_trials: [1],
      },
      {
        variable_id: 3,
        count: 2,
        min: 6.5,
        max: 7,
        mean: 6.75,
        min_trials: [2],
        max_trials: [1, 3],
      },
      {
        variable_id: 2,
        count: 0,
        min: null,
        max: null,
        mean: null,
        min_trials: [],
        max_trials: [],
      },
    ],
  };

  it("takes the summary's own trials, the lowest number first", () => {
    expect(bestTrial(results, trials, 1, "max")?.trial.number).toBe(1);
    expect(bestTrial(results, trials, 1, "min")?.trial.number).toBe(2);
    const tie = bestTrial(results, trials, 3, "max");
    expect([tie?.trial.number, tie?.ties]).toEqual([1, [3]]);
    expect(bestTrial(results, trials, 2, "max")).toBeNull();
  });
});
