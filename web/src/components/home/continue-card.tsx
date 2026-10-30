"use client";

import { ChartColumnIcon, MicIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveNotebook } from "@/hooks/use-active-notebook";
import { useExperiments } from "@/hooks/use-experiments";
import { useNow } from "@/hooks/use-now";
import { formatRelative } from "@/lib/relative-time";

const trialsLabel = (count: number): string =>
  count === 1 ? "1 ensayo" : `${count} ensayos`;

// The lab dashboard's first card (2026-10-30): the notebook you were dictating
// into, one tap from its mic. The mic itself lives on the notebook page.
function ContinueCard() {
  const query = useExperiments();
  const active = useActiveNotebook();

  if (query.data === undefined && !query.isError) {
    return (
      <div aria-busy className="rounded-card border border-line p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-7 w-2/3" />
        <Skeleton className="mt-4 h-10 w-44" />
      </div>
    );
  }
  if (active === null) {
    return (
      <section
        aria-labelledby="continuar"
        className="flex flex-col items-start gap-3 rounded-card border border-line p-5"
      >
        <h2 id="continuar" className="text-lg font-semibold text-ink">
          Empieza tu primer cuaderno
        </h2>
        <p className="text-sm text-ink-muted">
          Define las variables que vas a medir y dicta cada ensayo; LabFlow arma
          la tabla y el gráfico.
        </p>
        <Button asChild size="lg">
          <Link href="/cuadernos/nuevo">Crear cuaderno</Link>
        </Button>
      </section>
    );
  }

  const closed = active.status === "closed";
  const href = `/cuadernos/${active.id}`;
  return (
    <section
      aria-labelledby="continuar"
      className="relative flex flex-col gap-4 overflow-hidden rounded-card border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-end sm:justify-between lg:p-6"
    >
      {/* A soft green glow from the corner, like the site's hero. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-brand-soft opacity-80 blur-3xl"
      />
      <div className="relative flex min-w-0 flex-col gap-1.5">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <span aria-hidden className="relative flex size-2">
            {closed ? null : (
              <span className="absolute inset-0 rounded-full bg-brand opacity-60 motion-safe:animate-ping" />
            )}
            <span
              className={`relative size-2 rounded-full ${closed ? "bg-control" : "bg-brand"}`}
            />
          </span>
          Continuar
        </p>
        <h2
          id="continuar"
          className="truncate text-xl font-semibold text-ink lg:text-2xl"
        >
          {active.title}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <Badge variant={closed ? "neutral" : "saved"}>
            {closed ? "Cerrado" : "Abierto"}
          </Badge>
          <span>
            {trialsLabel(active.trial_count)} ·{" "}
            <LastActivity at={active.last_activity_at} />
          </span>
        </div>
      </div>
      <div className="relative grid shrink-0 auto-cols-fr grid-flow-col gap-2 sm:flex">
        <Button asChild variant="secondary" size="lg">
          <Link href={`${href}/resultados`}>
            <ChartColumnIcon aria-hidden />
            Resultados
          </Link>
        </Button>
        {closed ? null : (
          <Button asChild size="lg">
            <Link href={href}>
              <MicIcon aria-hidden />
              Seguir dictando
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}

// Read only once the list is here, so the prerendered shell never reads the clock.
function LastActivity({ at }: { readonly at: string }) {
  const now = useNow();
  return <time dateTime={at}>{formatRelative(new Date(at), now)}</time>;
}

export { ContinueCard };
