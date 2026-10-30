import type { Metadata } from "next";

import { BrandMark } from "@/components/app-shell/brand-mark";

import { AccessForm } from "./access-form";

export const metadata: Metadata = {
  title: "Entrar · LabFlow AI",
};

// Outside the app shell: one centered column on the canvas, the same on a phone.
export default function AccessPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas px-4 py-12">
      <div className="flex w-full max-w-[360px] flex-col gap-8">
        <BrandMark className="self-center" />
        <header className="flex flex-col gap-2 text-center">
          <h1 className="text-display font-semibold text-ink">
            Entra a tu cuaderno
          </h1>
          <p className="text-ink-muted">
            Escribe el código de acceso que te dio tu equipo.
          </p>
        </header>
        <AccessForm />
      </div>
    </main>
  );
}
