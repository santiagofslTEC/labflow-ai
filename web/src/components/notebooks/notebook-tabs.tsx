"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

// The notebook's three views on the phone (spec 0010, AC-2). Desktop shows
// them all at once, so every class here is `max-lg:`.
export type Vista = "capturar" | "ensayos" | "variables";

const VISTAS: readonly { readonly value: Vista; readonly label: string }[] = [
  { value: "capturar", label: "Capturar" },
  { value: "ensayos", label: "Ensayos" },
  { value: "variables", label: "Variables" },
];

export const parseVista = (raw: string | null): Vista =>
  raw === "ensayos" || raw === "variables" ? raw : "capturar";

// The URL keeps the view, so reload and back return to it; Capturar is the
// bare URL.
export const vistaQuery = (params: URLSearchParams, vista: Vista): string => {
  const next = new URLSearchParams(params);
  if (vista === "capturar") next.delete("vista");
  else next.set("vista", vista);
  const query = next.toString();
  return query ? `?${query}` : "";
};

export const useVista = (): readonly [Vista, (vista: Vista) => void] => {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const vista = parseVista(params.get("vista"));
  const set = (next: Vista) =>
    router.replace(
      `${pathname}${vistaQuery(new URLSearchParams(params.toString()), next)}`,
      { scroll: false },
    );
  return [vista, set] as const;
};

// Which phone view each part of the page belongs to. The page root carries
// `group/nb` and `data-vista`; a part shows only under its view below 1024px.
// Full class names, so Tailwind sees them.
export const PHONE_VIEW = {
  capturar: "max-lg:hidden max-lg:group-data-[vista=capturar]/nb:flex",
  ensayos: "max-lg:hidden max-lg:group-data-[vista=ensayos]/nb:flex",
  variables: "max-lg:hidden max-lg:group-data-[vista=variables]/nb:flex",
} as const satisfies Record<Vista, string>;

export const PHONE_VIEW_BLOCK = {
  capturar: "max-lg:hidden max-lg:group-data-[vista=capturar]/nb:block",
  ensayos: "max-lg:hidden max-lg:group-data-[vista=ensayos]/nb:block",
  variables: "max-lg:hidden max-lg:group-data-[vista=variables]/nb:block",
} as const satisfies Record<Vista, string>;

// A segmented control under the phone header. When a card waits and another
// view is open, Capturar shows a dot read as "Propuesta pendiente".
function NotebookTabs({
  vista,
  onChange,
  pending,
}: {
  readonly vista: Vista;
  readonly onChange: (vista: Vista) => void;
  readonly pending: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Vistas del cuaderno"
      className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-30 -mx-4 grid grid-cols-3 gap-1 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur-md lg:hidden"
    >
      {VISTAS.map(({ value, label }) => {
        const active = vista === value;
        const dot = value === "capturar" && pending && !active;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(value)}
            className={cn(
              "inline-flex h-11 items-center justify-center gap-1.5 rounded-control text-sm font-medium focus-ring transition-colors",
              active
                ? "bg-ink text-on-ink"
                : "text-ink-muted hover:bg-sunken hover:text-ink",
            )}
          >
            {label}
            {dot ? (
              <>
                {" "}
                <span
                  aria-hidden
                  className="size-2 rounded-full bg-unsaved-border"
                />
                <span className="sr-only">Propuesta pendiente</span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export { NotebookTabs };
