"use client";

import {
  ChevronRightIcon,
  FolderXIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { NotebookTiles } from "@/components/home/notebook-grid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  useDeleteFolder,
  useExperiments,
  useFolders,
  useRenameFolder,
} from "@/hooks/use-experiments";
import { folderFailure, notebooksLabel, parseFolderId } from "@/lib/folders";

import { FolderNameDialog } from "./folder-name-dialog";

// /carpetas/{id} (2026-10-30): one class folder's notebooks as tiles, with
// "Nuevo cuaderno" creating inside it, and rename and delete.
function FolderView({ rawId }: { readonly rawId: string }) {
  const id = parseFolderId(rawId);
  const folders = useFolders();
  const notebooks = useExperiments();
  const router = useRouter();
  const rename = useRenameFolder();
  const remove = useDeleteFolder();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const folder = folders.data?.find((f) => f.id === id);
  if (folders.isPending) {
    return (
      <div aria-busy className="flex flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (folder === undefined || id === null) {
    return (
      <EmptyState
        icon={FolderXIcon}
        headingLevel="h1"
        title="Esta carpeta no existe"
        description="Puede que la hayan eliminado."
        action={
          <Button asChild variant="secondary">
            <Link href="/">Ir al inicio</Link>
          </Button>
        }
      />
    );
  }

  const inside = notebooks.data?.filter((n) => n.folder_id === folder.id);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 lg:pt-6">
      <div className="flex flex-col gap-2">
        <nav
          aria-label="Ruta"
          className="hidden items-center gap-1 text-sm lg:flex"
        >
          <Link
            href="/"
            className="-ml-2 inline-flex h-9 items-center rounded-control px-2 text-ink-muted focus-ring transition-colors hover:bg-sunken hover:text-ink"
          >
            Inicio
          </Link>
          <ChevronRightIcon aria-hidden className="size-4 text-ink-muted" />
        </nav>
        <PageHeader
          title={folder.name}
          description={notebooksLabel(folder.notebook_count)}
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  rename.reset();
                  setRenaming(true);
                }}
              >
                <PencilIcon aria-hidden />
                Renombrar
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  remove.reset();
                  setDeleting(true);
                }}
              >
                <Trash2Icon aria-hidden />
                Eliminar carpeta
              </Button>
            </>
          }
        />
      </div>

      <NotebookTiles
        notebooks={inside}
        loading={notebooks.data === undefined && !notebooks.isError}
        newHref={`/cuadernos/nuevo?carpeta=${folder.id}`}
      />

      <FolderNameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Renombrar carpeta"
        submitLabel="Guardar nombre"
        initialName={folder.name}
        pending={rename.isPending}
        error={folderFailure(rename.error)}
        onSubmit={(name) =>
          rename.mutate(
            { id: folder.id, name },
            { onSuccess: () => setRenaming(false) },
          )
        }
      />

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar «{folder.name}»?</DialogTitle>
            <DialogDescription>
              Sus cuadernos no se borran: quedan en «Sin carpeta».
            </DialogDescription>
          </DialogHeader>
          {remove.error ? (
            <p role="alert" className="text-sm text-danger">
              {folderFailure(remove.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              aria-disabled={remove.isPending || undefined}
              onClick={() => {
                if (remove.isPending) return;
                remove.mutate(folder.id, {
                  onSuccess: () => router.push("/"),
                });
              }}
            >
              {remove.isPending ? <Spinner /> : <Trash2Icon aria-hidden />}
              Eliminar carpeta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { FolderView };
