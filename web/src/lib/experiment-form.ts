// The new notebook form (spec 0005, AC-3 to AC-6, AC-23 to AC-27): its state,
// the reducer that changes it, the validator, and the request body. Pure: no
// React, no fetch.
import type { InstructionsProposal, NewExperiment } from "@/api/experiments";

import { parseDecimal } from "./format";
import type { AttachedInstructions } from "./instructions";

// Mirrored by api/app/services/experiment_rules.py; a test on each side pins
// the same numbers, so a change must touch both.
export const LIMITS = {
  title: 200,
  goal: 1000,
  context: 600,
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

// Where a proposed range came from (AC-24): shown while Mín and Máx still hold
// the proposed text, gone for good once either is edited.
export type ProposedRange = {
  readonly quote: string;
  readonly page: number | null;
};

export type VariableRow = {
  // Stable identity for React keys, element ids, and focus moves.
  readonly key: number;
  readonly name: string;
  readonly unit: string;
  readonly min: string;
  readonly max: string;
  readonly required: boolean;
  readonly proposedRange?: ProposedRange | null;
};

export type VariableField = "name" | "unit" | "min" | "max";

export type FormState = {
  readonly title: string;
  readonly goal: string;
  readonly context: string;
  readonly variables: readonly VariableRow[];
  readonly nextKey: number;
  readonly instructions: AttachedInstructions | null;
};

export type FormAction =
  | { readonly type: "set_title"; readonly value: string }
  | { readonly type: "set_goal"; readonly value: string }
  | { readonly type: "set_context"; readonly value: string }
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
  | {
      readonly type: "fill_from_proposal";
      readonly proposal: InstructionsProposal;
      readonly attached: AttachedInstructions;
    }
  | {
      readonly type: "attach_instructions";
      readonly attached: AttachedInstructions;
    }
  | { readonly type: "detach_instructions" }
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
  context: "",
  variables: [emptyRow(0)],
  nextKey: 1,
  instructions: null,
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
  ...state,
  title: EXAMPLE.title,
  goal: EXAMPLE.goal,
  variables: EXAMPLE.variables.map((row, index) => ({
    ...row,
    key: state.nextKey + index,
    required: true,
  })),
  nextKey: state.nextKey + EXAMPLE.variables.length,
});

// Field text, not display text: no thousands grouping ("10.000" would read
// back as 10), every digit kept, a decimal comma.
const bound = (value: number | null): string =>
  value === null ? "" : String(value).replace(".", ",");

// Replaces every value with the proposal, in the order the API returns, at
// most 12 rows; no variables keeps one empty row (AC-23).
const fillFromProposal = (
  state: FormState,
  proposal: InstructionsProposal,
  attached: AttachedInstructions,
): FormState => {
  const proposed = proposal.variables.slice(0, LIMITS.variables);
  const rows: readonly VariableRow[] =
    proposed.length === 0
      ? [emptyRow(state.nextKey)]
      : proposed.map((variable, index) => {
          const kept =
            variable.range_quote !== null &&
            (variable.min_value !== null || variable.max_value !== null);
          return {
            key: state.nextKey + index,
            name: variable.name,
            unit: variable.unit ?? "",
            min: kept ? bound(variable.min_value) : "",
            max: kept ? bound(variable.max_value) : "",
            required: variable.required,
            proposedRange:
              kept && variable.range_quote !== null
                ? { quote: variable.range_quote, page: variable.range_page }
                : null,
          };
        });
  return {
    title: proposal.title,
    goal: proposal.goal ?? "",
    context: proposal.context ?? "",
    variables: rows,
    nextKey: state.nextKey + rows.length,
    instructions: attached,
  };
};

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
    case "set_context":
      return { ...state, context: action.value };
    case "set_variable":
      return updateRow(state, action.key, (row) => ({
        ...row,
        [action.field]: action.value,
        // Editing a bound hides where the proposed range came from (AC-24).
        proposedRange:
          action.field === "min" || action.field === "max"
            ? null
            : row.proposedRange,
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
    case "fill_from_proposal":
      return fillFromProposal(state, action.proposal, action.attached);
    case "attach_instructions":
      return { ...state, instructions: action.attached };
    case "detach_instructions":
      return { ...state, instructions: null };
    case "reset":
      return { ...initialFormState, nextKey: state.nextKey };
  }
}

// Equal to the initial state, ignoring row keys; attached instructions count
// as a change (AC-6, AC-9, AC-27).
export const isPristine = (state: FormState): boolean => {
  const [only, ...rest] = state.variables;
  return (
    state.title === "" &&
    state.goal === "" &&
    state.context === "" &&
    state.instructions === null &&
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
  context: "cuaderno-contexto",
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
  const context = lengthError(state.context, LIMITS.context, null);
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
    ...(context ? [[fieldId.context, context] as const] : []),
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
  context: blankToNull(state.context),
  variables: state.variables.map((row) => ({
    name: row.name.trim(),
    unit: blankToNull(row.unit),
    min_value: boundValue(row.min),
    max_value: boundValue(row.max),
    required: row.required,
  })),
});
