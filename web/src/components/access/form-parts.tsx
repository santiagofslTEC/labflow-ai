"use client";

import { CircleAlertIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useId, useState } from "react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

// Shared pieces of the account forms (spec 0014, AC-11): labelled fields with the
// error under them, a password field with show and hide, and the submit button
// that sends once.
function Problem({
  id,
  message,
}: {
  readonly id: string;
  readonly message: string;
}) {
  return (
    <p id={id} className="flex items-start gap-2 text-sm text-ink">
      <CircleAlertIcon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-danger"
      />
      {message}
    </p>
  );
}

type TextFieldProps = Omit<React.ComponentProps<"input">, "id"> & {
  readonly label: string;
  readonly error?: string | null;
};

function TextField({ label, error, ...input }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <Field data-invalid={error ? true : undefined} className="gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        className="h-12"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...input}
      />
      {error ? <Problem id={errorId} message={error} /> : null}
    </Field>
  );
}

function PasswordField(props: Omit<TextFieldProps, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <TextField
        {...props}
        type={shown ? "text" : "password"}
        className="h-12 pr-12"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-pressed={shown}
        aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
        onClick={() => setShown((value) => !value)}
        className="absolute top-[calc(1.25rem+0.375rem+0.25rem)] right-1"
      >
        {shown ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
      </Button>
    </div>
  );
}

function SubmitButton({
  busy,
  busyLabel,
  children,
}: {
  readonly busy: boolean;
  readonly busyLabel: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Button type="submit" size="lg" aria-disabled={busy || undefined}>
      {busy ? (
        <>
          <Spinner />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

// A form level message: an error (role alert) or a notice (role status).
function FormMessage({
  tone,
  message,
}: {
  readonly tone: "error" | "notice";
  readonly message: string;
}) {
  return tone === "error" ? (
    <p role="alert" className="flex items-start gap-2 text-sm text-ink">
      <CircleAlertIcon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-danger"
      />
      {message}
    </p>
  ) : (
    <p
      role="status"
      className="rounded-control bg-brand-soft px-3 py-3 text-sm text-ink"
    >
      {message}
    </p>
  );
}

export { FormMessage, PasswordField, SubmitButton, TextField };
