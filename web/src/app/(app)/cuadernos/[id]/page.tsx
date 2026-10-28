import type { Metadata } from "next";
import { Suspense } from "react";

import {
  NotebookSkeleton,
  NotebookView,
} from "@/components/notebooks/notebook-view";

export const metadata: Metadata = { title: "Cuaderno · LabFlow AI" };

// params is request data under cacheComponents, so it is read inside a
// Suspense boundary and the prerendered shell shows the notebook skeleton.
export default function NotebookPage({ params }: PageProps<"/cuadernos/[id]">) {
  return (
    <Suspense fallback={<NotebookSkeleton />}>
      <NotebookFromParams params={params} />
    </Suspense>
  );
}

// The id stays a string here; the client view checks it before asking the API.
async function NotebookFromParams({
  params,
}: Pick<PageProps<"/cuadernos/[id]">, "params">) {
  const { id } = await params;
  return <NotebookView rawId={id} />;
}
