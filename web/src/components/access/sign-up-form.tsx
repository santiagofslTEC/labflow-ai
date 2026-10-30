"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { signUp } from "@/api/auth";
import {
  AUTH_MESSAGES,
  emailProblem,
  NAME_MAX,
  passwordProblem,
} from "@/lib/auth-messages";

import {
  FormMessage,
  PasswordField,
  SubmitButton,
  TextField,
} from "./form-parts";

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "busy" }
  | { readonly kind: "sent"; readonly email: string }
  | { readonly kind: "error"; readonly message: string };

// /access/crear (spec 0014, AC-2): the same answer for a new email and for one that
// already has an account, so the page never says which.
function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{
    email?: string | null;
    password?: string | null;
  }>({});
  const [state, setState] = useState<State>({ kind: "idle" });
  const busy = state.kind === "busy";
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const found = {
      email: emailProblem(email),
      password: passwordProblem(password),
    };
    setErrors(found);
    if (found.email || found.password) {
      (found.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setState({ kind: "busy" });
    const result = await signUp(name, email, password);
    setState(
      result.ok
        ? { kind: "sent", email: email.trim() }
        : { kind: "error", message: result.message },
    );
  };

  if (state.kind === "sent")
    return (
      <div className="flex flex-col gap-4">
        <FormMessage
          tone="notice"
          message={AUTH_MESSAGES.checkEmail(state.email)}
        />
        <Link
          href="/access"
          className="self-center text-sm text-ink underline-offset-4 focus-ring hover:underline"
        >
          Volver a entrar
        </Link>
      </div>
    );

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex flex-col gap-4"
    >
      <TextField
        label="Nombre (opcional)"
        autoComplete="name"
        maxLength={NAME_MAX}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <TextField
        ref={emailRef}
        label="Correo"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="off"
        value={email}
        error={errors.email}
        onChange={(event) => {
          setEmail(event.target.value);
          setErrors((current) => ({ ...current, email: null }));
        }}
      />
      <PasswordField
        ref={passwordRef}
        label="Contraseña (10 caracteres o más)"
        autoComplete="new-password"
        value={password}
        error={errors.password}
        onChange={(event) => {
          setPassword(event.target.value);
          setErrors((current) => ({ ...current, password: null }));
        }}
      />
      {state.kind === "error" ? (
        <FormMessage tone="error" message={state.message} />
      ) : null}
      <SubmitButton busy={busy} busyLabel="Creando…">
        Crear cuenta
      </SubmitButton>
      <Link
        href="/access"
        className="self-center text-sm text-ink-muted underline-offset-4 focus-ring hover:text-ink hover:underline"
      >
        Ya tengo cuenta
      </Link>
    </form>
  );
}

export { SignUpForm };
