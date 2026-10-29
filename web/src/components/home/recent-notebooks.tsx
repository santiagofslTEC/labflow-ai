"use client";

import { ChevronRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import { NotebookRow } from "@/components/notebooks/notebook-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useExperiments } from "@/hooks/use-experiments";

const HOME_LIMIT = 3;

// The 3 notebooks with the newest activity under the home mic (Notion AI's
// "recent chats"), from the same cached list as the sidebar.
function RecentNotebooks() {
  const query = useExperiments();
  const notebooks = query.data;

  return (
    <section aria-labelledby="recientes" className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="recientes"
          className="text-sm font-medium whitespace-nowrap text-ink-muted"
        >
          Cuadernos recientes
        </h2>
        <div className="flex items-center gap-1">
          {/* On phones the drawer's "Ver todos" covers this link. */}
          <Link
            href="/cuadernos"
            className="hidden h-9 items-center gap-1 rounded-control px-2 text-sm whitespace-nowrap text-ink-muted focus-ring transition-colors hover:bg-sunken hover:text-ink sm:inline-flex"
          >
            Mis cuadernos
            <ChevronRightIcon aria-hidden className="size-4" />
          </Link>
          <Button asChild variant="secondary" className="h-9 px-3">
            <Link href="/cuadernos/nuevo">
              <PlusIcon aria-hidden />
              Nuevo cuaderno
            </Link>
          </Button>
        </div>
      </div>

      {notebooks === undefined && !query.isError ? (
        <div aria-busy className="flex flex-col border-t border-line">
          <p role="status" className="sr-only">
            Cargando cuadernos…
          </p>
          {[0, 1, 2].map((row) => (
            <div key={row} className="border-b border-line px-3 py-4">
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : null}

      {query.isError && notebooks === undefined ? (
        <p className="border-t border-line px-3 py-4 text-sm text-ink-muted">
          No pudimos cargar tus cuadernos.
        </p>
      ) : null}

      {notebooks?.length === 0 ? (
        <p className="border-t border-line px-3 py-4 text-sm text-ink-muted">
          Aún no hay cuadernos. Crea uno con las variables que vas a medir.
        </p>
      ) : null}

      {notebooks !== undefined && notebooks.length > 0 ? (
        <ul
          aria-label="Cuadernos recientes"
          className="flex flex-col border-t border-line"
        >
          {notebooks.slice(0, HOME_LIMIT).map((notebook) => (
            <NotebookRow key={notebook.id} notebook={notebook} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export { RecentNotebooks };
