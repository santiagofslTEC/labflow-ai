import { describe, expect, it } from "vitest";

import { copy, saveLabel } from "./copy";
import type { ProposalValue } from "./types";

const v = (
  variableId: number,
  value: number | null,
  unit: string | null,
  previous?: number | null,
): ProposalValue => ({
  variableId,
  name: `v${variableId}`,
  unit,
  value,
  previous,
});

describe("saveLabel names what it saves (spec 0006, AC-22)", () => {
  it.each([
    [[], "Guardar"],
    [[v(1, 73, "%")], "Guardar 73 %"],
    [[v(1, 73.5, "%")], "Guardar 73,5 %"],
    [[v(1, 7.2, null)], "Guardar 7,2"],
    [[v(1, 65, "°C"), v(2, 20, "min")], "Guardar 65 °C y 20 min"],
    [
      [v(1, 65, "°C"), v(2, null, "min"), v(3, 74, "%")],
      "Guardar 65 °C y 74 %",
    ],
    [
      [v(1, 65, "°C"), v(2, 20, "min"), v(3, 74, "%")],
      "Guardar ensayo 6 · 3 valores",
    ],
    [[v(1, 12000, "min")], "Guardar 12000 min"],
  ] as const)("%j → %s", (values, label) => {
    expect(saveLabel(values, 6, false)).toBe(label);
  });

  it("names a correction", () => {
    expect(saveLabel([v(3, 73, "%", 74)], 3, true)).toBe(
      "Reemplazar 74 % por 73 %",
    );
    expect(saveLabel([v(3, 73, "%", null)], 3, true)).toBe(
      "Guardar 73 % en ensayo 3",
    );
    expect(saveLabel([v(1, 50, "°C", 48), v(3, 73, "%", 74)], 3, true)).toBe(
      "Reemplazar ensayo 3 · 2 valores",
    );
  });

  it("labels the check button with the value", () => {
    expect(copy.check(120, "min")).toBe("Sí, es 120 min");
  });
});
