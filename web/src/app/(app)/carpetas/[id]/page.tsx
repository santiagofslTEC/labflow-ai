import type { Metadata } from "next";
import { Suspense } from "react";

import { FolderView } from "@/components/folders/folder-view";

export const metadata: Metadata = { title: "Carpeta · LabFlow AI" };

// A class folder and its notebooks (2026-10-30). params is request data, so it
// is read inside a Suspense boundary, like the notebook page.
export default function FolderPage({ params }: PageProps<"/carpetas/[id]">) {
  return (
    <Suspense fallback={null}>
      <FolderFromParams params={params} />
    </Suspense>
  );
}

async function FolderFromParams({
  params,
}: Pick<PageProps<"/carpetas/[id]">, "params">) {
  const { id } = await params;
  return <FolderView rawId={id} />;
}
