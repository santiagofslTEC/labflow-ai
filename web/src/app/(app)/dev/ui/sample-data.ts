import type { ProposalValue } from "@/components/proposal-card/types";

// The product doc's demo experiment (docs/product, "Experimento de ejemplo"),
// the same one `make seed` loads. Constant sample data for /dev/ui and tests.
export const SAMPLE_EXPERIMENT_TITLE = "Ejemplo: rendimiento vs. temperatura";

export type SampleVariable = {
  readonly id: number;
  readonly name: string;
  readonly unit: string | null;
};

export const SAMPLE_VARIABLES: readonly SampleVariable[] = [
  { id: 1, name: "Temperatura", unit: "°C" },
  { id: 2, name: "Duración", unit: "min" },
  { id: 3, name: "Rendimiento", unit: "%" },
];

export type SampleTrial = {
  readonly trialNumber: number;
  readonly values: readonly number[]; // in SAMPLE_VARIABLES order
};

export const SAMPLE_TRIALS: readonly SampleTrial[] = [
  { trialNumber: 1, values: [40, 15, 58] },
  { trialNumber: 2, values: [45, 15, 64] },
  { trialNumber: 3, values: [50, 15, 73] },
  { trialNumber: 4, values: [55, 15, 80] },
  { trialNumber: 5, values: [60, 15, 76] },
];

export const sampleValues = (trial: SampleTrial): readonly ProposalValue[] =>
  SAMPLE_VARIABLES.map((variable, index) => ({
    variableId: variable.id,
    name: variable.name,
    unit: variable.unit,
    value: trial.values[index] ?? null,
  }));

// Trial 3 as the card proposes it, with the decimal from the doc's test table.
export const SAMPLE_PROPOSAL_VALUES: readonly ProposalValue[] = [
  { variableId: 1, name: "Temperatura", unit: "°C", value: 50 },
  { variableId: 2, name: "Duración", unit: "min", value: 15 },
  { variableId: 3, name: "Rendimiento", unit: "%", value: 73.5 },
];

export const SAMPLE_PHRASE =
  "Ensayo 3, temperatura 50 grados, 15 minutos, rendimiento 73,5 por ciento";

// A unitless variable, to show the number alone (AC-8).
export const SAMPLE_PH_VALUE: ProposalValue = {
  variableId: 4,
  name: "pH",
  unit: null,
  value: 7.2,
};

// Spec 0006: what the user said next to what LabFlow understood. Light: nothing to check.
export const SAMPLE_SAID_VALUES: readonly ProposalValue[] = [
  {
    variableId: 1,
    name: "Temperatura",
    unit: "°C",
    value: 50,
    saidText: "50 grados",
    interpreted: false,
    flags: [],
    checked: false,
  },
  {
    variableId: 2,
    name: "Duración",
    unit: "min",
    value: 15,
    saidText: "15 minutos",
    interpreted: false,
    flags: [],
    checked: false,
  },
  {
    variableId: 3,
    name: "Rendimiento",
    unit: "%",
    value: 73.5,
    saidText: "setenta y tres coma cinco por ciento",
    interpreted: true,
    flags: [],
    checked: false,
  },
];

// Flagged: a converted unit, and a reading out of range that also came from °F.
export const SAMPLE_FLAGGED_VALUES: readonly ProposalValue[] = [
  {
    variableId: 1,
    name: "Temperatura",
    unit: "°C",
    value: 500,
    saidText: "932 °F",
    interpreted: true,
    checked: false,
    flags: [
      { reason: "out_of_range", text: "Fuera del rango esperado: 20 a 100 °C" },
      { reason: "converted", text: "Convertí 932 °F a 500 °C" },
    ],
  },
  {
    variableId: 2,
    name: "Duración",
    unit: "min",
    value: 120,
    saidText: "2 horas",
    interpreted: true,
    checked: true,
    flags: [{ reason: "converted", text: "Convertí 2 horas a 120 min" }],
  },
  {
    variableId: 3,
    name: "Rendimiento",
    unit: "%",
    value: 74,
    saidText: "74 por ciento",
    interpreted: false,
    flags: [],
    checked: false,
  },
];
