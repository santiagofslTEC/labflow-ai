"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenIcon,
  ChevronRightIcon,
  FolderIcon,
  MoveIcon,
  PlusIcon,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import type * as React from "react";
import { toast } from "sonner";

import {
  experimentKeys,
  folderKeys,
  moveNotebook,
  type ExperimentSummary,
  type FolderSummary,
} from "@/api/experiments";
import { FolderNameDialog } from "@/components/folders/folder-name-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateFolder,
  useExperiments,
  useFolders,
} from "@/hooks/use-experiments";
import { useNow } from "@/hooks/use-now";
import { folderFailure, notebooksLabel } from "@/lib/folders";
import { spring } from "@/lib/motion";
import { formatRelative } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

const trialsLabel = (count: number): string =>
  count === 0 ? "sin ensayos" : count === 1 ? "1 ensayo" : `${count} ensayos`;

// The drag payload: a notebook id, under a type only LabFlow writes.
const DRAG_TYPE = "application/x-labflow-notebook";

// One accent per folder, from the chart tokens, so classes tell apart at a glance.
const ACCENTS = [
  "text-chart-1",
  "text-chart-3",
  "text-chart-2",
  "text-chart-4",
] as const;
const accentFor = (id: number): string => ACCENTS[id % ACCENTS.length] ?? "";

const TILE =
  "flex h-full min-h-32 rounded-card border p-4 focus-ring transition-[border-color,box-shadow,background-color,transform] duration-200";
const NEW_TILE = `${TILE} flex-col items-center justify-center gap-2 border-dashed border-control/50 text-sm font-medium text-ink-muted hover:border-control hover:bg-surface hover:text-ink`;

// Tiles rise in one after another on the first paint.
const rise = (index: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { ...spring.gentle, delay: Math.min(index, 8) * 0.04 },
});

// Move any notebook from the dashboard (drag and drop), with an undo toast.
function useMoveFromDashboard() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      readonly experimentId: number;
      readonly folderId: number | null;
    }) => {
      const result = await moveNotebook(v.experimentId, v.folderId);
      if (!result.ok) throw result.error;
      return result.data;
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: folderKeys.all }),
        client.invalidateQueries({ queryKey: experimentKeys.all }),
      ]),
  });
}

// The lab dashboard's two panels (2026-10-30, the hilos reference): the
// notebooks not in any folder as white tiles on a blue panel, and the class
// folders as rows on a rose one. Drag a notebook onto a folder
// to file it; the notebook's panel has the same move as a menu.
function NotebookGrid() {
  const query = useExperiments();
  const folders = useFolders();
  const move = useMoveFromDashboard();
  const [dragging, setDragging] = useState<ExperimentSummary | null>(null);
  const notebooks = query.data;
  const loading = notebooks === undefined && !query.isError;
  const hasFolders = (folders.data?.length ?? 0) > 0;
  const loose = notebooks?.filter((n) => n.folder_id === null);

  const drop = (folder: FolderSummary, experimentId: number) => {
    const notebook = notebooks?.find((n) => n.id === experimentId);
    setDragging(null);
    if (!notebook || notebook.folder_id === folder.id) return;
    move.mutate(
      { experimentId, folderId: folder.id },
      {
        onSuccess: () =>
          toast.success(`«${notebook.title}» ahora está en ${folder.name}`, {
            action: {
              label: "Deshacer",
              onClick: () =>
                move.mutate({ experimentId, folderId: notebook.folder_id }),
            },
          }),
        onError: () => toast.error("No pudimos moverlo. Intenta de nuevo."),
      },
    );
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section
        aria-labelledby="tus-cuadernos"
        className="flex flex-col gap-4 rounded-[20px] border border-tint-blue-line/60 bg-tint-blue-soft p-4 lg:p-5"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <BookOpenIcon aria-hidden className="size-5 text-ink" />
            <h2 id="tus-cuadernos" className="text-base font-semibold text-ink">
              {hasFolders ? "Sin carpeta" : "Tus cuadernos"}
            </h2>
            {loose ? <CountPill count={loose.length} /> : null}
          </div>
          <Link
            href="/cuadernos"
            className="inline-flex h-9 items-center gap-1 rounded-control px-2 text-sm text-ink-muted focus-ring transition-colors hover:bg-surface hover:text-ink"
          >
            Mis cuadernos
            <ChevronRightIcon aria-hidden className="size-4" />
          </Link>
        </div>

        {query.isError && notebooks === undefined ? (
          <p className="text-sm text-ink-muted">
            No pudimos cargar tus cuadernos.
          </p>
        ) : null}

        <NotebookTiles
          notebooks={loose}
          loading={loading}
          newHref="/cuadernos/nuevo"
          onDragStart={hasFolders ? setDragging : undefined}
          onDragEnd={() => setDragging(null)}
          className="sm:grid-cols-2 xl:grid-cols-2"
        />
      </section>

      <FolderTiles folders={folders.data} dragging={dragging} onDrop={drop} />
    </div>
  );
}

function CountPill({ count }: { readonly count: number }) {
  return (
    <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-ink-muted tabular-nums">
      {count}
    </span>
  );
}

function FolderTiles({
  folders,
  dragging,
  onDrop,
}: {
  readonly folders: readonly FolderSummary[] | undefined;
  readonly dragging: ExperimentSummary | null;
  readonly onDrop: (folder: FolderSummary, experimentId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const create = useCreateFolder();
  return (
    <section
      aria-labelledby="carpetas"
      className="flex flex-col gap-4 rounded-[20px] border border-tint-rose-line/60 bg-tint-rose-soft p-4 lg:p-5"
    >
      <div className="flex min-h-9 items-center gap-2.5">
        <FolderIcon aria-hidden className="size-5 text-ink" />
        <h2 id="carpetas" className="text-base font-semibold text-ink">
          Carpetas
        </h2>
        {folders ? <CountPill count={folders.length} /> : null}
      </div>
      {dragging ? (
        <p
          role="status"
          className="-mt-2 flex items-center gap-1.5 text-xs font-medium text-brand"
        >
          <MoveIcon aria-hidden className="size-3.5" />
          Suelta «{dragging.title}» en una carpeta
        </p>
      ) : null}
      <ul aria-label="Carpetas" className="flex flex-col gap-2">
        {folders?.map((folder, index) => (
          <motion.li key={folder.id} {...rise(index)}>
            <FolderTile
              folder={folder}
              dragging={dragging !== null}
              onDrop={onDrop}
            />
          </motion.li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => {
              create.reset();
              setOpen(true);
            }}
            className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-card border border-dashed border-tint-rose-line text-sm font-medium text-ink-muted focus-ring transition-colors hover:bg-surface hover:text-ink"
          >
            <PlusIcon aria-hidden className="size-4" />
            Nueva carpeta
          </button>
        </li>
      </ul>
      <FolderNameDialog
        open={open}
        onOpenChange={setOpen}
        title="Nueva carpeta"
        submitLabel="Crear carpeta"
        pending={create.isPending}
        error={folderFailure(create.error)}
        onSubmit={(name) =>
          create.mutate(name, { onSuccess: () => setOpen(false) })
        }
      />
    </section>
  );
}

function FolderTile({
  folder,
  dragging,
  onDrop,
}: {
  readonly folder: FolderSummary;
  readonly dragging: boolean;
  readonly onDrop: (folder: FolderSummary, experimentId: number) => void;
}) {
  const [over, setOver] = useState(false);
  const accepts = (event: React.DragEvent) =>
    event.dataTransfer.types.includes(DRAG_TYPE);
  return (
    <Link
      href={`/carpetas/${folder.id}`}
      onDragOver={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        if (!accepts(event)) return;
        event.preventDefault();
        const id = Number(event.dataTransfer.getData(DRAG_TYPE));
        if (Number.isSafeInteger(id) && id > 0) onDrop(folder, id);
      }}
      className={cn(
        "group flex items-center gap-3 rounded-card border p-3 focus-ring transition-[border-color,box-shadow,background-color,transform] duration-200 hover:-translate-y-0.5 hover:shadow-card",
        over
          ? "scale-[1.02] border-brand bg-brand-soft shadow-card"
          : dragging
            ? "border-dashed border-brand bg-surface"
            : "border-line bg-surface hover:border-control",
      )}
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-control bg-sunken transition-transform group-hover:-rotate-6"
      >
        <FolderIcon className={cn("size-5", accentFor(folder.id))} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-ink">{folder.name}</span>
        <span className="text-sm text-ink-muted">
          {over
            ? "Suelta para mover aquí"
            : notebooksLabel(folder.notebook_count)}
        </span>
      </span>
      <ChevronRightIcon aria-hidden className="size-4 text-ink-muted" />
    </Link>
  );
}

// The notebook tiles, after a "Nuevo cuaderno" tile. Shared with a folder's
// page; draggable when the page offers folders to drop on.
function NotebookTiles({
  notebooks,
  loading,
  newHref,
  onDragStart,
  onDragEnd,
  className,
}: {
  readonly notebooks: readonly ExperimentSummary[] | undefined;
  readonly loading: boolean;
  readonly newHref: string;
  readonly onDragStart?: (notebook: ExperimentSummary) => void;
  readonly onDragEnd?: () => void;
  readonly className?: string;
}) {
  return (
    <ul
      aria-label="Cuadernos"
      aria-busy={loading}
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3",
        className,
      )}
    >
      <li>
        <Link href={newHref} className={NEW_TILE}>
          <PlusIcon aria-hidden className="size-5" />
          Nuevo cuaderno
        </Link>
      </li>
      {loading
        ? [0, 1].map((tile) => (
            <li key={tile}>
              <Skeleton className="h-32 w-full rounded-card" />
            </li>
          ))
        : null}
      {notebooks?.map((notebook, index) => (
        <motion.li key={notebook.id} {...rise(index + 1)}>
          <NotebookTile
            notebook={notebook}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        </motion.li>
      ))}
    </ul>
  );
}

function NotebookTile({
  notebook,
  onDragStart,
  onDragEnd,
}: {
  readonly notebook: ExperimentSummary;
  readonly onDragStart?: (notebook: ExperimentSummary) => void;
  readonly onDragEnd?: () => void;
}) {
  const now = useNow();
  const [lifted, setLifted] = useState(false);
  const closed = notebook.status === "closed";
  const draggable = onDragStart !== undefined;
  return (
    <Link
      href={`/cuadernos/${notebook.id}`}
      draggable={draggable}
      onDragStart={(event) => {
        if (!onDragStart) return;
        event.dataTransfer.setData(DRAG_TYPE, String(notebook.id));
        event.dataTransfer.effectAllowed = "move";
        setLifted(true);
        onDragStart(notebook);
      }}
      onDragEnd={() => {
        setLifted(false);
        onDragEnd?.();
      }}
      className={cn(
        TILE,
        "group flex-col justify-between gap-4 border-line bg-surface hover:-translate-y-0.5 hover:border-control hover:shadow-card",
        draggable && "cursor-grab active:cursor-grabbing",
        lifted && "rotate-1 opacity-60",
      )}
    >
      <div className="flex flex-col gap-2">
        <Badge variant={closed ? "neutral" : "saved"} className="self-start">
          {closed ? "Cerrado" : "Abierto"}
        </Badge>
        <p className="line-clamp-2 font-medium text-ink">{notebook.title}</p>
      </div>
      <p className="flex items-center justify-between gap-2 text-sm text-ink-muted">
        <span>{trialsLabel(notebook.trial_count)}</span>
        <time dateTime={notebook.last_activity_at}>
          {formatRelative(new Date(notebook.last_activity_at), now)}
        </time>
      </p>
    </Link>
  );
}

export { NotebookGrid, NotebookTiles };
