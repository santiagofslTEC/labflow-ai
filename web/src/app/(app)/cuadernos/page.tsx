import type { Metadata } from "next";

import { NotebookList } from "@/components/notebooks/notebook-list";

export const metadata: Metadata = { title: "Mis cuadernos · LabFlow AI" };

export default function NotebooksPage() {
  return <NotebookList />;
}
