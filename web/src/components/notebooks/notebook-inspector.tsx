"use client";

import {
  ChartColumnIcon,
  ChevronRightIcon,
  DownloadIcon,
  HistoryIcon,
  ListChecksIcon,
  ScanSearchIcon,
  TableIcon,
  VariableIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";

import type { ExperimentDetail, TrialsView } from "@/api/experiments";
import { PanelHeading } from "@/components/app-shell/panel-heading";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNow } from "@/hooks/use-now";
import { csvFileName, trialsCsv } from "@/lib/csv";
import { formatNumber, formatQuantity, formatRange } from "@/lib/format";
import { formatShortDate } from "@/lib/relative-time";
import {
  csvRows,
  recentLines,
  tableRows,
  type TrialTableRow,
} from "@/lib/trials";
import { cn } from "@/lib/utils";
import { savedValues } from "@/lib/variable-form";

import { PHONE_VIEW, PHONE_VIEW_BLOCK } from "./notebook-tabs";
import { VariablesDialog } from "./variables-dialog";

// The notebook as a CSV: one column per variable, one row per saved trial, the
// same rows the table shows (spec 0007, AC-6).
export function downloadNotebookCsv(
  experiment: ExperimentDetail,
  rows: readonly TrialTableRow[],
): void {
  const text = trialsCsv(experiment.variables, csvRows(rows));
  // The BOM makes Excel read the accents and units as UTF-8.
  const blob = new Blob(["﻿", text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFileName(experiment.title);
  link.click();
  URL.revokeObjectURL(url);
}

// The saved trials as the panel needs them (spec 0007): read by NotebookView
// through useTrials, so this component stays presentational.
export type TrialsPanel =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly onRetry: () => void }
  | { readonly kind: "ready"; readonly view: TrialsView };

type NotebookInspectorProps = {
  readonly experiment: ExperimentDetail;
  // From the notebooks list cache; undefined until it loads.
  readonly trialCount: number | undefined;
  readonly trials: TrialsPanel;
};

// "Inspector activo" (from the Stitch reference): a summary of the open
// notebook, its latest measurements, the trials table, its variables, and
// shortcuts. Every number comes from the API; nothing is estimated. On the
// phone its parts split between the Ensayos and Variables views (spec 0010,
// AC-2); each still mounts once.
function NotebookInspector({
  experiment,
  trialCount,
  trials,
}: NotebookInspectorProps) {
  const now = useNow();
  const variables = experiment.variables;
  const required = variables.filter((variable) => variable.required).length;
  const rows =
    trials.kind === "ready" ? tableRows(variables, trials.view.trials) : [];
  const recent =
    trials.kind === "ready" ? recentLines(variables, trials.view.recent) : [];

  return (
    <aside
      id="inspector"
      aria-labelledby="inspector-title"
      className="flex min-w-0 scroll-mt-20 flex-col gap-8 max-lg:group-data-[vista=capturar]/nb:hidden lg:border-l lg:border-line lg:pl-8"
    >
      <div className="flex items-center justify-between gap-2 max-lg:hidden">
        <h2
          id="inspector-title"
          className="flex items-center gap-2 text-sm font-semibold text-ink"
        >
          <ScanSearchIcon aria-hidden className="size-4 text-brand" />
          Inspector activo
        </h2>
        <span className="rounded-md bg-sunken px-2 py-0.5 font-mono text-xs text-ink-muted">
          #{experiment.id}
        </span>
      </div>

      <section
        aria-labelledby="resumen"
        className={cn("flex flex-col", PHONE_VIEW.ensayos)}
      >
        <h3 id="resumen" className="pb-1 text-sm font-medium text-ink">
          Resumen
        </h3>
        <dl className="flex flex-col">
          <SummaryRow label="Ensayos guardados">
            {trialCount === undefined ? "—" : formatNumber(trialCount)}
          </SummaryRow>
          <SummaryRow label="Variables">
            {formatNumber(variables.length)}
            {required > 0 ? (
              <span className="text-ink-muted">
                {" "}
                · {formatNumber(required)} requeridas
              </span>
            ) : null}
          </SummaryRow>
          <SummaryRow label="Creado">
            <time dateTime={experiment.created_at} className="font-sans">
              {formatShortDate(new Date(experiment.created_at), now)}
            </time>
          </SummaryRow>
        </dl>
      </section>

      <section
        aria-labelledby="recientes"
        className={cn("flex flex-col gap-2", PHONE_VIEW.ensayos)}
      >
        <PanelHeading
          id="recientes"
          icon={HistoryIcon}
          title="Mediciones recientes"
        />
        {trials.kind === "loading" ? (
          <Skeleton className="h-10 w-full" />
        ) : trials.kind === "error" ? (
          <p className="px-1 text-sm text-ink-muted">—</p>
        ) : recent.length === 0 ? (
          <p className="rounded-control bg-sunken px-3 py-3 text-sm text-ink-muted">
            Aún no hay mediciones. Las últimas que confirmes aparecerán aquí.
          </p>
        ) : (
          <ul className="flex flex-col">
            {recent.map((line) => (
              <li
                key={line.key}
                className="flex min-h-10 items-center justify-between gap-4 border-b border-line text-sm last:border-b-0"
              >
                <span className="text-ink tabular-nums">{line.text}</span>
                <time
                  dateTime={line.savedAt}
                  className="shrink-0 text-xs text-ink-muted"
                >
                  {formatShortDate(new Date(line.savedAt), now)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="tabla"
        aria-labelledby="ensayos"
        className={cn("flex scroll-mt-20 flex-col gap-2", PHONE_VIEW.ensayos)}
      >
        <PanelHeading id="ensayos" icon={TableIcon} title="Ensayos" />
        <TrialsTable variables={variables} rows={rows} trials={trials} />
      </section>

      <section
        id="lista-variables"
        aria-labelledby="variables"
        className={cn("flex scroll-mt-20 flex-col gap-2", PHONE_VIEW.variables)}
      >
        <PanelHeading
          id="variables"
          icon={VariableIcon}
          title="Variables"
          meta={<span className="tabular-nums">{variables.length}</span>}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Rango</TableHead>
              <TableHead>Tipo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variables.map((variable) => (
              <TableRow key={variable.id}>
                <TableCell className="font-medium text-ink">
                  {variable.name}
                </TableCell>
                <TableCell className="font-mono">
                  {variable.unit ?? "—"}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {formatRange(variable.min_value, variable.max_value)}
                </TableCell>
                <TableCell className="text-ink-muted">
                  {variable.required ? "Requerida" : "Opcional"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section aria-labelledby="acciones" className="flex flex-col gap-2">
        <h3
          id="acciones"
          className="text-sm font-medium text-ink max-lg:sr-only"
        >
          Acciones rápidas
        </h3>
        <ul className="flex flex-col gap-1.5">
          <li className={PHONE_VIEW_BLOCK.ensayos}>
            <Dialog>
              <DialogTrigger className={quickActionClass}>
                <QuickActionContent icon={TableIcon} label="Tabla completa" />
              </DialogTrigger>
              <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] lg:max-h-[85vh] lg:max-w-5xl">
                <DialogHeader>
                  <DialogTitle>Ensayos · {experiment.title}</DialogTitle>
                  <DialogDescription>
                    {trials.kind === "ready"
                      ? `${formatNumber(rows.length)} ${rows.length === 1 ? "ensayo guardado" : "ensayos guardados"}`
                      : "Cargando ensayos…"}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                  <TrialsTable
                    variables={variables}
                    rows={rows}
                    trials={trials}
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="secondary"
                    aria-disabled={trials.kind !== "ready" || undefined}
                    onClick={() => {
                      if (trials.kind === "ready")
                        downloadNotebookCsv(experiment, rows);
                    }}
                  >
                    <DownloadIcon aria-hidden />
                    Exportar CSV
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </li>
          <li className={PHONE_VIEW_BLOCK.variables}>
            <VariablesDialog
              experiment={experiment}
              saved={
                trials.kind === "ready" ? savedValues(trials.view.trials) : null
              }
              triggerClassName={quickActionClass}
            >
              <QuickActionContent
                icon={ListChecksIcon}
                label="Revisar variables"
              />
            </VariablesDialog>
          </li>
          <li className={PHONE_VIEW_BLOCK.ensayos}>
            <QuickAction
              icon={DownloadIcon}
              label={exportLabel(trials)}
              disabled={trials.kind !== "ready"}
              onClick={() => downloadNotebookCsv(experiment, rows)}
            />
          </li>
          {/* The header's Ver resultados is in the phone's Más sheet; the
              Ensayos view repeats it next to the data. */}
          <li className={cn("lg:hidden", PHONE_VIEW_BLOCK.ensayos)}>
            <QuickAction
              icon={ChartColumnIcon}
              label="Ver resultados"
              href={`/cuadernos/${experiment.id}/resultados`}
            />
          </li>
        </ul>
      </section>
    </aside>
  );
}

// The trials table and its states, shared by the panel and the "Tabla
// completa" dialog so both always show the same rows (spec 0007, AC-2, AC-8).
function TrialsTable({
  variables,
  rows,
  trials,
}: {
  readonly variables: ExperimentDetail["variables"];
  readonly rows: readonly TrialTableRow[];
  readonly trials: TrialsPanel;
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              {variables.map((variable) => (
                <TableHead key={variable.id} className="text-right">
                  {variable.name}
                  {variable.unit ? (
                    <span className="font-mono"> ({variable.unit})</span>
                  ) : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {trials.kind === "loading" ? (
            <TableBody aria-busy="true">
              {[0, 1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={variables.length + 1}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          ) : rows.length > 0 ? (
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-ink tabular-nums">
                    {formatNumber(row.number)}
                  </TableCell>
                  {row.values.map((value, i) => (
                    <TableCell
                      key={variables[i]?.id ?? i}
                      className="text-right font-mono text-ink tabular-nums"
                    >
                      {value === null ? (
                        <>
                          <span aria-hidden className="text-ink-muted">
                            —
                          </span>
                          <span className="sr-only">
                            {variables[i]?.name} sin valor
                          </span>
                        </>
                      ) : (
                        formatQuantity(value, null)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          ) : null}
        </Table>
      </div>
      {trials.kind === "error" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-2">
          <p role="alert" className="text-sm text-ink">
            No pudimos cargar los ensayos
          </p>
          <Button variant="secondary" onClick={trials.onRetry}>
            Reintentar
          </Button>
        </div>
      ) : trials.kind === "ready" && rows.length === 0 ? (
        <p className="px-1 py-3 text-sm text-ink-muted">
          <span className="font-medium text-ink">Aún no hay ensayos</span>. Cada
          medición que confirmes será una fila.
        </p>
      ) : null}
    </>
  );
}

function SummaryRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 border-b border-line text-sm last:border-b-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-mono text-ink tabular-nums">{children}</dd>
    </div>
  );
}

// The export waits for the rows, so it never downloads a partial table (AC-6).
export const exportLabel = (trials: TrialsPanel): string =>
  trials.kind === "loading"
    ? "Exportar CSV (cargando…)"
    : trials.kind === "error"
      ? "Exportar CSV (no disponible)"
      : "Exportar CSV";

const quickActionClass =
  "flex h-11 w-full items-center gap-3 rounded-control border border-line bg-surface px-3 text-left text-sm text-ink shadow-control focus-ring transition-colors hover:bg-sunken";

function QuickActionContent({
  icon: Icon,
  label,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
}) {
  return (
    <>
      <Icon aria-hidden className="size-4 shrink-0 text-brand" />
      <span className="flex-1">{label}</span>
      <ChevronRightIcon aria-hidden className="size-4 text-ink-muted" />
    </>
  );
}

function QuickAction({
  icon: Icon,
  label,
  href,
  onClick,
  disabled = false,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly href?: string;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
}) {
  const content = <QuickActionContent icon={Icon} label={label} />;
  return href ? (
    <Link href={href} className={quickActionClass}>
      {content}
    </Link>
  ) : (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      className={cn(quickActionClass, disabled && "opacity-50")}
    >
      {content}
    </button>
  );
}

export { NotebookInspector };
export type { NotebookInspectorProps };
