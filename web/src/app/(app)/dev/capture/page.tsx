import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { CaptureStage } from "@/components/capture-stage/capture-stage";
import { isDevUiEnabled } from "@/lib/dev-ui";

export const metadata: Metadata = { title: "Captura · LabFlow AI" };

type Search = Promise<Record<string, string | string[] | undefined>>;

// The typed capture loop against the real API, outside production (spec 0006, AC-18).
export default function DevCapturePage({
  searchParams,
}: {
  readonly searchParams: Search;
}) {
  if (!isDevUiEnabled(process.env.VERCEL_ENV)) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <PageHeader
        eyebrow="Solo desarrollo y vistas previas"
        title="Captura escrita"
        description="Escribe una medición y confirma la tarjeta. Usa ?experiment= con el id de un cuaderno."
      />
      <Suspense fallback={null}>
        <StageFromSearch searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// searchParams is request data under cacheComponents, so it is read inside Suspense.
async function StageFromSearch({
  searchParams,
}: {
  readonly searchParams: Search;
}) {
  const raw = (await searchParams).experiment;
  const id = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) {
    return (
      <p className="text-sm text-ink-muted">
        Falta el cuaderno: abre <code>/dev/capture?experiment=1</code> con el id
        de uno de tus cuadernos.
      </p>
    );
  }
  return <CaptureStage experimentId={id} />;
}
