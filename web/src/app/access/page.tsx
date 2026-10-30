import type { Metadata } from "next";
import { Suspense } from "react";

import { AccessShell } from "@/components/access/access-shell";
import { SignIn } from "@/components/access/sign-in";
import { supabaseConfig } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Entrar · LabFlow AI",
};

// Google, email and password, or an access code (spec 0014, AC-1).
export default function AccessPage() {
  const accounts = supabaseConfig() !== null;
  return (
    <AccessShell
      title="Entrar a LabFlow"
      description={
        accounts
          ? "Usa tu cuenta de Google o tu correo."
          : "Escribe el código de acceso que te dio tu equipo."
      }
    >
      <Suspense>
        <SignIn accounts={accounts} />
      </Suspense>
    </AccessShell>
  );
}
