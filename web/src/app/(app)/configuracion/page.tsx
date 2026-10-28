import type { Metadata } from "next";

import { SettingsView } from "@/components/settings/settings-view";

import { ApiStatus } from "../api-status";

export const metadata: Metadata = { title: "Configuración · LabFlow AI" };

export default function SettingsPage() {
  return <SettingsView connection={<ApiStatus />} />;
}
