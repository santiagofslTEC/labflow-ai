import { describe, expect, it } from "vitest";

import { formatElapsed, levelBars } from "./meter";

describe("levelBars", () => {
  it("shapes the level with the envelope", () => {
    expect(levelBars(1)).toEqual([0.5, 0.8, 1, 0.8, 0.5]);
    expect(levelBars(0.5)).toEqual([0.25, 0.4, 0.5, 0.4, 0.25]);
  });

  it("never drops below the 0.15 floor", () => {
    expect(levelBars(0)).toEqual([0.15, 0.15, 0.15, 0.15, 0.15]);
    const expected = [0.15, 0.16, 0.2, 0.16, 0.15];
    levelBars(0.2).forEach((height, i) => {
      expect(height).toBeCloseTo(expected[i]);
    });
  });

  it("clamps levels outside 0 to 1", () => {
    expect(levelBars(3)).toEqual(levelBars(1));
    expect(levelBars(-1)).toEqual(levelBars(0));
    expect(levelBars(Number.NaN)).toEqual(levelBars(0));
  });
});

describe("formatElapsed", () => {
  it.each([
    [0, "00:00"],
    [999, "00:00"],
    [1000, "00:01"],
    [65_000, "01:05"],
    [600_000, "10:00"],
    [5_999_000, "99:59"],
    [10_000_000, "99:59"],
    [-5000, "00:00"],
  ])("formats %i ms as %s", (ms, text) => {
    expect(formatElapsed(ms)).toBe(text);
  });
});
