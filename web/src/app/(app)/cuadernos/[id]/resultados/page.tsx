import type { Metadata } from "next";
import { Suspense } from "react";

import {
  ResultsSkeleton,
  ResultsView,
} from "@/components/results/results-view";

export const metadata: Metadata = { title: "Resultados · LabFlow AI" };

// params is request data under cacheComponents, so it is read inside a
// Suspense boundary; ResultsView reads the selection with useSearchParams,
// which needs that boundary too (spec 0009).
export default function ResultsPage({
  params,
}: PageProps<"/cuadernos/[id]/resultados">) {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <ResultsFromParams params={params} />
    </Suspense>
  );
}

async function ResultsFromParams({
  params,
}: Pick<PageProps<"/cuadernos/[id]/resultados">, "params">) {
  const { id } = await params;
  return <ResultsView rawId={id} />;
}
