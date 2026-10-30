"use client";

import { useState } from "react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const NAME_MAX = 80;

type FolderNameDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly submitLabel: string;
  readonly initialName?: string;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onSubmit: (name: string) => void;
};

// Name a class folder, new or existing (2026-10-30).
function FolderNameDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  initialName = "",
  pending,
  error,
  onSubmit,
}: FolderNameDialogProps) {
  const [name, setName] = useState(initialName);
  const [touched, setTouched] = useState(false);
  const empty = name.trim() === "";
  const message = touched && empty ? "Escribe un nombre." : error;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (empty || pending) return;
    onSubmit(name.trim());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(initialName);
          setTouched(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Una carpeta por clase, por ejemplo «Química orgánica».
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={message ? true : undefined} className="gap-1.5">
            <FieldLabel htmlFor="folder-name">Nombre</FieldLabel>
            <Input
              id="folder-name"
              value={name}
              maxLength={NAME_MAX}
              autoComplete="off"
              autoFocus
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? "folder-name-error" : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {message ? (
              <FieldError id="folder-name-error">{message}</FieldError>
            ) : null}
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" aria-disabled={pending || undefined}>
              {pending ? <Spinner /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { FolderNameDialog };
