"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";
import type * as React from "react";

import type {
  ApiFailure,
  ExperimentDetail,
  VariableDetail,
  VariableIn,
} from "@/api/experiments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAddVariable,
  useDeleteVariables,
  useUpdateVariable,
} from "@/hooks/use-experiments";
import { LIMITS, MESSAGES, UNIT_SUGGESTIONS } from "@/lib/experiment-form";
import { formatRange } from "@/lib/format";
import {
  deleteConfirmText,
  deletedText,
  deleteLabel,
  draftOf,
  emptyDraft,
  rangeNote,
  toVariableIn,
  validateVariable,
  VARIABLE_MESSAGES,
  valueCount,
  variableCount,
  type DraftErrors,
  type DraftField,
  type OtherVariable,
  type SavedValue,
  type VariableDraft,
} from "@/lib/variable-form";

import { errorId, FieldMessage } from "./field-error";

type Mode =
  | { readonly kind: "list" }
  | { readonly kind: "add" }
  | { readonly kind: "edit"; readonly id: number }
  | { readonly kind: "confirm" };

type VariablesDialogProps = {
  readonly experiment: ExperimentDetail;
  // Saved values per variable from the trials query (spec 0007); null while it
  // loads, so the unit is not locked from a guess (the API checks anyway).
  readonly saved: ReadonlyMap<number, readonly SavedValue[]> | null;
  readonly triggerClassName: string;
  readonly children: React.ReactNode;
};

const failureText = (failure: ApiFailure): string => {
  switch (failure.kind) {
    case "invalid":
      return failure.message || "No se pudo guardar. Revisa los datos.";
    case "not_found":
      return "Esa variable ya no existe en este cuaderno.";
    case "unauthorized":
      return "Tu sesión venció. Entra de nuevo.";
    case "unavailable":
      return "No pudimos conectar con LabFlow. Intenta de nuevo.";
  }
};

// "Revisar variables" (spec 0008): the notebook's variables in a dialog, with
// add, edit one at a time, and select several to delete after a confirmation.
function VariablesDialog({
  experiment,
  saved,
  triggerClassName,
  children,
}: VariablesDialogProps) {
  const add = useAddVariable(experiment.id);
  const update = useUpdateVariable();
  const remove = useDeleteVariables(experiment.id);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  const variables = experiment.variables;
  const savedOf = (id: number): readonly SavedValue[] => saved?.get(id) ?? [];
  const othersThan = (id: number | null): readonly OtherVariable[] =>
    variables
      .filter((v) => v.id !== id)
      .map((v) => ({ name: v.name, aliases: v.aliases ?? [] }));
  const editable = experiment.status !== "closed";
  const full = variables.length >= LIMITS.variables;
  const chosen = variables.filter((v) => selected.has(v.id));
  const allChosen = chosen.length === variables.length;
  const busy = add.isPending || update.isPending || remove.isPending;

  const reset = () => {
    setMode({ kind: "list" });
    setSelected(new Set());
    setStatus(null);
    setFailure(null);
  };

  const toggle = (id: number, on: boolean) => {
    setStatus(null);
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const save = (body: VariableIn) => {
    setFailure(null);
    const done = {
      onSuccess: () => setMode({ kind: "list" }),
      onError: (error: ApiFailure) => setFailure(failureText(error)),
    };
    if (mode.kind === "edit") update.mutate({ id: mode.id, body }, done);
    else add.mutate(body, done);
  };

  const confirmDelete = () => {
    setFailure(null);
    remove.mutate(
      chosen.map((v) => v.id),
      {
        onSuccess: (result) => {
          setSelected(new Set());
          setMode({ kind: "list" });
          setStatus(deletedText(result));
        },
        onError: (error) => setFailure(failureText(error)),
      },
    );
  };

  const chosenValues = chosen.reduce((sum, v) => sum + savedOf(v.id).length, 0);

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : reset())}>
      <DialogTrigger className={triggerClassName}>{children}</DialogTrigger>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)] lg:max-h-[85vh] lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Variables · {experiment.title}</DialogTitle>
          <DialogDescription>
            {variableCount(variables.length)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          {editable ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {chosen.length > 0 && mode.kind !== "confirm" ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="danger"
                    aria-disabled={allChosen || busy || undefined}
                    aria-describedby={allChosen ? "keep-one" : undefined}
                    onClick={() => {
                      if (!allChosen && !busy) setMode({ kind: "confirm" });
                    }}
                  >
                    <Trash2Icon aria-hidden />
                    {deleteLabel(chosen.length)}
                  </Button>
                  {allChosen ? (
                    <p id="keep-one" className="text-sm text-ink-muted">
                      {VARIABLE_MESSAGES.keepOne}
                    </p>
                  ) : null}
                </div>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-3">
                {full ? (
                  <p id="variables-full" className="text-sm text-ink-muted">
                    {MESSAGES.tooManyVariables}
                  </p>
                ) : null}
                <Button
                  ref={addRef}
                  variant="secondary"
                  disabled={full || mode.kind === "add"}
                  aria-describedby={full ? "variables-full" : undefined}
                  onClick={() => {
                    setStatus(null);
                    setFailure(null);
                    setMode({ kind: "add" });
                  }}
                >
                  <PlusIcon aria-hidden />
                  Agregar variable
                </Button>
              </div>
            </div>
          ) : null}

          {mode.kind === "confirm" ? (
            <DeleteConfirm
              text={deleteConfirmText(
                chosen.map((v) => v.name),
                chosenValues,
              )}
              busy={remove.isPending}
              onCancel={() => setMode({ kind: "list" })}
              onConfirm={confirmDelete}
            />
          ) : null}

          <p role="status" className="text-sm text-ink empty:hidden">
            {status}
          </p>
          {failure ? (
            <p role="alert" className="text-sm text-ink">
              {failure}
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {editable ? (
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas"
                        checked={allChosen}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? new Set(variables.map((v) => v.id))
                              : new Set(),
                          )
                        }
                        className="size-5 cursor-pointer rounded accent-ink focus-ring"
                      />
                    </TableHead>
                  ) : null}
                  <TableHead>Nombre</TableHead>
                  <TableHead className="max-lg:hidden">Unidad</TableHead>
                  <TableHead className="max-lg:hidden">Rango</TableHead>
                  <TableHead className="max-lg:hidden">Tipo</TableHead>
                  <TableHead className="text-right max-lg:hidden">
                    Valores
                  </TableHead>
                  {editable ? (
                    <TableHead>
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {variables.map((variable) =>
                  mode.kind === "edit" && mode.id === variable.id ? (
                    <FormRow
                      key={variable.id}
                      columns={editable ? 7 : 5}
                      title={`Editar ${variable.name}`}
                      initial={draftOf(variable)}
                      others={othersThan(variable.id)}
                      saved={savedOf(variable.id)}
                      lockedUnit={
                        savedOf(variable.id).length > 0
                          ? { unit: variable.unit }
                          : null
                      }
                      saving={update.isPending}
                      onSave={save}
                      onCancel={() => setMode({ kind: "list" })}
                    />
                  ) : (
                    <VariableRow
                      key={variable.id}
                      variable={variable}
                      values={saved ? savedOf(variable.id).length : null}
                      editable={editable}
                      checked={selected.has(variable.id)}
                      onCheck={(on) => toggle(variable.id, on)}
                      onEdit={() => {
                        setStatus(null);
                        setFailure(null);
                        setMode({ kind: "edit", id: variable.id });
                      }}
                    />
                  ),
                )}
                {mode.kind === "add" ? (
                  <FormRow
                    columns={7}
                    title="Nueva variable"
                    initial={emptyDraft}
                    others={othersThan(null)}
                    lockedUnit={null}
                    saving={add.isPending}
                    onSave={save}
                    onCancel={() => {
                      setMode({ kind: "list" });
                      addRef.current?.focus();
                    }}
                  />
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VariableRow({
  variable,
  values,
  editable,
  checked,
  onCheck,
  onEdit,
}: {
  readonly variable: VariableDetail;
  readonly values: number | null;
  readonly editable: boolean;
  readonly checked: boolean;
  readonly onCheck: (on: boolean) => void;
  readonly onEdit: () => void;
}) {
  return (
    <TableRow data-state={checked ? "selected" : undefined}>
      {editable ? (
        <TableCell className="max-lg:w-11">
          <input
            type="checkbox"
            aria-label={`Seleccionar ${variable.name}`}
            checked={checked}
            onChange={(event) => onCheck(event.target.checked)}
            className="size-5 cursor-pointer rounded accent-ink focus-ring max-lg:size-6"
          />
        </TableCell>
      ) : null}
      <TableCell className="font-medium text-ink max-lg:whitespace-normal">
        {variable.name}
        {/* The phone folds the other columns under the name (spec 0010, AC-4). */}
        <span className="block pt-0.5 text-xs font-normal text-ink-muted lg:hidden">
          {phoneDetails(variable, values)}
        </span>
      </TableCell>
      <TableCell className="font-mono max-lg:hidden">
        {variable.unit ?? "—"}
      </TableCell>
      <TableCell className="font-mono tabular-nums max-lg:hidden">
        {formatRange(variable.min_value, variable.max_value)}
      </TableCell>
      <TableCell className="text-ink-muted max-lg:hidden">
        {variable.required ? "Esperada" : "Opcional"}
      </TableCell>
      <TableCell className="text-right font-mono text-ink tabular-nums max-lg:hidden">
        {values === null ? "—" : valueCount(values)}
      </TableCell>
      {editable ? (
        <TableCell className="text-right">
          <Button
            variant="ghost"
            size="icon"
            className="max-lg:size-12"
            aria-label={`Editar ${variable.name}`}
            onClick={onEdit}
          >
            <PencilIcon aria-hidden />
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

// "°C · 20 a 100 · Esperada · 6 valores": the row's other columns, in one line.
const phoneDetails = (
  variable: VariableDetail,
  values: number | null,
): string =>
  [
    variable.unit ?? "Sin unidad",
    variable.min_value === null && variable.max_value === null
      ? "Sin rango"
      : formatRange(variable.min_value, variable.max_value),
    variable.required ? "Esperada" : "Opcional",
    ...(values === null ? [] : [valueCount(values)]),
  ].join(" · ");

// One variable's form in place of its row (AC-2, AC-3, AC-4).
function FormRow({
  columns,
  title,
  initial,
  others,
  saved = [],
  lockedUnit,
  saving,
  onSave,
  onCancel,
}: {
  readonly columns: number;
  readonly title: string;
  readonly initial: VariableDraft;
  readonly others: readonly OtherVariable[];
  // This variable's saved values, for the range note (AC-11); none when adding.
  readonly saved?: readonly SavedValue[];
  // Set while the variable has saved values (AC-3).
  readonly lockedUnit: { readonly unit: string | null } | null;
  readonly saving: boolean;
  readonly onSave: (body: VariableIn) => void;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const base = useId();
  const id = (field: DraftField | "required") => `${base}-${field}`;
  const note = rangeNote(saved, initial, draft);
  const noteId = `${base}-range-note`;

  const set = (field: DraftField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (errors[field])
      setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const found = validateVariable(draft, others);
    setErrors(found);
    const first = (["name", "unit", "min", "max", "aliases"] as const).find(
      (field) => found[field],
    );
    if (first) {
      formRef.current
        ?.querySelector<HTMLInputElement>(`#${CSS.escape(id(first))}`)
        ?.focus();
      return;
    }
    onSave(toVariableIn(draft));
  };

  const field = (
    name: DraftField,
    label: string,
    props: Omit<React.ComponentProps<"input">, "value" | "id"> = {},
    hint?: string,
  ) => {
    const error = errors[name];
    const hintId = hint ? `${id(name)}-hint` : null;
    const noted = note && (name === "min" || name === "max") ? noteId : null;
    const described =
      [error ? errorId(id(name)) : null, hintId, noted]
        .filter(Boolean)
        .join(" ") || undefined;
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id(name)} className="text-xs text-ink-muted">
          {label}
        </label>
        <Input
          id={id(name)}
          value={draft[name]}
          onChange={(event) => set(name, event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          {...props}
        />
        {hint ? (
          <p id={hintId ?? undefined} className="text-xs text-ink-muted">
            {hint}
          </p>
        ) : null}
        <FieldMessage id={errorId(id(name))} message={error} />
      </div>
    );
  };

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={columns} className="whitespace-normal">
        <form
          ref={formRef}
          noValidate
          aria-label={title}
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onCancel();
            }
          }}
          className="flex flex-col gap-3 rounded-control bg-sunken p-3"
        >
          <p className="text-sm font-medium text-ink">{title}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {field("name", "Nombre", {
              maxLength: LIMITS.name,
              autoComplete: "off",
              autoFocus: true,
            })}
            {field(
              "unit",
              "Unidad",
              {
                maxLength: LIMITS.unit,
                list: `${base}-units`,
                autoComplete: "off",
                className: "font-mono",
                disabled: lockedUnit !== null,
              },
              lockedUnit
                ? VARIABLE_MESSAGES.unitLocked(lockedUnit.unit)
                : undefined,
            )}
            {field("min", "Mín", {
              inputMode: "decimal",
              autoComplete: "off",
              className: "font-mono tabular-nums",
            })}
            {field("max", "Máx", {
              inputMode: "decimal",
              autoComplete: "off",
              className: "font-mono tabular-nums",
            })}
          </div>
          <p
            id={noteId}
            role="status"
            className="text-xs text-ink-muted empty:hidden"
          >
            {note}
          </p>
          <datalist id={`${base}-units`}>
            {UNIT_SUGGESTIONS.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            {field(
              "aliases",
              "Otros nombres",
              { autoComplete: "off", placeholder: "temp, T" },
              "Sepáralos con comas. LabFlow los reconoce al capturar.",
            )}
            <div className="flex flex-col gap-1">
              <label className="flex h-10 items-center gap-2 text-sm text-ink">
                <input
                  id={id("required")}
                  type="checkbox"
                  checked={draft.required}
                  aria-describedby={`${id("required")}-hint`}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      required: event.target.checked,
                    }))
                  }
                  className="size-5 cursor-pointer rounded accent-ink focus-ring"
                />
                Esperada
              </label>
              {/* What "required" means since spec 0011 (AC-2). */}
              <p
                id={`${id("required")}-hint`}
                className="text-xs text-ink-muted"
              >
                Se espera en cada ensayo. Nunca bloquea un guardado.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" aria-disabled={saving || undefined}>
              {saving ? <Spinner /> : null}
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </TableCell>
    </TableRow>
  );
}

function DeleteConfirm({
  text,
  busy,
  onCancel,
  onConfirm,
}: {
  readonly text: string;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <div
      role="group"
      aria-labelledby="delete-confirm-text"
      className="flex flex-col gap-3 rounded-control border border-line bg-sunken p-3"
    >
      <p id="delete-confirm-text" className="text-sm text-ink">
        {text}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" autoFocus onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          variant="danger"
          aria-disabled={busy || undefined}
          onClick={() => {
            if (!busy) onConfirm();
          }}
        >
          {busy ? <Spinner /> : <Trash2Icon aria-hidden />}
          {busy ? "Eliminando…" : "Eliminar"}
        </Button>
      </div>
    </div>
  );
}

export { VariablesDialog };
