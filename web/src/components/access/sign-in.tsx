"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { readAccessOptions } from "@/api/access";
import { signInWithGoogle, signInWithPassword } from "@/api/auth";
import { AccessForm } from "@/app/access/access-form";
import { Button } from "@/components/ui/button";
import { safeNextPath } from "@/lib/access";
import { AUTH_MESSAGES, emailProblem } from "@/lib/auth-messages";

import {
  FormMessage,
  PasswordField,
  SubmitButton,
  TextField,
} from "./form-parts";

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "busy" }
  | { readonly kind: "error"; readonly message: string };

const RETURN_ERRORS: Readonly<Record<string, string>> = {
  google: AUTH_MESSAGES.google,
  link: AUTH_MESSAGES.link,
};

// Google's "G" in its own colors (its sign in branding rules), from public/brand
// so no raw color lives in the components.
function GoogleMark() {
  // eslint-disable-next-line @next/next/no-img-element -- a 20px static SVG
  return <img src="/brand/google.svg" alt="" width={20} height={20} />;
}

// /access (spec 0014, AC-1): Google, then email and password, then a quiet way in
// with an access code while the codes still work (AC-9). Without Supabase only
// the code form shows (AC-10).
function SignIn({ accounts }: { readonly accounts: boolean }) {
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const returned = RETURN_ERRORS[params.get("error") ?? ""];
  const [codes, setCodes] = useState<boolean | null>(null);
  const [withCode, setWithCode] = useState(!accounts);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [state, setState] = useState<State>(
    returned ? { kind: "error", message: returned } : { kind: "idle" },
  );
  const busy = state.kind === "busy";
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void readAccessOptions().then((options) => {
      if (live) setCodes(options?.codes ?? true);
    });
    return () => {
      live = false;
    };
  }, []);

  const google = async () => {
    if (busy) return;
    setState({ kind: "busy" });
    const result = await signInWithGoogle(next);
    // On success the browser is already leaving for Google.
    if (!result.ok) setState({ kind: "error", message: result.message });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const problem = emailProblem(email);
    setEmailError(problem);
    if (problem) {
      emailRef.current?.focus();
      return;
    }
    if (password === "") return;
    setState({ kind: "busy" });
    const result = await signInWithPassword(email, password);
    if (result.ok) {
      window.location.assign(next);
      return;
    }
    setState({ kind: "error", message: result.message });
  };

  if (withCode)
    return (
      <div className="flex flex-col gap-6">
        <AccessForm />
        {accounts ? (
          <button
            type="button"
            onClick={() => setWithCode(false)}
            className="self-center text-sm text-ink-muted underline-offset-4 focus-ring hover:text-ink hover:underline"
          >
            Entrar con Google o con correo
          </button>
        ) : null}
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={() => void google()}
      >
        <GoogleMark />
        Continuar con Google
      </Button>

      <div className="flex items-center gap-3 text-xs text-ink-muted">
        <span className="h-px flex-1 bg-line" />o con tu correo
        <span className="h-px flex-1 bg-line" />
      </div>

      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="flex flex-col gap-4"
      >
        <TextField
          ref={emailRef}
          label="Correo"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="off"
          value={email}
          error={emailError}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailError(null);
          }}
        />
        <PasswordField
          label="Contraseña"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {state.kind === "error" ? (
          <FormMessage tone="error" message={state.message} />
        ) : null}
        <SubmitButton busy={busy} busyLabel="Entrando…">
          Entrar
        </SubmitButton>
      </form>

      <nav
        aria-label="Cuenta"
        className="flex flex-col items-center gap-2 text-sm"
      >
        <Link
          href="/access/crear"
          className="font-medium text-ink underline-offset-4 focus-ring hover:underline"
        >
          Crear cuenta
        </Link>
        <Link
          href="/access/recuperar"
          className="text-ink-muted underline-offset-4 focus-ring hover:text-ink hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
        {codes ? (
          <button
            type="button"
            onClick={() => setWithCode(true)}
            className="text-ink-muted underline-offset-4 focus-ring hover:text-ink hover:underline"
          >
            Tengo un código de acceso
          </button>
        ) : null}
      </nav>
    </div>
  );
}

export { SignIn };
