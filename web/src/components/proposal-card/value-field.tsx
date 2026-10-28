"use client";

import { useId, useState } from "react";
import type * as React from "react";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatQuantity, parseDecimal } from "@/lib/format";
import { cn } from "@/lib/utils";

import { copy } from "./copy";

type ValueFieldProps = {
  readonly formId?: string;
  readonly name: string;
  readonly unit: string | null;
  readonly initial: number | null;
  readonly onCommit: (value: number) => void;
  readonly onCancel?: () => void;
  readonly inputRef?: React.Ref<HTMLInputElement>;
};

// The card's one piece of state: the draft text of the value being typed.
// The parent remounts it (by key) when the value prop changes or editing ends.
function ValueField({
  formId,
  name,
  unit,
  initial,
  onCommit,
  onCancel,
  inputRef,
}: ValueFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const [draft, setDraft] = useState(
    initial === null ? "" : formatQuantity(initial, null),
  );
  const [invalid, setInvalid] = useState(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseDecimal(draft);
    if (parsed.ok) onCommit(parsed.value);
    else setInvalid(true);
  };

  return (
    <form id={formId} onSubmit={submit} noValidate className="w-full">
      <Field data-invalid={invalid || undefined} className="gap-1.5">
        <FieldLabel htmlFor={id} className="sr-only">
          {name}
        </FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            id={id}
            value={draft}
            inputMode="decimal"
            autoComplete="off"
            placeholder="—"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && onCancel) {
                event.preventDefault();
                onCancel();
              }
            }}
            className={cn(
              "h-12 max-w-48 font-mono text-readout tabular-nums",
              initial === null && "border-dashed",
            )}
          />
          {unit ? (
            <span className="font-mono text-readout text-ink-muted">
              {unit}
            </span>
          ) : null}
        </div>
        {invalid ? (
          <FieldError id={errorId}>{copy.badNumber}</FieldError>
        ) : null}
      </Field>
    </form>
  );
}

export { ValueField };
