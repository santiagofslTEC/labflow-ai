import type { Metadata } from "next";

import { AccessShell } from "@/components/access/access-shell";
import { NewPasswordForm } from "@/components/access/new-password-form";

export const metadata: Metadata = {
  title: "Contraseña nueva · LabFlow AI",
};

export default function Page() {
  return (
    <AccessShell
      title="Contraseña nueva"
      description="Elige una contraseña de 10 caracteres o más."
    >
      <NewPasswordForm />
    </AccessShell>
  );
}
