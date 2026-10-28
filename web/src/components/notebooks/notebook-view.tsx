"use client";

import {
  ArrowLeftIcon,
  CloudOffIcon,
  FileQuestionIcon,
  RotateCwIcon,
  TableIcon,
  VariableIcon,
} from "lucide-react";
import Link from "next/link";

import type { ExperimentDetail } from "@/api/experiments";
import { PageHeader } from "@/components/app-shell/page-header";
import { PanelHeading } from "@/components/app-shell/panel-heading";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useExperiment } from "@/hooks/use-experiments";
import { useNow } from "@/hooks/use-now";
import { formatRange } from "@/lib/format";
import { formatShortDate } from "@/lib/relative-time";

// A route segment that can name a notebook; anything else is "no existe"
// without asking the API (AC-11).
export const parseNotebookId = (raw: string): number | null => {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
};

// /cuadernos/{id} (spec 0005, AC-10, AC-11).
function NotebookView({ rawId }: { readonly rawId: string }) {
  const id = parseNotebookId(rawId);
  const query = useExperiment(id);

  if (id === null || query.error?.kind === "not_found") return <NotFound />;
  if (query.data) return <Notebook experiment={query.data} />;
  if (query.isError) {
    return (
      <EmptyState
        icon={CloudOffIcon}
        headingLevel="h1"
        title="No pudimos cargar este cuaderno"
        description="Revisa tu conexión y vuelve a intentar."
        action={
          <Button size="lg" onClick={() => void query.refetch()}>
            <RotateCwIcon aria-hidden />
            Reintentar
          </Button>
        }
      />
    );
  }
  return <NotebookSkeleton />;
}

function BackLink() {
  return (
    <Link
      href="/cuadernos"
      className="-ml-2 inline-flex h-10 w-fit items-center gap-1.5 rounded-control px-2 text-sm text-ink-muted focus-ring transition-colors hover:bg-sunken hover:text-ink"
    >
      <ArrowLeftIcon aria-hidden className="size-4" />
      Mis cuadernos
    </Link>
  );
}

function Notebook({ experiment }: { readonly experiment: ExperimentDetail }) {
  const now = useNow();
  const created = new Date(experiment.created_at);
  const variables = experiment.variables;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <BackLink />
        <PageHeader
          title={experiment.title}
          description={
            <div className="flex flex-col gap-3">
              {experiment.goal ? (
                <p className="text-base whitespace-pre-line text-ink">
                  {experiment.goal}
                </p>
              ) : null}
              <p>
                Creado por {experiment.created_by} ·{" "}
                <time dateTime={experiment.created_at}>
                  {formatShortDate(created, now)}
                </time>{" "}
                · {experiment.status === "closed" ? "Cerrado" : "Abierto"}
              </p>
            </div>
          }
        />
      </div>

      <section aria-labelledby="variables" className="flex flex-col gap-2">
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

      <section aria-labelledby="ensayos" className="flex flex-col gap-2">
        <PanelHeading id="ensayos" icon={TableIcon} title="Ensayos" />
        <EmptyState
          icon={TableIcon}
          headingLevel="h3"
          title="Aún no hay ensayos"
          description="Cuando confirmes tu primera medición, aparecerá aquí como una fila de la tabla."
        />
      </section>
    </div>
  );
}

function NotebookSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-10">
      <p role="status" className="sr-only">
        Cargando cuaderno…
      </p>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-1/2 max-w-sm" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-28" />
        {[0, 1, 2].map((row) => (
          <Skeleton
            key={row}
            data-testid="skeleton-row"
            className="h-10 w-full"
          />
        ))}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <EmptyState
      icon={FileQuestionIcon}
      headingLevel="h1"
      title="Este cuaderno no existe"
      description="Puede que el enlace esté mal escrito o que el cuaderno ya no esté."
      action={
        <Button asChild variant="secondary">
          <Link href="/cuadernos">Ver mis cuadernos</Link>
        </Button>
      }
    />
  );
}

export { NotebookView };
