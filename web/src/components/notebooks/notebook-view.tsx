"use client";

import {
  ChartColumnIcon,
  ChevronRightIcon,
  CloudOffIcon,
  DownloadIcon,
  EllipsisIcon,
  FileQuestionIcon,
  MessagesSquareIcon,
  RotateCwIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { experimentKeys, type ExperimentDetail } from "@/api/experiments";
import { CaptureStage } from "@/components/capture-stage/capture-stage";
import { VoiceConversation } from "@/components/voice/voice-conversation";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useExperiment,
  useExperiments,
  useTrials,
} from "@/hooks/use-experiments";
import { usePendingProposal } from "@/hooks/use-capture";
import { tableRows } from "@/lib/trials";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";
import { protocolLabel } from "@/lib/instructions";
import { formatShortDate } from "@/lib/relative-time";

import {
  downloadNotebookCsv,
  NotebookInspector,
  type TrialsPanel,
} from "./notebook-inspector";
import { NotebookTabs, PHONE_VIEW, useVista } from "./notebook-tabs";

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
    <nav
      aria-label="Ruta"
      className="hidden items-center gap-1 text-sm lg:flex"
    >
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
// The conversation column holds typed capture (feature 6): a sentence in, the
// confirm card out. A save refreshes the notebook list's trial count.
function Notebook({ experiment }: { readonly experiment: ExperimentDetail }) {
  const now = useNow();
  const queryClient = useQueryClient();
  const created = new Date(experiment.created_at);
  const closed = experiment.status === "closed";
  const trialCount = useExperiments().data?.find(
    (notebook) => notebook.id === experiment.id,
  )?.trial_count;
  const trialsQuery = useTrials(experiment.id);
  const trials: TrialsPanel = trialsQuery.data
    ? { kind: "ready", view: trialsQuery.data }
    : trialsQuery.isError
      ? { kind: "error", onRetry: () => void trialsQuery.refetch() }
      : { kind: "loading" };
  const ready = trials.kind === "ready";
  const exportCsv = () => {
    if (trialsQuery.data)
      downloadNotebookCsv(
        experiment,
        tableRows(experiment.variables, trialsQuery.data.trials),
      );
  };
  const [vista, setVista] = useVista();
  const pending = Boolean(usePendingProposal(experiment.id).data);
  const resultsHref = `/cuadernos/${experiment.id}/resultados`;
  // The goal, the context, and who made it: under the title on desktop, in
  // the Más sheet on the phone (two copies, so each takes its heading id).
  const details = (headingId: string) => (
    <div className="flex flex-col gap-3">
      {experiment.goal ? (
        <p className="text-base whitespace-pre-line text-ink">
          {experiment.goal}
        </p>
      ) : null}
      {experiment.context ? (
        <section
          aria-labelledby={headingId}
          className="flex flex-col gap-1 border-l-2 border-line pl-3"
        >
          <h2 id={headingId} className="text-xs text-ink-muted">
            Contexto
          </h2>
          <p className="text-sm whitespace-pre-line text-ink">
            {experiment.context}
          </p>
        </section>
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
          {experiment.protocol
            ? ` · ${protocolLabel(experiment.protocol)}`
            : null}
        </p>
      </div>
    </div>
  );

  return (
    <div
      data-vista={vista}
      className="group/nb flex flex-1 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-0"
    >
      <div className="flex min-w-0 flex-col gap-6 lg:gap-8 lg:pr-10">
        <div className="flex flex-col gap-2 border-b border-line pb-4 lg:pb-6">
          <BackLink />
          <PageHeader
            title={experiment.title}
            titleClassName="max-lg:line-clamp-2"
            descriptionClassName="max-lg:hidden"
            actionsClassName="max-lg:hidden"
            actions={
              <>
                <Button
                  variant="secondary"
                  aria-disabled={!ready || undefined}
                  onClick={exportCsv}
                >
                  <DownloadIcon aria-hidden />
                  Exportar datos
                </Button>
                <Button asChild>
                  <Link href={resultsHref}>
                    <ChartColumnIcon aria-hidden />
                    Ver resultados
                  </Link>
                </Button>
              </>
            }
            description={details("contexto-titulo")}
          />
          {/* The phone's compact header (spec 0010, AC-2): the badge, and Más
              for the goal, the context, and the two header actions. */}
          <div className="flex items-center justify-between gap-2 lg:hidden">
            <Badge variant={closed ? "neutral" : "saved"}>
              {closed ? "Cerrado" : "Abierto"}
            </Badge>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon-lg" aria-label="Más">
                  <EllipsisIcon aria-hidden />
                </Button>
              </DialogTrigger>
              <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto]">
                <DialogHeader>
                  <DialogTitle>{experiment.title}</DialogTitle>
                  <DialogDescription>Objetivo y contexto</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 overflow-y-auto text-sm text-ink-muted">
                  {details("contexto-titulo-mas")}
                </div>
                <DialogFooter>
                  <Button
                    variant="secondary"
                    size="lg"
                    aria-disabled={!ready || undefined}
                    onClick={exportCsv}
                  >
                    <DownloadIcon aria-hidden />
                    Exportar datos
                  </Button>
                  <Button asChild size="lg">
                    <Link href={resultsHref}>
                      <ChartColumnIcon aria-hidden />
                      Ver resultados
                    </Link>
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <NotebookTabs vista={vista} onChange={setVista} pending={pending} />

        {closed ? (
          <EmptyState
            icon={MessagesSquareIcon}
            title="Este cuaderno está cerrado"
            description="Ya no recibe mediciones nuevas."
            className={cn("flex-1 justify-center", PHONE_VIEW.capturar)}
          />
        ) : (
          <section
            aria-label="Registrar una medición"
            className={cn("flex flex-col gap-3", PHONE_VIEW.capturar)}
          >
            <p className="text-sm text-ink-muted">
              Dicta o escribe un ensayo. Si LabFlow lo entendió sin dudas, lo
              guarda y puedes deshacerlo; si algo no cuadra, te pregunta.
            </p>
            <VoiceConversation
              experimentId={experiment.id}
              variant="inline"
              fallbackInputId="capture-text"
            />
            <CaptureStage
              experimentId={experiment.id}
              onSaved={() =>
                void queryClient.invalidateQueries({
                  queryKey: experimentKeys.all,
                })
              }
              onUndone={() =>
                void queryClient.invalidateQueries({
                  queryKey: experimentKeys.all,
                })
              }
            />
          </section>
        )}
      </div>

      <NotebookInspector
        experiment={experiment}
        trialCount={trialCount}
        trials={trials}
      />
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

export { NotFound as NotebookNotFound, NotebookSkeleton, NotebookView };
