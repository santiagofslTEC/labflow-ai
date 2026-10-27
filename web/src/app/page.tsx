import { ChartSplineIcon, CircleCheckIcon, MicIcon } from "lucide-react";

import { PageHeader } from "@/components/app-shell/page-header";
import { formatQuantity } from "@/lib/format";

import { ApiStatus } from "./api-status";

const STEPS = [
  {
    icon: MicIcon,
    title: "Dicta",
    text: "Di la medición en voz alta o escríbela, como en tu libreta.",
    sample: "Ensayo 3, rendimiento 73,5",
  },
  {
    icon: CircleCheckIcon,
    title: "Confirma",
    text: "Revisa lo que LabFlow entendió. Nada se guarda sin tu sí.",
    sample: formatQuantity(73.5, "%"),
  },
  {
    icon: ChartSplineIcon,
    title: "Analiza",
    text: "Obtén la tabla, el gráfico y respuestas sin números inventados.",
    sample: "5 ensayos",
  },
] as const;

export default function Home() {
  return (
    <div className="flex flex-col gap-10 lg:gap-14">
      <PageHeader
        eyebrow="LabFlow AI"
        title="Tu cuaderno de laboratorio"
        description="Dicta una medición, confirma lo que LabFlow entendió y obtén una tabla y un gráfico al momento."
        actions={<ApiStatus />}
      />

      <section aria-labelledby="como-funciona">
        <h2
          id="como-funciona"
          className="mb-4 text-label font-semibold text-ink-muted uppercase"
        >
          Cómo funciona
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text, sample }, index) => (
            <li
              key={title}
              className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-card"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-full bg-sunken text-ink">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="font-mono text-sm text-ink-muted tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="font-serif text-title font-normal text-ink">
                  {title}
                </h3>
                <p className="text-sm text-ink-muted">{text}</p>
              </div>
              <p className="mt-auto truncate rounded-control bg-sunken px-3 py-2 font-mono text-sm text-ink tabular-nums">
                {sample}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
