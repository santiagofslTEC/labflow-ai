"use client";

import { CircleAlertIcon } from "lucide-react";
import { type FormEvent, useId, useState } from "react";

import { type AccessResult, submitAccessCode } from "@/api/access";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { safeNextPath } from "@/lib/access";

type AccessFormProps = {
  readonly submit?: (code: string) => Promise<AccessResult>;
  readonly onGranted?: (next: string) => void;
};

type FormState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "error"; readonly message: string };

// A full page load, so the server renders the next page with the new cookie.
const goTo = (next: string) => window.location.assign(next);

export function AccessForm({
  submit = submitAccessCode,
  onGranted = goTo,
}: AccessFormProps) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const inputId = useId();
  const errorId = useId();

  const submitting = state.kind === "submitting";
  const blank = code.trim() === "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || blank) return;
    setState({ kind: "submitting" });
    const result = await submit(code.trim());
    if (result.ok) {
      const next = new URLSearchParams(window.location.search).get("next");
      onGranted(safeNextPath(next));
      return;
    }
    setState({ kind: "error", message: result.message });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Field data-invalid={state.kind === "error"}>
        <FieldLabel htmlFor={inputId} className="text-ink-muted">
          Código de acceso
        </FieldLabel>
        <Input
          id={inputId}
          name="code"
          type="password"
          autoComplete="current-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            if (state.kind === "error") setState({ kind: "idle" });
          }}
          aria-invalid={state.kind === "error" || undefined}
          aria-describedby={state.kind === "error" ? errorId : undefined}
        />
      </Field>

      {state.kind === "error" ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-2 text-sm text-ink"
        >
          <CircleAlertIcon
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-danger"
          />
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={blank && !submitting}
        aria-disabled={submitting || undefined}
      >
        {submitting ? (
          <>
            <Spinner />
            Entrando…
          </>
        ) : (
          "Entrar"
        )}
      </Button>
    </form>
  );
}
