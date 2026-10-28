import { BookOpenIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/app-shell/page-header";
import { PanelHeading } from "@/components/app-shell/panel-heading";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

import { ApiStatus } from "./api-status";

const STEPS = [
  {
    title: "Dicta",
    text: "Di la medición en voz alta o escríbela, como en tu libreta.",
  },
  {
    title: "Confirma",
    text: "Revisa lo que LabFlow entendió. Nada se guarda sin tu sí.",
  },
  {
    title: "Analiza",
    text: "Obtén la tabla, el gráfico y respuestas sin números inventados.",
  },
] as const;

export default function Home() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        title="Tu cuaderno de laboratorio"
        description="Dicta una medición, confirma lo que LabFlow entendió y obtén una tabla y un gráfico al momento."
        actions={<ApiStatus />}
      />

      <section aria-labelledby="cuadernos" className="flex flex-col gap-2">
        <PanelHeading
          id="cuadernos"
          icon={BookOpenIcon}
          title="Cuadernos"
          meta={
            <Link
              href="/cuadernos"
              className="inline-flex h-10 items-center gap-1 rounded-control px-2 text-sm text-ink-muted focus-ring transition-colors hover:bg-sunken hover:text-ink"
            >
              Mis cuadernos
              <ChevronRightIcon aria-hidden className="size-4" />
            </Link>
          }
        />
        <EmptyState
          icon={BookOpenIcon}
          title="Empieza un cuaderno"
          description="Elige las variables que vas a medir. Después solo dictas o escribes cada ensayo y LabFlow arma la tabla."
          headingLevel="h3"
          action={
            <Button asChild>
              <Link href="/cuadernos/nuevo">
                <PlusIcon aria-hidden />
                Nuevo cuaderno
              </Link>
            </Button>
          }
        />
      </section>

      <section aria-labelledby="como-funciona" className="flex flex-col gap-4">
        <h2 id="como-funciona" className="text-sm font-medium text-ink">
          Cómo funciona
        </h2>
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map(({ title, text }, index) => (
            <li
              key={title}
              className="flex flex-col gap-1 border-t border-line pt-4"
            >
              <span className="font-mono text-xs text-ink-muted tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-medium text-ink">{title}</h3>
              <p className="text-sm text-ink-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
