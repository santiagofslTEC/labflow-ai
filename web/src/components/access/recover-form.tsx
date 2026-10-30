"use client";

import Link from "next/link";
import { useState } from "react";

import { sendPasswordReset } from "@/api/auth";
import { AUTH_MESSAGES, emailProblem } from "@/lib/auth-messages";

import { FormMessage, SubmitButton, TextField } from "./form-parts";

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "busy" }
  | { readonly kind: "sent" }
  | { readonly kind: "error"; readonly message: string };

// /access/recuperar (spec 0014, AC-3): always the same answer for any email.
function RecoverForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const busy = state.kind === "busy";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const problem = emailProblem(email);
    setError(problem);
    if (problem) return;
    setState({ kind: "busy" });
    const result = await sendPasswordReset(email);
    setState(
      result.ok ? { kind: "sent" } : { kind: "error", message: result.message },
    );
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex flex-col gap-4"
    >
      {state.kind === "sent" ? (
        <FormMessage tone="notice" message={AUTH_MESSAGES.resetSent} />
      ) : (
        <>
          <TextField
            label="Correo"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="off"
            value={email}
            error={error}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
          />
          {state.kind === "error" ? (
            <FormMessage tone="error" message={state.message} />
          ) : null}
          <SubmitButton busy={busy} busyLabel="Enviando…">
            Enviar enlace
          </SubmitButton>
        </>
      )}
      <Link
        href="/access"
        className="self-center text-sm text-ink-muted underline-offset-4 focus-ring hover:text-ink hover:underline"
      >
        Volver a entrar
      </Link>
    </form>
  );
}

export { RecoverForm };
