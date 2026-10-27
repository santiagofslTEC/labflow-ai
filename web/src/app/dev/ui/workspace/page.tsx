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
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        eyebrow="Vista previa del espacio de trabajo"
        title={SAMPLE_EXPERIMENT_TITLE}
      />
      <WorkspaceDemo />
    </div>
  );
}
