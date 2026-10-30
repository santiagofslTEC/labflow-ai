import { describe, expect, it } from "vitest";

import { sampleDetail } from "@/test/experiments";

import {
  deleteConfirmText,
  deletedText,
  draftOf,
  emptyDraft,
  parseAliases,
  savedValueCounts,
  toVariableIn,
  validateVariable,
} from "./variable-form";

const draft = (over: Partial<typeof emptyDraft>) => ({
  ...emptyDraft,
  ...over,
});

describe("validateVariable (spec 0008, AC-4)", () => {
  it("uses the create form's messages", () => {
    expect(validateVariable(draft({ name: " " }), [])).toEqual({
      name: "Escribe un nombre",
    });
    expect(
      validateVariable(draft({ name: "temperatura" }), ["Temperatura"]),
    ).toEqual({
      name: "Hay otra variable con este nombre",
    });
    expect(
      validateVariable(draft({ name: "pH", min: "abc", max: "2" }), []),
    ).toEqual({ min: "Escribe un número, por ejemplo 20 o 20,5" });
    expect(
      validateVariable(draft({ name: "pH", min: "9", max: "2,5" }), []),
    ).toEqual({
      min: "El mínimo no puede ser mayor que el máximo",
    });
    expect(validateVariable(draft({ name: "x".repeat(81) }), [])).toEqual({
      name: "Máximo 80 caracteres",
    });
  });

  it("limits the other names", () => {
    const nine = Array.from({ length: 9 }, (_, i) => `n${i}`).join(",");
    expect(validateVariable(draft({ name: "pH", aliases: nine }), [])).toEqual({
      aliases: "Máximo 8 otros nombres",
    });
    expect(
      validateVariable(draft({ name: "pH", aliases: "x".repeat(41) }), []),
    ).toEqual({ aliases: "Cada otro nombre tiene máximo 40 caracteres" });
  });
});

describe("the body and the draft", () => {
  it("sends every field, with blanks as null and comma decimals read", () => {
    expect(
      toVariableIn(
        draft({
          name: " Presión ",
          unit: " ",
          min: "1,5",
          aliases: "p, ,P, pres",
        }),
      ),
    ).toEqual({
      name: "Presión",
      unit: null,
      min_value: 1.5,
      max_value: null,
      required: true,
      aliases: ["p", "pres"],
    });
  });

  it("starts an edit from the saved variable", () => {
    expect(draftOf(sampleDetail.variables[0]!)).toEqual({
      name: "Temperatura",
      unit: "°C",
      min: "20",
      max: "100",
      required: true,
      aliases: "temp",
    });
    expect(parseAliases("a, A ,b")).toEqual(["a", "b"]);
  });
});

describe("counts and texts (AC-1, AC-6)", () => {
  it("counts saved values per variable", () => {
    const cell = (variable_id: number) => ({
      variable_id,
      value: 1,
      said_text: null,
      saved_at: "2026-10-29T12:00:00Z",
    });
    const counts = savedValueCounts([
      { id: 1, number: 1, cells: [cell(1), cell(2)] },
      { id: 2, number: 2, cells: [cell(1)] },
    ]);
    expect([...counts]).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });

  it("says what a delete takes", () => {
    expect(deleteConfirmText(["Presión", "Duración"], 14)).toBe(
      "Se borrarán Presión y Duración y 14 valores guardados. Esto no se puede deshacer.",
    );
    expect(deleteConfirmText(["pH"], 1)).toBe(
      "Se borrarán pH y 1 valor guardado. Esto no se puede deshacer.",
    );
    expect(deleteConfirmText(["pH"], 0)).toBe("Se borrarán pH.");
    expect(deletedText({ variables: 2, measurements: 1, trials: 0 })).toBe(
      "Eliminé 2 variables y 1 valor.",
    );
  });
});
