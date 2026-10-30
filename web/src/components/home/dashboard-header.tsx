"use client";

import { useExperiments } from "@/hooks/use-experiments";
import { useNow } from "@/hooks/use-now";

const today = new Intl.DateTimeFormat("es", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

// The dashboard's greeting (2026-10-30, the hilos reference): today's date, a
// large serif title, and a small line drawing of a flask.
function DashboardHeader() {
  // The list loads in the browser, so the date never reads the clock while
  // the page is prerendered.
  const ready = useExperiments().data !== undefined;
  return (
    <header className="relative flex items-end justify-between gap-6">
      <div className="flex flex-col gap-2">
        <p className="min-h-5 text-sm text-ink-muted first-letter:uppercase">
          {ready ? <Today /> : null}
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-balance text-ink lg:text-5xl">
          Tu laboratorio
        </h1>
        <p className="text-sm text-ink-muted lg:text-base">
          Sigue dictando donde lo dejaste o empieza un cuaderno nuevo.
        </p>
      </div>
      <FlaskDrawing className="hidden h-32 w-auto shrink-0 sm:block lg:h-40" />
    </header>
  );
}

function Today() {
  const now = useNow();
  return <time dateTime={now.toISOString()}>{today.format(now)}</time>;
}

// A hand drawn flask with a little green left in it, and two bubbles rising.
function FlaskDrawing({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 160 170"
      aria-hidden
      className={className}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M62 92 L40 138 Q35 150 48 152 L112 152 Q125 150 120 138 L98 92 Z"
        className="fill-tint-green"
      />
      <path
        d="M64 20 L64 70 L28 140 Q20 158 42 160 L118 160 Q140 158 132 140 L96 70 L96 20"
        className="stroke-ink"
        strokeWidth={4}
      />
      <path d="M56 20 L104 20" className="stroke-ink" strokeWidth={4} />
      <path d="M62 92 L98 92" className="stroke-ink" strokeWidth={3} />
      <circle
        cx="74"
        cy="122"
        r="6"
        className="fill-surface stroke-ink"
        strokeWidth={3}
      />
      <circle
        cx="92"
        cy="108"
        r="4"
        className="fill-surface stroke-ink"
        strokeWidth={3}
      />
      <circle
        cx="84"
        cy="62"
        r="3.5"
        className="stroke-brand motion-safe:animate-pulse"
        strokeWidth={3}
      />
      <circle
        cx="76"
        cy="42"
        r="2.5"
        className="stroke-brand"
        strokeWidth={3}
      />
      <path
        d="M118 30 q8 -6 14 0 M124 44 q10 -6 18 0"
        className="stroke-brand"
        strokeWidth={3}
      />
    </svg>
  );
}

export { DashboardHeader };
