import { describe, expect, it } from "vitest";

import { accessPathFor, safeNextPath } from "./access";

describe("safeNextPath", () => {
  it.each([
    ["/experimentos/3", "/experimentos/3"],
    ["/dev/ui?estado=saved", "/dev/ui?estado=saved"],
    [null, "/"],
    ["", "/"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/access", "/"],
    ["/access?next=/x", "/"],
  ] as const)("%s → %s", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });
});

describe("accessPathFor", () => {
  it("drops next for the home page", () => {
    expect(accessPathFor("/")).toBe("/access");
  });

  it("encodes the page to return to", () => {
    expect(accessPathFor("/experimentos/3?tab=tabla")).toBe(
      "/access?next=%2Fexperimentos%2F3%3Ftab%3Dtabla",
    );
  });
});
