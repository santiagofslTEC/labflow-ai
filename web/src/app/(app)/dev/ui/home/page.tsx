import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isDevUiEnabled } from "@/lib/dev-ui";

import { HomeDemo } from "./home-demo";

export const metadata: Metadata = {
  title: "Inicio por voz · Sistema de diseño · LabFlow AI",
  robots: { index: false, follow: false },
};

// Preview of the push to talk main page with simulated speech. The real `/`
// switches to it once the decision is in a spec and feature 8 records audio.
export default function HomePreviewPage() {
  if (!isDevUiEnabled(process.env.VERCEL_ENV)) notFound();
  return <HomeDemo />;
}
