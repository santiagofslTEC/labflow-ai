"use client";

import {
  ChartColumnIcon,
  ChevronLeftIcon,
  CloudOffIcon,
  RotateCwIcon,
  ScatterChartIcon,
  TrophyIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type * as React from "react";

import type {
  ExperimentDetail,
  ResultsView as Results,
  TrialsView,
} from "@/api/experiments";
import { PageHeader } from "@/components/app-shell/page-header";
import { PanelHeading } from "@/components/app-shell/panel-heading";
import {
  NotebookNotFound,
  parseNotebookId,
} from "@/components/notebooks/notebook-view";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useExperiment, useResults, useTrials } from "@/hooks/use-experiments";
import { formatQuantity } from "@/lib/format";
import {
  bestTrial,
  chartData,
  parseSelection,
  plottedText,
  selectionQuery,
  skippedText,
  trialsText,
  variableLabel,
  type Direction,
  type Selection,
} from "@/lib/results";

import { VariableSummary } from "./variable-summary";
import { XYChart } from "./xy-chart";

type Variable = ExperimentDetail["variables"][number];

// /cuadernos/{id}/resultados (spec 0009): the chart, the summary, and the best
// trial, every number from saved data. The selections live in the URL (AC-2).
function ResultsView({ rawId }: { readonly rawId: string }) {
  const id = parseNotebookId(rawId);
  const query = useExperiment(id);

  if (id === null || query.error?.kind === "not_found")
    return <NotebookNotFound />;
  if (query.data) return <ResultsPage experiment={query.data} />;
  if (query.isError) return <LoadError onRetry={() => void query.refetch()} />;
  return <ResultsSkeleton />;
}

function ResultsPage({
  experiment,
}: {
  readonly experiment: ExperimentDetail;
}) {
  const trials = useTrials(experiment.id);
  const results = useResults(experiment.id);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const variables = experiment.variables;
  const selection = parseSelection(params, variables);
  const byId = new Map(variables.map((v) => [v.id, v]));

  const choose = (patch: Partial<Selection>) =>
    router.replace(
      `${pathname}?${selectionQuery({ ...selection, ...patch })}`,
      { scroll: false },
    );

  const failed = trials.isError || results.isError;
  const retry = () => {
    void trials.refetch();
    void results.refetch();
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2 border-b border-line pb-6">
        <nav aria-label="Ruta" className="hidden items-center text-sm lg:flex">
          <Link
            href={`/cuadernos/${experiment.id}`}
            className="-ml-2 inline-flex h-9 items-center gap-1 rounded-control px-2 text-ink-muted focus-ring transition-colors hover:bg-sunken hover:text-ink"
          >
            <ChevronLeftIcon aria-hidden className="size-4" />
            Volver al cuaderno
          </Link>
        </nav>
        <PageHeader eyebrow="Resultados" title={experiment.title} />
      </div>

      {failed ? <LoadError onRetry={retry} /> : null}

      <Section
        id="grafica"
        icon={ScatterChartIcon}
        title={`${byId.get(selection.y)?.name ?? ""} contra ${byId.get(selection.x)?.name ?? ""}`}
      >
        <div className="flex flex-wrap gap-4">
          <VariablePicker
            label="Eje X"
            value={selection.x}
            variables={variables}
            onChange={(x) => choose({ x })}
          />
          <VariablePicker
            label="Eje Y"
            value={selection.y}
            variables={variables}
            onChange={(y) => choose({ y })}
          />
        </div>
        <ChartArea
          trials={trials.data}
          x={byId.get(selection.x)}
          y={byId.get(selection.y)}
        />
      </Section>

      <Section id="resumen" icon={ChartColumnIcon} title="Resumen por variable">
        {results.data ? (
          <VariableSummary variables={variables} results={results.data} />
        ) : failed ? null : (
          <Skeleton className="h-40 w-full" />
        )}
      </Section>

      <Section id="mejor" icon={TrophyIcon} title="Mejor ensayo">
        <div className="flex flex-wrap gap-4">
          <VariablePicker
            label="Variable"
            value={selection.best}
            variables={variables}
            onChange={(best) => choose({ best })}
          />
          <DirectionPicker
            value={selection.dir}
            onChange={(dir) => choose({ dir })}
          />
        </div>
        {trials.data && results.data ? (
          <BestTrial
            variables={variables}
            results={results.data}
            trials={trials.data}
            variable={byId.get(selection.best)}
            dir={selection.dir}
          />
        ) : failed ? null : (
          <Skeleton className="h-24 w-full" />
        )}
      </Section>
    </div>
  );
}

function Section({
  id,
  icon,
  title,
  children,
}: {
  readonly id: string;
  readonly icon: React.ComponentProps<typeof PanelHeading>["icon"];
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <PanelHeading id={id} icon={icon} title={title} />
      {children}
    </section>
  );
}

function ChartArea({
  trials,
  x,
  y,
}: {
  readonly trials: TrialsView | undefined;
  readonly x: Variable | undefined;
  readonly y: Variable | undefined;
}) {
  if (!x || !y) return null;
  if (!trials) return <Skeleton className="h-[360px] w-full" />;
  const { points, skipped, missing } = chartData(trials.trials, x, y);
  if (points.length === 0)
    return (
      <p className="rounded-control bg-sunken px-3 py-6 text-center text-sm text-ink-muted">
        Aún no hay ensayos con {x.name} y {y.name}
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <XYChart x={x} y={y} points={points} />
      <p className="text-sm text-ink-muted">
        {plottedText(points.length)}
        {skipped > 0 ? ` · ${skippedText(skipped, missing)}` : ""}
      </p>
    </div>
  );
}

function BestTrial({
  variables,
  results,
  trials,
  variable,
  dir,
}: {
  readonly variables: readonly Variable[];
  readonly results: Results;
  readonly trials: TrialsView;
  readonly variable: Variable | undefined;
  readonly dir: Direction;
}) {
  if (!variable) return null;
  const best = bestTrial(results, trials.trials, variable.id, dir);
  if (!best)
    return (
      <p className="rounded-control bg-sunken px-3 py-4 text-sm text-ink-muted">
        Aún no hay valores de {variable.name}
      </p>
    );
  const values = new Map(best.trial.cells.map((c) => [c.variable_id, c.value]));
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="text-base font-semibold text-ink">
        Ensayo {best.trial.number}
        <span className="font-normal text-ink-muted">
          {" "}
          · {dir === "max" ? "el más alto" : "el más bajo"} en {variable.name}
        </span>
      </p>
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {variables.map((v) => {
          const value = values.get(v.id);
          return (
            <div
              key={v.id}
              className="flex items-center justify-between gap-4 border-b border-line py-1.5 text-sm"
            >
              <dt className="text-ink-muted">{v.name}</dt>
              <dd className="font-mono text-ink tabular-nums">
                {value === undefined ? (
                  <>
                    <span aria-hidden>—</span>
                    <span className="sr-only">sin valor</span>
                  </>
                ) : (
                  formatQuantity(value, v.unit)
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {best.ties.length > 0 ? (
        <p className="text-sm text-ink-muted">
          Empata con los {trialsText(best.ties)}
        </p>
      ) : null}
    </div>
  );
}

function VariablePicker({
  label,
  value,
  variables,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly variables: readonly Variable[];
  readonly onChange: (id: number) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-1 lg:w-auto lg:min-w-48">
      <span className="text-xs text-ink-muted">{label}</span>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger aria-label={label} className="max-lg:w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {variables.map((v) => (
            <SelectItem key={v.id} value={String(v.id)}>
              {variableLabel(v)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DirectionPicker({
  value,
  onChange,
}: {
  readonly value: Direction;
  readonly onChange: (dir: Direction) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-1 lg:w-auto lg:min-w-48">
      <span className="text-xs text-ink-muted">Criterio</span>
      <Select
        value={value}
        onValueChange={(v) => onChange(v === "min" ? "min" : "max")}
      >
        <SelectTrigger aria-label="Criterio" className="max-lg:w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="max">Más alto es mejor</SelectItem>
          <SelectItem value="min">Más bajo es mejor</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function LoadError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <EmptyState
      icon={CloudOffIcon}
      headingLevel="h2"
      title="No pudimos cargar los resultados"
      description="Revisa tu conexión y vuelve a intentar."
      action={
        <Button variant="secondary" onClick={onRetry}>
          <RotateCwIcon aria-hidden />
          Reintentar
        </Button>
      }
    />
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-10">
      <p role="status" className="sr-only">
        Cargando resultados…
      </p>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-2/3 max-w-md" />
      </div>
      <Skeleton className="h-[360px] w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export { ResultsSkeleton, ResultsView };
