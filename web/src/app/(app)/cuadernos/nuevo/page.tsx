import type { Metadata } from "next";

import { NotebookForm } from "@/components/notebooks/notebook-form";

export const metadata: Metadata = { title: "Nuevo cuaderno · LabFlow AI" };

export default function NewNotebookPage() {
  return <NotebookForm />;
}
