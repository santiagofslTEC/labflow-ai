// The new notebook form (spec 0005, AC-3 to AC-6): its state, the reducer that
// changes it, the validator, and the request body. Pure: no React, no fetch.
import type { NewExperiment } from "@/api/experiments";

import { parseDecimal } from "./format";

// Mirrored by api/app/services/experiment_rules.py; a test on each side pins
// the same numbers, so a change must touch both.
export const LIMITS = {
  title: 200,
  goal: 1000,
  name: 80,
  unit: 20,
  variables: 12,
} as const;

export const UNIT_SUGGESTIONS = [
  "°C",
  "K",
  "min",
  "h",
  "s",
  "%",
  "g",
  "mg",
  "mL",
  "L",
  "mol/L",
  "M",
  "kPa",
  "bar",
  "rpm",
] as const;

export type VariableRow = {
  // Stable identity for React keys, element ids, and focus moves.
  readonly key: number;
  readonly name: string;
  readonly unit: string;
  readonly min: string;
  readonly max: string;
  readonly required: boolean;
};

export type VariableField = "name" | "unit" | "min" | "max";

export type FormState = {
  readonly title: string;
  readonly goal: string;
  readonly variables: readonly VariableRow[];
  readonly nextKey: number;
};

export type FormAction =
  | { readonly type: "set_title"; readonly value: string }
  | { readonly type: "set_goal"; readonly value: string }
  | {
      readonly type: "set_variable";
      readonly key: number;
      readonly field: VariableField;
      readonly value: string;
    }
  | {
      readonly type: "set_required";
      readonly key: number;
      readonly value: boolean;
    }
  | { readonly type: "add_row" }
  | { readonly type: "remove_row"; readonly key: number }
  | { readonly type: "fill_example" }
  | { readonly type: "reset" };

const emptyRow = (key: number): VariableRow => ({
  key,
  name: "",
  unit: "",
  min: "",
  max: "",
  required: true,
});

export const initialFormState: FormState = {
  title: "",
  goal: "",
  variables: [emptyRow(0)],
  nextKey: 1,
};

// The sample experiment, with the ranges of api/scripts/seed.py (AC-6).
export const EXAMPLE = {
  title: "Rendimiento vs temperatura",
  goal: "Ver cómo la temperatura cambia el rendimiento de la reacción.",
  variables: [
    { name: "Temperatura", unit: "°C", min: "20", max: "100" },
    { name: "Duración", unit: "min", min: "0", max: "180" },
    { name: "Rendimiento", unit: "%", min: "0", max: "100" },
  ],
} as const;

const fillExample = (state: FormState): FormState => ({
  title: EXAMPLE.title,
  goal: EXAMPLE.goal,
  variables: EXAMPLE.variables.map((row, index) => ({
    ...row,
    key: state.nextKey + index,
    required: true,
  })),
  nextKey: state.nextKey + EXAMPLE.variables.length,
});

const updateRow = (
  state: FormState,
  key: number,
  change: (row: VariableRow) => VariableRow,
): FormState => ({
  ...state,
  variables: state.variables.map((row) =>
    row.key === key ? change(row) : row,
  ),
});

export function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "set_title":
      return { ...state, title: action.value };
    case "set_goal":
      return { ...state, goal: action.value };
    case "set_variable":
      return updateRow(state, action.key, (row) => ({
        ...row,
        [action.field]: action.value,
      }));
    case "set_required":
      return updateRow(state, action.key, (row) => ({
        ...row,
        required: action.value,
      }));
    case "add_row":
      return state.variables.length >= LIMITS.variables
        ? state
        : {
            ...state,
            variables: [...state.variables, emptyRow(state.nextKey)],
            nextKey: state.nextKey + 1,
          };
    case "remove_row":
      return state.variables.length <= 1
        ? state
        : {
            ...state,
            variables: state.variables.filter((row) => row.key !== action.key),
          };
    case "fill_example":
      return fillExample(state);
    case "reset":
      return { ...initialFormState, nextKey: state.nextKey };
  }
}

// Equal to the initial state, ignoring row keys (AC-6, AC-9).
export const isPristine = (state: FormState): boolean => {
  const [only, ...rest] = state.variables;
  return (
    state.title === "" &&
    state.goal === "" &&
    rest.length === 0 &&
    only !== undefined &&
    only.name === "" &&
    only.unit === "" &&
    only.min === "" &&
    only.max === "" &&
    only.required
  );
};

// Element ids double as the error keys, so the first error is the field to focus.
export const fieldId = {
  title: "cuaderno-titulo",
  goal: "cuaderno-objetivo",
  variable: (key: number, field: VariableField | "required" | "remove") =>
    `variable-${key}-${field}`,
} as const;

export const MESSAGES = {
  titleRequired: "Escribe un título",
  nameRequired: "Escribe un nombre",
  tooLong: (max: number) => `Máximo ${max} caracteres`,
  duplicateName: "Hay otra variable con este nombre",
  notANumber: "Escribe un número, por ejemplo 20 o 20,5",
  minAboveMax: "El mínimo no puede ser mayor que el máximo",
  tooManyVariables: `Máximo ${LIMITS.variables} variables`,
} as const;

// Blank is "no value"; otherwise the existing parser, and it must be finite
// ("1" followed by 400 zeros parses to Infinity).
type ParsedBound =
  | { readonly kind: "blank" }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "invalid" };

const parseBound = (text: string): ParsedBound => {
  if (text.trim() === "") return { kind: "blank" };
  const parsed = parseDecimal(text);
  return parsed.ok && Number.isFinite(parsed.value)
    ? { kind: "number", value: parsed.value }
    : { kind: "invalid" };
};

const lengthError = (
  text: string,
  max: number,
  required: string | null,
): string | null => {
  const trimmed = text.trim();
  if (required !== null && trimmed === "") return required;
  return trimmed.length > max ? MESSAGES.tooLong(max) : null;
};

const rowErrors = (
  row: VariableRow,
  earlierNames: ReadonlySet<string>,
): readonly (readonly [string, string])[] => {
  const name = row.name.trim().toLowerCase();
  const nameError =
    lengthError(row.name, LIMITS.name, MESSAGES.nameRequired) ??
    (earlierNames.has(name) ? MESSAGES.duplicateName : null);
  const min = parseBound(row.min);
  const max = parseBound(row.max);
  const minError =
    min.kind === "invalid"
      ? MESSAGES.notANumber
      : min.kind === "number" && max.kind === "number" && min.value > max.value
        ? MESSAGES.minAboveMax
        : null;
  const entries: readonly (readonly [string, string | null])[] = [
    [fieldId.variable(row.key, "name"), nameError],
    [
      fieldId.variable(row.key, "unit"),
      lengthError(row.unit, LIMITS.unit, null),
    ],
    [fieldId.variable(row.key, "min"), minError],
    [
      fieldId.variable(row.key, "max"),
      max.kind === "invalid" ? MESSAGES.notANumber : null,
    ],
  ];
  return entries.filter(
    (entry): entry is readonly [string, string] => entry[1] !== null,
  );
};

export type FormErrors = Readonly<Record<string, string>>;

// Field id → message, in form order (AC-5). Empty means valid.
export function validateExperimentForm(state: FormState): FormErrors {
  const title = lengthError(state.title, LIMITS.title, MESSAGES.titleRequired);
  const goal = lengthError(state.goal, LIMITS.goal, null);
  const variables = state.variables.flatMap((row, index) =>
    rowErrors(
      row,
      new Set(
        state.variables
          .slice(0, index)
          .map((earlier) => earlier.name.trim().toLowerCase()),
      ),
    ),
  );
  const count =
    state.variables.length > LIMITS.variables
      ? [["variables", MESSAGES.tooManyVariables] as const]
      : [];
  return Object.fromEntries([
    ...(title ? [[fieldId.title, title] as const] : []),
    ...(goal ? [[fieldId.goal, goal] as const] : []),
    ...variables,
    ...count,
  ]);
}

const boundValue = (text: string): number | null => {
  const parsed = parseBound(text);
  return parsed.kind === "number" ? parsed.value : null;
};

const blankToNull = (text: string): string | null => text.trim() || null;

// The POST body for a form that passed validation: trimmed, decimals parsed,
// blanks as null, rows in the order the user entered them.
export const toCreateBody = (state: FormState): NewExperiment => ({
  title: state.title.trim(),
  goal: blankToNull(state.goal),
  variables: state.variables.map((row) => ({
    name: row.name.trim(),
    unit: blankToNull(row.unit),
    min_value: boundValue(row.min),
    max_value: boundValue(row.max),
    required: row.required,
  })),
});
