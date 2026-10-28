import { describe, expect, it } from "vitest";

import { csvField, csvFileName, trialsCsv } from "./csv";

describe("csvField", () => {
  it("leaves plain values alone", () => {
    expect(csvField("50")).toBe("50");
  });

  it("quotes commas, quotes, and line breaks", () => {
    expect(csvField("12,5")).toBe('"12,5"');
    expect(csvField('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });
});

describe("trialsCsv", () => {
  const variables = [
    { name: "Temperatura", unit: "°C" },
    { name: "Observación", unit: null },
  ];

  it("writes a header with units, even with no trials", () => {
    expect(trialsCsv(variables, [])).toBe(
      "Ensayo,Temperatura (°C),Observación\r\n",
    );
  });

  it("writes one row per trial", () => {
    expect(trialsCsv(variables, [["1", "50", "turbio, oscuro"]])).toBe(
      'Ensayo,Temperatura (°C),Observación\r\n1,50,"turbio, oscuro"\r\n',
    );
  });
});

describe("csvFileName", () => {
  it("slugs the title without accents", () => {
    expect(csvFileName("Análisis de temperatura")).toBe(
      "analisis-de-temperatura.csv",
    );
  });

  it("falls back when nothing is left", () => {
    expect(csvFileName("¿?")).toBe("cuaderno.csv");
  });
});
