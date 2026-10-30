import { describe, expect, it } from "vitest";

import { sampleDetail } from "@/test/experiments";

import {
  deleteConfirmText,
  deletedText,
  draftOf,
  emptyDraft,
  parseAliases,
  rangeNote,
  savedValues,
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
      validateVariable(draft({ name: "temperatura" }), [
        { name: "Temperatura", aliases: [] },
      ]),
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

describe("names and other names are one set (AC-10)", () => {
  const others = [
    { name: "Temperatura", aliases: ["temp"] },
    { name: "Rendimiento", aliases: [] },
  ];

  it("refuses an other name another variable answers to", () => {
    expect(
      validateVariable(
        draft({ name: "Presión", aliases: "p, rendimiento" }),
        others,
      ),
    ).toEqual({ aliases: "«rendimiento» ya es el nombre de otra variable." });
    expect(
      validateVariable(draft({ name: "Presión", aliases: "TEMP" }), others),
    ).toEqual({ aliases: "«TEMP» ya es otro nombre de Temperatura." });
  });

  it("refuses a name that is another variable's other name", () => {
    expect(validateVariable(draft({ name: "Temp" }), others)).toEqual({
      name: "«Temp» ya es otro nombre de Temperatura.",
    });
  });

  it("drops the variable's own name from its other names", () => {
    expect(parseAliases("pH, PH, acidez", "pH")).toEqual(["acidez"]);
    expect(toVariableIn(draft({ name: "pH", aliases: "ph" })).aliases).toEqual(
      [],
    );
  });
});

describe("the range note (AC-11)", () => {
  const saved = [
    { trial: 2, value: 8 },
    { trial: 1, value: 7 },
    { trial: 3, value: 10 },
  ];
  const initial = draft({ name: "pH", min: "0", max: "14" });

  it("names the trials a narrower range leaves outside", () => {
    expect(rangeNote(saved, initial, { ...initial, min: "9" })).toBe(
      "2 valores guardados quedan fuera de este rango (ensayos 1 y 2). No se cambian.",
    );
    expect(rangeNote(saved, initial, { ...initial, min: "7,5" })).toBe(
      "1 valor guardado queda fuera de este rango (ensayo 1). No se cambia.",
    );
  });

  it("stays quiet while nothing is left out, the range is unchanged, or a bound is not a number", () => {
    expect(rangeNote(saved, initial, { ...initial, max: "12" })).toBeNull();
    const narrow = { ...initial, min: "9" };
    expect(rangeNote(saved, narrow, narrow)).toBeNull();
    expect(rangeNote(saved, initial, { ...initial, min: "abc" })).toBeNull();
    expect(rangeNote([], initial, { ...initial, min: "9" })).toBeNull();
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
  it("lists saved values per variable with their trial", () => {
    const cell = (variable_id: number, value: number) => ({
      variable_id,
      value,
      said_text: null,
      saved_at: "2026-10-29T12:00:00Z",
    });
    const saved = savedValues([
      { id: 1, number: 1, cells: [cell(1, 40), cell(2, 7)] },
      { id: 2, number: 2, cells: [cell(1, 45)] },
    ]);
    expect([...saved]).toEqual([
      [
        1,
        [
          { trial: 1, value: 40 },
          { trial: 2, value: 45 },
        ],
      ],
      [2, [{ trial: 1, value: 7 }]],
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
