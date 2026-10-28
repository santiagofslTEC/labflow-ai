import type { Metadata } from "next";

import { NotebookView } from "@/components/notebooks/notebook-view";

export const metadata: Metadata = { title: "Cuaderno · LabFlow AI" };

// The id stays a string here; the client view checks it before asking the API.
export default async function NotebookPage({
  params,
}: PageProps<"/cuadernos/[id]">) {
  const { id } = await params;
  return <NotebookView rawId={id} />;
}
