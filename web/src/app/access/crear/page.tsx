import type { Metadata } from "next";

import { AccessShell } from "@/components/access/access-shell";
import { SignUpForm } from "@/components/access/sign-up-form";

export const metadata: Metadata = {
  title: "Crear cuenta · LabFlow AI",
};

export default function Page() {
  return (
    <AccessShell
      title="Crear cuenta"
      description="Con tu correo; te enviaremos un enlace para activarla."
    >
      <SignUpForm />
    </AccessShell>
  );
}
