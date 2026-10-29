"use client";

import {
  ChevronRightIcon,
  DownloadIcon,
  HistoryIcon,
  ListChecksIcon,
  ScanSearchIcon,
  TableIcon,
  VariableIcon,
  type LucideIcon,
} from "lucide-react";
import type * as React from "react";

import type { ExperimentDetail } from "@/api/experiments";
import { PanelHeading } from "@/components/app-shell/panel-heading";
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
import { formatNumber, formatRange } from "@/lib/format";
import { formatShortDate } from "@/lib/relative-time";

// The notebook as a CSV: one column per variable, one row per saved trial.
// Trials arrive with feature 7, so today it holds the header row.
export function downloadNotebookCsv(experiment: ExperimentDetail): void {
  const text = trialsCsv(experiment.variables, []);
  // The BOM makes Excel read the accents and units as UTF-8.
  const blob = new Blob(["﻿", text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFileName(experiment.title);
  link.click();
  URL.revokeObjectURL(url);
}

type NotebookInspectorProps = {
  readonly experiment: ExperimentDetail;
  // From the notebooks list cache; undefined until it loads.
  readonly trialCount: number | undefined;
};

// "Inspector activo" (from the Stitch reference): a summary of the open
// notebook, its latest measurements, the trials table, its variables, and
// shortcuts. Every number comes from the API; nothing is estimated.
function NotebookInspector({ experiment, trialCount }: NotebookInspectorProps) {
  const now = useNow();
  const variables = experiment.variables;
  const required = variables.filter((variable) => variable.required).length;

  return (
    <aside
      id="inspector"
      aria-labelledby="inspector-title"
      className="flex min-w-0 scroll-mt-20 flex-col gap-8 lg:border-l lg:border-line lg:pl-8"
    >
      <div className="flex items-center justify-between gap-2">
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

      <section aria-labelledby="resumen" className="flex flex-col">
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

      <section aria-labelledby="recientes" className="flex flex-col gap-2">
        <PanelHeading
          id="recientes"
          icon={HistoryIcon}
          title="Mediciones recientes"
        />
        <p className="rounded-control bg-sunken px-3 py-3 text-sm text-ink-muted">
          Aún no hay mediciones. Las últimas que confirmes aparecerán aquí.
        </p>
      </section>

      <section
        id="tabla"
        aria-labelledby="ensayos"
        className="flex scroll-mt-20 flex-col gap-2"
      >
        <PanelHeading id="ensayos" icon={TableIcon} title="Ensayos" />
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
          </Table>
        </div>
        <p className="px-1 py-3 text-sm text-ink-muted">
          <span className="font-medium text-ink">Aún no hay ensayos</span>. Cada
          medición que confirmes será una fila.
        </p>
      </section>

      <section
        id="lista-variables"
        aria-labelledby="variables"
        className="flex scroll-mt-20 flex-col gap-2"
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
        <h3 id="acciones" className="text-sm font-medium text-ink">
          Acciones rápidas
        </h3>
        <ul className="flex flex-col gap-1.5">
          <li>
            <QuickAction
              href="#tabla"
              icon={TableIcon}
              label="Tabla completa"
            />
          </li>
          <li>
            <QuickAction
              href="#lista-variables"
              icon={ListChecksIcon}
              label="Revisar variables"
            />
          </li>
          <li>
            <QuickAction
              icon={DownloadIcon}
              label="Exportar CSV"
              onClick={() => downloadNotebookCsv(experiment)}
            />
          </li>
        </ul>
      </section>
    </aside>
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

const quickActionClass =
  "flex h-11 w-full items-center gap-3 rounded-control border border-line bg-surface px-3 text-left text-sm text-ink shadow-control focus-ring transition-colors hover:bg-sunken";

function QuickAction({
  icon: Icon,
  label,
  href,
  onClick,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly href?: string;
  readonly onClick?: () => void;
}) {
  const content = (
    <>
      <Icon aria-hidden className="size-4 shrink-0 text-brand" />
      <span className="flex-1">{label}</span>
      <ChevronRightIcon aria-hidden className="size-4 text-ink-muted" />
    </>
  );
  return href ? (
    <a href={href} className={quickActionClass}>
      {content}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={quickActionClass}>
      {content}
    </button>
  );
}

export { NotebookInspector };
export type { NotebookInspectorProps };
