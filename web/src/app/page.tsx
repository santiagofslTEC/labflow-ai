import { FlaskConicalIcon } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { PanelHeading } from "@/components/app-shell/panel-heading";
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

      <section aria-labelledby="experimentos" className="flex flex-col gap-2">
        <PanelHeading
          id="experimentos"
          icon={FlaskConicalIcon}
          title="Experimentos"
          meta="0"
        />
        <EmptyState
          icon={FlaskConicalIcon}
          title="Aún no hay experimentos"
          description="Cuando dictes tu primera medición, aquí verás cada experimento con su tabla y su gráfico."
          headingLevel="h3"
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
