import { describe, expect, it } from "vitest";

import { formatQuantity, parseDecimal } from "./format";

describe("formatQuantity", () => {
  it.each([
    [73.5, "%", "73,5 %"],
    [50, "°C", "50 °C"],
    [15, "min", "15 min"],
    [7.2, null, "7,2"],
    [0.12345, "g", "0,123 g"],
    [2.5, "mL", "2,5 mL"],
    [-3.25, "°C", "-3,25 °C"],
    [100, "%", "100 %"],
  ] as const)("formats %s with unit %s as %s", (value, unit, expected) => {
    expect(formatQuantity(value, unit)).toBe(expected);
  });

  it("does not pad decimals", () => {
    expect(formatQuantity(73.5, null)).toBe("73,5");
    expect(formatQuantity(73, null)).toBe("73");
  });
});

describe("parseDecimal", () => {
  it.each([
    ["73,5", 73.5],
    ["73.5", 73.5],
    ["  73,5 ", 73.5],
    ["1.234", 1.234],
    ["50", 50],
    ["-2,5", -2.5],
    ["0", 0],
  ] as const)("reads %j as %s", (text, value) => {
    expect(parseDecimal(text)).toEqual({ ok: true, value });
  });

  it.each([
    "",
    "   ",
    "x",
    "abc",
    "1.234,5",
    "1,2,3",
    "1e3",
    "73,",
    ",5",
    "+5",
    "5 %",
  ])("rejects %j", (text) => {
    expect(parseDecimal(text)).toEqual({ ok: false });
  });

  it("round trips the edit field text", () => {
    expect(parseDecimal(formatQuantity(73.5, null))).toEqual({
      ok: true,
      value: 73.5,
    });
  });
});
