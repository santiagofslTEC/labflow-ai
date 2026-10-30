import type { Metadata } from "next";
import { Suspense } from "react";

import { NotebookForm } from "@/components/notebooks/notebook-form";
import { parseFolderId } from "@/lib/folders";

export const metadata: Metadata = { title: "Nuevo cuaderno · LabFlow AI" };

// `?carpeta=` (from a class folder's "Nuevo cuaderno") picks the folder it starts
// in. searchParams is request data, so the form renders inside Suspense.
export default function NewNotebookPage({
  searchParams,
}: PageProps<"/cuadernos/nuevo">) {
  return (
    <Suspense fallback={null}>
      <FormFromSearch searchParams={searchParams} />
    </Suspense>
  );
}

async function FormFromSearch({
  searchParams,
}: Pick<PageProps<"/cuadernos/nuevo">, "searchParams">) {
  const { carpeta } = await searchParams;
  return <NotebookForm defaultFolderId={parseFolderId(carpeta)} />;
}
