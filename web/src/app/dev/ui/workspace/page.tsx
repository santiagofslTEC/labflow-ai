import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app-shell/page-header";
import { isDevUiEnabled } from "@/lib/dev-ui";

import { SAMPLE_EXPERIMENT_TITLE } from "../sample-data";
import { WorkspaceDemo } from "./workspace-demo";

export const metadata: Metadata = {
  title: "Espacio de trabajo · Sistema de diseño · LabFlow AI",
  robots: { index: false, follow: false },
};

// The experiment layout with sample data, to check AC-14 by hand from 320px to 1920px.
export default function WorkspacePreviewPage() {
  if (!isDevUiEnabled(process.env.VERCEL_ENV)) notFound();

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        eyebrow="Experimentos / Vista previa"
        title={SAMPLE_EXPERIMENT_TITLE}
        description="3 variables · Temperatura, Duración, Rendimiento"
      />
      <WorkspaceDemo />
    </div>
  );
}
