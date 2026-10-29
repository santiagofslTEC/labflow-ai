import type {
  TrialsView,
  VariableDetail,
  VariableIn,
  VariablesDeleted,
} from "@/api/experiments";
import { LIMITS, MESSAGES } from "@/lib/experiment-form";
import { formatNumber, parseDecimal } from "@/lib/format";

// One variable added or edited from "Revisar variables" (spec 0008). Pure; the
// limits and messages are the create form's, so both paths say the same thing.
// Other names mirror VariableIn in api/app/services/experiment_rules.py.
export const ALIAS_LIMITS = { count: 8, length: 40 } as const;

export const VARIABLE_MESSAGES = {
  ...MESSAGES,
  aliasesTooMany: `Máximo ${ALIAS_LIMITS.count} otros nombres`,
  aliasTooLong: `Cada otro nombre tiene máximo ${ALIAS_LIMITS.length} caracteres`,
  unitLocked: (unit: string | null) =>
    `No se puede cambiar: ya hay valores guardados en ${unit ?? "sin unidad"}`,
  keepOne: "Deja al menos una variable",
} as const;

export type VariableDraft = {
  readonly name: string;
  readonly unit: string;
  readonly min: string;
  readonly max: string;
  readonly required: boolean;
  readonly aliases: string; // comma separated, as typed
};

export type DraftField = "name" | "unit" | "min" | "max" | "aliases";
export type DraftErrors = Readonly<Partial<Record<DraftField, string>>>;

export const emptyDraft: VariableDraft = {
  name: "",
  unit: "",
  min: "",
  max: "",
  required: true,
  aliases: "",
};

// Comma decimals for people, like the create form shows them.
const boundText = (value: number | null): string =>
  value === null ? "" : String(value).replace(".", ",");

export const draftOf = (variable: VariableDetail): VariableDraft => ({
  name: variable.name,
  unit: variable.unit ?? "",
  min: boundText(variable.min_value),
  max: boundText(variable.max_value),
  required: variable.required,
  aliases: (variable.aliases ?? []).join(", "),
});

// "p, presión ,, P" → ["p", "presión"]: trimmed, blanks dropped, one per name
// ignoring case (the API refuses duplicates; the form never sends one).
export const parseAliases = (text: string): readonly string[] => {
  const seen = new Set<string>();
  return text
    .split(",")
    .map((alias) => alias.trim())
    .filter((alias) => {
      const key = alias.toLowerCase();
      if (!alias || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

type Bound =
  | { readonly kind: "blank" }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "invalid" };

const parseBound = (text: string): Bound => {
  if (text.trim() === "") return { kind: "blank" };
  const parsed = parseDecimal(text);
  return parsed.ok && Number.isFinite(parsed.value)
    ? { kind: "number", value: parsed.value }
    : { kind: "invalid" };
};

// The create form's rules for one variable (spec 0005, AC-4, AC-5).
export const validateVariable = (
  draft: VariableDraft,
  otherNames: readonly string[],
): DraftErrors => {
  const errors: Partial<Record<DraftField, string>> = {};
  const name = draft.name.trim();
  if (!name) errors.name = MESSAGES.nameRequired;
  else if (name.length > LIMITS.name)
    errors.name = MESSAGES.tooLong(LIMITS.name);
  else if (
    otherNames.some((other) => other.toLowerCase() === name.toLowerCase())
  )
    errors.name = MESSAGES.duplicateName;
  if (draft.unit.trim().length > LIMITS.unit)
    errors.unit = MESSAGES.tooLong(LIMITS.unit);
  const min = parseBound(draft.min);
  const max = parseBound(draft.max);
  if (min.kind === "invalid") errors.min = MESSAGES.notANumber;
  if (max.kind === "invalid") errors.max = MESSAGES.notANumber;
  if (min.kind === "number" && max.kind === "number" && min.value > max.value)
    errors.min = MESSAGES.minAboveMax;
  const aliases = parseAliases(draft.aliases);
  if (aliases.length > ALIAS_LIMITS.count)
    errors.aliases = VARIABLE_MESSAGES.aliasesTooMany;
  else if (aliases.some((alias) => alias.length > ALIAS_LIMITS.length))
    errors.aliases = VARIABLE_MESSAGES.aliasTooLong;
  return errors;
};

const boundValue = (text: string): number | null => {
  const bound = parseBound(text);
  return bound.kind === "number" ? bound.value : null;
};

// Every field, every time: the API's PUT is a full replacement (AC-3).
export const toVariableIn = (draft: VariableDraft): VariableIn => ({
  name: draft.name.trim(),
  unit: draft.unit.trim() || null,
  min_value: boundValue(draft.min),
  max_value: boundValue(draft.max),
  required: draft.required,
  aliases: [...parseAliases(draft.aliases)],
});

// Saved values per variable, from the trials the panel already loads (AC-1).
export const savedValueCounts = (
  trials: TrialsView["trials"],
): ReadonlyMap<number, number> => {
  const counts = new Map<number, number>();
  for (const trial of trials)
    for (const cell of trial.cells)
      counts.set(cell.variable_id, (counts.get(cell.variable_id) ?? 0) + 1);
  return counts;
};

const joined = (parts: readonly string[]): string =>
  parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} y ${parts.at(-1) ?? ""}`;

const plural = (n: number, one: string, many: string): string =>
  `${formatNumber(n)} ${n === 1 ? one : many}`;

export const valueCount = (n: number): string => plural(n, "valor", "valores");

export const variableCount = (n: number): string =>
  plural(n, "variable", "variables");

export const deleteLabel = (n: number): string =>
  `Eliminar ${variableCount(n)}`;

// The confirmation (AC-6): names, and the saved values that go with them.
export const deleteConfirmText = (
  names: readonly string[],
  values: number,
): string =>
  values > 0
    ? `Se borrarán ${joined(names)} y ${plural(values, "valor guardado", "valores guardados")}. Esto no se puede deshacer.`
    : `Se borrarán ${joined(names)}.`;

export const deletedText = (result: VariablesDeleted): string =>
  `Eliminé ${variableCount(result.variables)} y ${plural(result.measurements, "valor", "valores")}.`;
