"use client";

import {
  BookOpenIcon,
  ChevronRightIcon,
  CloudOffIcon,
  PlusIcon,
  RotateCwIcon,
} from "lucide-react";
import Link from "next/link";

import type { ExperimentSummary } from "@/api/experiments";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useExperiments } from "@/hooks/use-experiments";
import { useNow } from "@/hooks/use-now";
import { formatNumber } from "@/lib/format";
import { formatRelative } from "@/lib/relative-time";

const NEW_PATH = "/cuadernos/nuevo";

export const trialCountText = (count: number): string => {
  if (count === 0) return "sin ensayos";
  return count === 1 ? "1 ensayo" : `${formatNumber(count)} ensayos`;
};

function NewNotebookButton({
  variant = "primary",
}: {
  readonly variant?: "primary" | "secondary";
}) {
  return (
    <Button asChild variant={variant}>
      <Link href={NEW_PATH}>
        <PlusIcon aria-hidden />
        Nuevo cuaderno
      </Link>
    </Button>
  );
}

// /cuadernos (spec 0005, AC-1, AC-2). The order comes from the API; the
// browser never resorts.
function NotebookList() {
  const query = useExperiments();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Mis cuadernos"
        description="Cada cuaderno guarda sus variables y cada ensayo que confirmes."
        actions={<NewNotebookButton />}
      />
      <ListBody
        notebooks={query.data}
        failed={query.isError}
        onRetry={() => void query.refetch()}
      />
    </div>
  );
}

function ListBody({
  notebooks,
  failed,
  onRetry,
}: {
  readonly notebooks: readonly ExperimentSummary[] | undefined;
  readonly failed: boolean;
  readonly onRetry: () => void;
}) {
  // Data already shown wins over a failed background refetch (AC-2).
  if (notebooks !== undefined) {
    return notebooks.length > 0 ? (
      <ul aria-label="Cuadernos" className="flex flex-col border-t border-line">
        {notebooks.map((notebook) => (
          <NotebookRow key={notebook.id} notebook={notebook} />
        ))}
      </ul>
    ) : (
      <EmptyState
        icon={BookOpenIcon}
        title="Crea tu primer cuaderno"
        description="Un cuaderno guarda las variables que vas a medir y cada ensayo que confirmes."
        action={<NewNotebookButton />}
      />
    );
  }
  if (failed) {
    return (
      <EmptyState
        icon={CloudOffIcon}
        title="No pudimos cargar tus cuadernos"
        description="Revisa tu conexión y vuelve a intentar."
        action={
          <Button size="lg" onClick={onRetry}>
            <RotateCwIcon aria-hidden />
            Reintentar
          </Button>
        }
      />
    );
  }
  return (
    <div aria-busy className="flex flex-col border-t border-line">
      <p role="status" className="sr-only">
        Cargando cuadernos…
      </p>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          data-testid="skeleton-row"
          className="flex flex-col gap-2 border-b border-line px-3 py-4"
        >
          <Skeleton className="h-4 w-1/2 max-w-xs" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

function NotebookRow({ notebook }: { readonly notebook: ExperimentSummary }) {
  const now = useNow();
  const activity = new Date(notebook.last_activity_at);

  return (
    <li className="border-b border-line py-1">
      <Link
        href={`/cuadernos/${notebook.id}`}
        className="flex min-h-14 items-center gap-4 rounded-control px-3 py-2 focus-ring transition-colors hover:bg-sunken"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium text-ink">
            {notebook.title}
          </span>
          <span className="text-sm text-ink-muted">
            <time dateTime={notebook.last_activity_at}>
              {formatRelative(activity, now)}
            </time>{" "}
            · {trialCountText(notebook.trial_count)}
          </span>
        </span>
        {notebook.status === "closed" ? <Badge>Cerrado</Badge> : null}
        <ChevronRightIcon
          aria-hidden
          className="size-4 shrink-0 text-ink-muted"
        />
      </Link>
    </li>
  );
}

export { NotebookList, NotebookRow };
