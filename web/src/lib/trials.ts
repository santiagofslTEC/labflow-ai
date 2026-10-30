import type { TrialsView } from "@/api/experiments";
import { formatQuantity } from "@/lib/format";

// The side panel's trials table, recent list, and CSV rows (spec 0007). Pure:
// the API orders everything, so these only place cells by variable position.

type Variable = {
  readonly id: number;
  readonly name: string;
  readonly unit: string | null;
};

export type TrialTableRow = {
  readonly id: number;
  readonly number: number;
  // One per variable, in the notebook's order; null when the trial has none.
  readonly values: readonly (number | null)[];
};

export const tableRows = (
  variables: readonly Variable[],
  trials: TrialsView["trials"],
): readonly TrialTableRow[] =>
  trials.map((trial) => {
    const byVariable = new Map(
      trial.cells.map((cell) => [cell.variable_id, cell.value]),
    );
    return {
      id: trial.id,
      number: trial.number,
      values: variables.map((v) => byVariable.get(v.id) ?? null),
    };
  });

export type RecentLine = {
  readonly key: string;
  readonly text: string;
  readonly savedAt: string;
};

// "Ensayo 6 · Rendimiento 74 %", newest first as the API sends them (AC-3).
export const recentLines = (
  variables: readonly Variable[],
  recent: TrialsView["recent"],
): readonly RecentLine[] => {
  const byId = new Map(variables.map((v) => [v.id, v]));
  return recent.flatMap((item) => {
    const variable = byId.get(item.variable_id);
    if (!variable) return [];
    return [
      {
        key: `${item.trial_number}-${item.variable_id}`,
        text: `Ensayo ${item.trial_number} · ${variable.name} ${formatQuantity(item.value, variable.unit)}`,
        savedAt: item.saved_at,
      },
    ];
  });
};

// Dot decimal, no grouping, the 6 decimals the API keeps: 73.5, 1200 (AC-6).
export const csvNumber = (value: number): string =>
  String(Number(value.toFixed(6)));

export const csvRows = (
  rows: readonly TrialTableRow[],
): readonly (readonly string[])[] =>
  rows.map((row) => [
    String(row.number),
    ...row.values.map((v) => (v === null ? "" : csvNumber(v))),
  ]);
