"use client";

import {
  ChevronRightIcon,
  CloudOffIcon,
  FileQuestionIcon,
  MessagesSquareIcon,
  RotateCwIcon,
  TableIcon,
  VariableIcon,
} from "lucide-react";
import Link from "next/link";

import type { ExperimentDetail } from "@/api/experiments";
import { PageHeader } from "@/components/app-shell/page-header";
import { PanelHeading } from "@/components/app-shell/panel-heading";
import { Badge } from "@/components/ui/badge";
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
    <nav aria-label="Ruta" className="flex items-center gap-1 text-sm">
      <Link
        href="/cuadernos"
        className="-ml-2 inline-flex h-9 items-center rounded-control px-2 text-ink-muted focus-ring transition-colors hover:bg-sunken hover:text-ink"
      >
        Mis cuadernos
      </Link>
      <ChevronRightIcon aria-hidden className="size-4 text-ink-muted" />
    </nav>
  );
}

// The notebook workspace (2026-10-28 redesign): the conversation column on the
// left and a data panel on the right with the trials table and the variables.
// The conversation stays empty until text capture (feature 6) lands.
function Notebook({ experiment }: { readonly experiment: ExperimentDetail }) {
  const now = useNow();
  const created = new Date(experiment.created_at);
  const variables = experiment.variables;
  const closed = experiment.status === "closed";

  return (
    <div className="flex flex-1 flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-0">
      <div className="flex min-w-0 flex-col gap-8 lg:pr-10">
        <div className="flex flex-col gap-2 border-b border-line pb-6">
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
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={closed ? "neutral" : "saved"}>
                    {closed ? "Cerrado" : "Abierto"}
                  </Badge>
                  <p>
                    Creado por {experiment.created_by} ·{" "}
                    <time dateTime={experiment.created_at}>
                      {formatShortDate(created, now)}
                    </time>
                  </p>
                </div>
              </div>
            }
          />
        </div>

        <EmptyState
          icon={MessagesSquareIcon}
          title="Aquí verás cada medición"
          description="Dicta o escribe un ensayo y LabFlow te mostrará lo que entendió antes de guardarlo."
          className="flex-1 justify-center"
        />
      </div>

      <aside
        aria-label="Datos del cuaderno"
        className="flex min-w-0 flex-col gap-8 lg:border-l lg:border-line lg:pl-8"
      >
        <section aria-labelledby="ensayos" className="flex flex-col gap-2">
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
            <span className="font-medium text-ink">Aún no hay ensayos</span>.
            Cada medición que confirmes será una fila.
          </p>
        </section>

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
      </aside>
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

export { NotebookSkeleton, NotebookView };
