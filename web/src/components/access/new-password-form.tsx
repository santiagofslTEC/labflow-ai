"use client";

import { useRef, useState } from "react";

import { setNewPassword } from "@/api/auth";
import { passwordProblem } from "@/lib/auth-messages";

import { FormMessage, PasswordField, SubmitButton } from "./form-parts";

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "busy" }
  | { readonly kind: "error"; readonly message: string };

// /access/nueva-contrasena (spec 0014, AC-3): reached from the reset email, already
// signed in by that link; the new password twice, then into the app.
function NewPasswordForm({
  onDone = (path: string) => window.location.assign(path),
}: {
  readonly onDone?: (path: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [errors, setErrors] = useState<{
    password?: string | null;
    again?: string | null;
  }>({});
  const [state, setState] = useState<State>({ kind: "idle" });
  const busy = state.kind === "busy";
  const passwordRef = useRef<HTMLInputElement>(null);
  const againRef = useRef<HTMLInputElement>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const found = {
      password: passwordProblem(password),
      again: again === password ? null : "Las contraseñas no coinciden.",
    };
    setErrors(found);
    if (found.password || found.again) {
      (found.password ? passwordRef : againRef).current?.focus();
      return;
    }
    setState({ kind: "busy" });
    const result = await setNewPassword(password);
    if (result.ok) {
      onDone("/");
      return;
    }
    setState({ kind: "error", message: result.message });
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex flex-col gap-4"
    >
      <PasswordField
        ref={passwordRef}
        label="Contraseña nueva (10 caracteres o más)"
        autoComplete="new-password"
        value={password}
        error={errors.password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <PasswordField
        ref={againRef}
        label="Repite la contraseña"
        autoComplete="new-password"
        value={again}
        error={errors.again}
        onChange={(event) => setAgain(event.target.value)}
      />
      {state.kind === "error" ? (
        <FormMessage tone="error" message={state.message} />
      ) : null}
      <SubmitButton busy={busy} busyLabel="Guardando…">
        Guardar contraseña
      </SubmitButton>
    </form>
  );
}

export { NewPasswordForm };
