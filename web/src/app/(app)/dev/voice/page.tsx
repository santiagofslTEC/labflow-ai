import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { isDevUiEnabled } from "@/lib/dev-ui";

import { VoiceProbe } from "./voice-probe";

export const metadata: Metadata = { title: "Voz (prueba) · LabFlow AI" };

type Search = Promise<Record<string, string | string[] | undefined>>;

// Spec 0007 build task 1: one real Spanish call through the dev agent, outside production.
export default function DevVoicePage({
  searchParams,
}: {
  readonly searchParams: Search;
}) {
  if (!isDevUiEnabled(process.env.VERCEL_ENV)) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <PageHeader
        eyebrow="Solo desarrollo y vistas previas"
        title="Prueba de voz"
        description="Habla con el agente de desarrollo. El servidor repite lo que oyó. Usa ?experiment= con el id de un cuaderno."
      />
      <Suspense fallback={null}>
        <ProbeFromSearch searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ProbeFromSearch({
  searchParams,
}: {
  readonly searchParams: Search;
}) {
  const raw = (await searchParams).experiment;
  const id = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) {
    return (
      <p className="text-sm text-ink-muted">
        Falta el cuaderno: abre <code>/dev/voice?experiment=1</code> con el id
        de uno de tus cuadernos.
      </p>
    );
  }
  return <VoiceProbe experimentId={id} />;
}
