import { describe, expect, it } from "vitest";

import { folderFailure, notebooksLabel, parseFolderId } from "./folders";

describe("notebooksLabel", () => {
  it.each([
    [0, "sin cuadernos"],
    [1, "1 cuaderno"],
    [4, "4 cuadernos"],
  ])("%i reads %s", (count, expected) => {
    expect(notebooksLabel(count)).toBe(expected);
  });
});

describe("parseFolderId", () => {
  it.each([
    ["3", 3],
    ["0", null],
    ["abc", null],
    ["1.5", null],
    [undefined, null],
    [["3"], null],
  ])("%s → %s", (raw, expected) => {
    expect(parseFolderId(raw)).toBe(expected);
  });
});

describe("folderFailure", () => {
  it("prefers the API message and has copy for the rest", () => {
    expect(folderFailure(null)).toBeNull();
    expect(
      folderFailure({ kind: "invalid", message: "Nombre muy largo." }),
    ).toBe("Nombre muy largo.");
    expect(folderFailure({ kind: "not_found" })).toBe(
      "Esa carpeta ya no existe.",
    );
  });
});
