import type {
  ExperimentDetail,
  ResultsView,
  TrialsView,
} from "@/api/experiments";
import { formatQuantity } from "@/lib/format";

// The results page (spec 0009). Pure: the chart and the best trial only place
// and pick saved values; every aggregate comes from the API.

type Variable = ExperimentDetail["variables"][number];
export type Direction = "max" | "min";

export type Selection = {
  readonly x: number;
  readonly y: number;
  readonly best: number;
  readonly dir: Direction;
};

type Params = { readonly get: (name: string) => string | null };

const pick = (
  params: Params,
  name: string,
  ids: readonly number[],
): number | null => {
  const raw = params.get(name);
  const id = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  return id !== null && ids.includes(id) ? id : null;
};

// From the URL, falling back to X first, Y second, best last (AC-2, AC-6).
export const parseSelection = (
  params: Params,
  variables: readonly Variable[],
): Selection => {
  const ids = variables.map((v) => v.id);
  const first = ids[0] ?? 0;
  const second = ids[1] ?? first;
  return {
    x: pick(params, "x", ids) ?? first,
    y: pick(params, "y", ids) ?? second,
    best: pick(params, "best", ids) ?? ids.at(-1) ?? first,
    dir: params.get("dir") === "min" ? "min" : "max",
  };
};

export const selectionQuery = (selection: Selection): string =>
  new URLSearchParams({
    x: String(selection.x),
    y: String(selection.y),
    best: String(selection.best),
    dir: selection.dir,
  }).toString();

export const variableLabel = (variable: Variable): string =>
  variable.unit ? `${variable.name} (${variable.unit})` : variable.name;

export type Point = {
  readonly trial: number;
  readonly x: number;
  readonly y: number;
};

export type ChartData = {
  readonly points: readonly Point[];
  readonly skipped: number;
  readonly missing: string; // the name the skipped trials lack, for AC-3
};

const valueOf = (
  trial: TrialsView["trials"][number],
  variableId: number,
): number | null =>
  trial.cells.find((cell) => cell.variable_id === variableId)?.value ?? null;

// One point per trial with both values, at exactly the saved values (AC-3).
export const chartData = (
  trials: TrialsView["trials"],
  x: Variable,
  y: Variable,
): ChartData => {
  const points: Point[] = [];
  let lacksX = 0;
  let lacksY = 0;
  for (const trial of trials) {
    const xv = valueOf(trial, x.id);
    const yv = valueOf(trial, y.id);
    if (xv === null) lacksX += 1;
    if (yv === null) lacksY += 1;
    if (xv !== null && yv !== null)
      points.push({ trial: trial.number, x: xv, y: yv });
  }
  const skipped = trials.length - points.length;
  const missing =
    lacksX > 0 && lacksY > 0 && x.id !== y.id
      ? `${x.name} o ${y.name}`
      : lacksX > 0
        ? x.name
        : y.name;
  return { points, skipped, missing };
};

// "Ver puntos" lists them in X order, ties by trial number (AC-4).
export const pointsInXOrder = (points: readonly Point[]): readonly Point[] =>
  [...points].sort((a, b) => a.x - b.x || a.trial - b.trial);

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

export const plottedText = (n: number): string =>
  `${plural(n, "ensayo graficado", "ensayos graficados")}`;

export const skippedText = (n: number, name: string): string =>
  `${plural(n, "ensayo", "ensayos")} sin ${name} ${n === 1 ? "no aparece" : "no aparecen"}`;

export const pointText = (point: Point, x: Variable, y: Variable): string =>
  `Ensayo ${point.trial} · ${x.name} ${formatQuantity(point.x, x.unit)} · ${y.name} ${formatQuantity(point.y, y.unit)}`;

const joined = (parts: readonly string[]): string =>
  parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} y ${parts.at(-1) ?? ""}`;

// "ensayo 10", "ensayos 3 y 7" (AC-5).
export const trialsText = (trials: readonly number[]): string =>
  trials.length === 1
    ? `ensayo ${trials[0]}`
    : `ensayos ${joined(trials.map(String))}`;

export const extremeText = (
  value: number,
  unit: string | null,
  trials: readonly number[],
): string => `${formatQuantity(value, unit)} · ${trialsText(trials)}`;

// The mean names no trial; at most 3 decimals through formatQuantity (AC-5).
export const meanText = (value: number, unit: string | null): string =>
  formatQuantity(Math.round(value * 1000) / 1000, unit);

export type Best = {
  readonly trial: TrialsView["trials"][number];
  readonly ties: readonly number[];
};

// The summary's own max or min trials, so both always name the same (AC-6).
export const bestTrial = (
  results: ResultsView,
  trials: TrialsView["trials"],
  variableId: number,
  dir: Direction,
): Best | null => {
  const summary = results.variables.find((v) => v.variable_id === variableId);
  const holders = summary
    ? dir === "max"
      ? summary.max_trials
      : summary.min_trials
    : [];
  const [first, ...ties] = holders;
  const trial = trials.find((t) => t.number === first);
  return first === undefined || !trial ? null : { trial, ties };
};
