import type { Metadata } from "next";

import { AccessShell } from "@/components/access/access-shell";
import { RecoverForm } from "@/components/access/recover-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña · LabFlow AI",
};

export default function Page() {
  return (
    <AccessShell
      title="Recuperar contraseña"
      description="Te enviaremos un enlace para poner una nueva."
    >
      <RecoverForm />
    </AccessShell>
  );
}
