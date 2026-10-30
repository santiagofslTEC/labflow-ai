"use client";

import { LogOutIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type * as React from "react";

import { readSession, type Signed, signOut } from "@/api/access";
import { signOutAccount } from "@/api/auth";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ACCESS_PATH } from "@/lib/access";

type Holder =
  | { readonly state: "loading" }
  | { readonly state: "known"; readonly who: Signed }
  | { readonly state: "unknown" };

// How this person signs in (spec 0014, AC-7).
export const signInLabel = (who: Signed): string =>
  who.kind === "code"
    ? `Código de acceso: ${who.name ?? who.holder}`
    : who.provider === "google"
      ? "Google"
      : "Correo y contraseña";

// /configuracion: the session, the API connection, and how the app behaves.
// The page passes the connection badge in, so this stays free of app/ imports.
function SettingsView({
  connection,
}: {
  readonly connection: React.ReactNode;
}) {
  const [holder, setHolder] = useState<Holder>({ state: "loading" });
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void readSession().then((result) => {
      if (!live) return;
      setHolder(
        result.ok ? { state: "known", who: result.who } : { state: "unknown" },
      );
    });
    return () => {
      live = false;
    };
  }, []);

  const leave = async () => {
    setLeaving(true);
    setFailed(false);
    // Both ways out: the Supabase session on this device (a no op without one)
    // and the code cookie, which only the API can clear (spec 0014, AC-4).
    await signOutAccount();
    if (await signOut()) {
      window.location.assign(ACCESS_PATH);
      return;
    }
    setLeaving(false);
    setFailed(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
      <PageHeader
        title="Configuración"
        description="Tu sesión, la conexión con LabFlow y cómo se comporta la app."
      />

      <Section id="sesion" title="Sesión">
        <Row label="Entraste como">
          {holder.state === "loading" ? (
            <Skeleton className="h-4 w-24" />
          ) : holder.state === "known" ? (
            <span className="font-medium text-ink">
              {holder.who.name ?? holder.who.holder}
            </span>
          ) : (
            <span className="text-ink-muted">No disponible</span>
          )}
        </Row>
        {holder.state === "known" && holder.who.email ? (
          <Row label="Correo">
            <span className="text-ink">{holder.who.email}</span>
          </Row>
        ) : null}
        {holder.state === "known" ? (
          <Row label="Cómo entras">
            <span className="text-ink">{signInLabel(holder.who)}</span>
          </Row>
        ) : null}
        <Row label="Cerrar sesión" hint="Cierra la sesión en este dispositivo.">
          <Button
            variant="secondary"
            onClick={() => void leave()}
            aria-disabled={leaving || undefined}
          >
            <LogOutIcon aria-hidden />
            {leaving ? "Cerrando…" : "Cerrar sesión"}
          </Button>
        </Row>
        {failed ? (
          <p role="alert" className="text-sm text-danger">
            No pudimos cerrar la sesión. Revisa tu conexión y vuelve a intentar.
          </p>
        ) : null}
      </Section>

      <Section id="conexion" title="Conexión">
        <Row label="Servidor de LabFlow">{connection}</Row>
      </Section>

      <Section id="preferencias" title="Preferencias">
        <Row label="Idioma" hint="Interfaz, dictado y respuestas.">
          <span className="text-ink">Español</span>
        </Row>
        <Row label="Apariencia">
          <span className="text-ink">Claro</span>
        </Row>
        <Row
          label="Confirmación antes de guardar"
          hint="LabFlow nunca guarda una medición sin tu sí."
        >
          <span className="text-ink">Siempre</span>
        </Row>
      </Section>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <h2 id={id} className="pb-2 text-sm font-medium text-ink-muted">
        {title}
      </h2>
      <div className="flex flex-col border-t border-line">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line py-3">
      <div className="flex flex-col">
        <span className="text-sm text-ink">{label}</span>
        {hint ? <span className="text-sm text-ink-muted">{hint}</span> : null}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export { SettingsView };
