"use client";

import { CircleAlertIcon, ClipboardListIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useState } from "react";
import type * as React from "react";

import type { ApiFailure } from "@/api/experiments";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCreateExperiment } from "@/hooks/use-experiments";
import { useLeaveGuard } from "@/hooks/use-leave-guard";
import {
  LIMITS,
  fieldId,
  formReducer,
  initialFormState,
  isPristine,
  toCreateBody,
  validateExperimentForm,
} from "@/lib/experiment-form";

import { FieldMessage, errorId } from "./field-error";
import { ADD_VARIABLE_ID, VariableRows } from "./variable-rows";

const LIST_PATH = "/cuadernos";
const CREATE_FAILED = "No pudimos crear el cuaderno. Inténtalo de nuevo.";

// The alert above the buttons (AC-8). A 401 shows nothing: the client is
// already on its way to /access.
const failureMessage = (error: ApiFailure | null): string | null => {
  if (error === null || error.kind === "unauthorized") return null;
  return error.kind === "invalid" && error.message
    ? error.message
    : CREATE_FAILED;
};

const TIPS = [
  {
    title: "El orden es el de tu tabla",
    text: "Cada variable será una columna, en el orden en que la escribas.",
  },
  {
    title: "Rangos opcionales",
    text: "Mín y Máx sirven para notar un valor que parece fuera de lugar. Puedes poner solo uno.",
  },
  {
    title: "Coma o punto",
    text: "Escribe 20,5 o 20.5; las dos formas valen.",
  },
] as const;

// /cuadernos/nuevo (spec 0005, AC-3 to AC-9, AC-18).
function NotebookForm() {
  const router = useRouter();
  const [state, dispatch] = useReducer(formReducer, initialFormState);
  const [submitted, setSubmitted] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const create = useCreateExperiment();
  const pristine = isPristine(state);
  // Messages appear after the first try, then follow every keystroke.
  const errors = submitted ? validateExperimentForm(state) : {};
  const release = useLeaveGuard(!pristine && !create.isSuccess, setLeaveTo);

  // Focus moves wait for the render that adds or removes the target.
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (focusNext.current === null) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const leave = (href: string) => {
    release();
    router.push(href);
  };

  // isPending only flips on the next render; two clicks in one tick would both
  // pass it, so a ref holds the request in flight (AC-7).
  const inFlight = useRef(false);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    setSubmitted(true);
    const [firstInvalid] = Object.keys(validateExperimentForm(state));
    if (firstInvalid !== undefined) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    inFlight.current = true;
    create.mutate(toCreateBody(state), {
      onSuccess: (created) => leave(`/cuadernos/${created.id}`),
      onError: () => {
        inFlight.current = false;
      },
    });
  };

  const addRow = () => {
    focusNext.current = fieldId.variable(state.nextKey, "name");
    dispatch({ type: "add_row" });
  };

  const removeRow = (key: number) => {
    const index = state.variables.findIndex((row) => row.key === key);
    const previous = state.variables[index - 1];
    focusNext.current = previous
      ? fieldId.variable(previous.key, "name")
      : ADD_VARIABLE_ID;
    dispatch({ type: "remove_row", key });
  };

  const fillExample = () => {
    focusNext.current = fieldId.title;
    dispatch({ type: "fill_example" });
  };

  const alert = failureMessage(create.error);
  const titleError = errors[fieldId.title];
  const goalError = errors[fieldId.goal];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Nuevo cuaderno"
        description="Ponle un nombre y elige las variables que vas a medir. Después solo dictas o escribes cada ensayo."
        actions={
          pristine ? (
            <Button variant="ghost" onClick={fillExample}>
              <ClipboardListIcon aria-hidden />
              Usar ejemplo
            </Button>
          ) : null
        }
      />

      <div className="grid gap-12 xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]">
        <form
          noValidate
          onSubmit={onSubmit}
          aria-label="Nuevo cuaderno"
          className="flex min-w-0 flex-col gap-10"
        >
          <section className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label
                htmlFor={fieldId.title}
                className="text-sm font-medium text-ink"
              >
                Título
              </label>
              <Input
                id={fieldId.title}
                value={state.title}
                maxLength={LIMITS.title}
                autoComplete="off"
                placeholder="Rendimiento vs temperatura"
                onChange={(event) =>
                  dispatch({ type: "set_title", value: event.target.value })
                }
                aria-invalid={titleError ? true : undefined}
                aria-describedby={
                  titleError ? errorId(fieldId.title) : undefined
                }
              />
              <FieldMessage id={errorId(fieldId.title)} message={titleError} />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor={fieldId.goal}
                className="text-sm font-medium text-ink"
              >
                Objetivo{" "}
                <span className="font-normal text-ink-muted">(opcional)</span>
              </label>
              <Textarea
                id={fieldId.goal}
                value={state.goal}
                maxLength={LIMITS.goal}
                placeholder="Qué quieres averiguar con estas mediciones"
                onChange={(event) =>
                  dispatch({ type: "set_goal", value: event.target.value })
                }
                aria-invalid={goalError ? true : undefined}
                aria-describedby={goalError ? errorId(fieldId.goal) : undefined}
              />
              <FieldMessage id={errorId(fieldId.goal)} message={goalError} />
            </div>
          </section>

          <section
            aria-labelledby="variables-titulo"
            className="flex flex-col gap-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2
                id="variables-titulo"
                className="text-sm font-medium text-ink"
              >
                Variables
              </h2>
              <p className="text-sm text-ink-muted tabular-nums">
                {state.variables.length} de {LIMITS.variables}
              </p>
            </div>
            <VariableRows
              rows={state.variables}
              errors={errors}
              onChange={(key, field, value) =>
                dispatch({ type: "set_variable", key, field, value })
              }
              onRequiredChange={(key, value) =>
                dispatch({ type: "set_required", key, value })
              }
              onAdd={addRow}
              onRemove={removeRow}
            />
          </section>

          <div className="flex flex-col gap-4 border-t border-line pt-6">
            {alert ? (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-control bg-sunken px-4 py-3"
              >
                <CircleAlertIcon
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-danger"
                />
                <div className="flex flex-col gap-0.5 text-sm">
                  <p className="font-medium text-ink">No se creó el cuaderno</p>
                  <p className="text-ink-muted">{alert}</p>
                </div>
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                size="lg"
                onClick={() =>
                  pristine ? router.push(LIST_PATH) : setLeaveTo(LIST_PATH)
                }
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="lg"
                aria-disabled={create.isPending || undefined}
              >
                {create.isPending ? <Spinner /> : null}
                {create.isPending ? "Creando…" : "Crear cuaderno"}
              </Button>
            </div>
          </div>
        </form>

        <aside aria-labelledby="consejos" className="hidden xl:block">
          <div className="sticky top-10 flex flex-col gap-5 border-l border-line pl-8">
            <h2 id="consejos" className="text-sm font-medium text-ink">
              Antes de empezar
            </h2>
            <ul className="flex flex-col gap-5">
              {TIPS.map(({ title, text }) => (
                <li key={title} className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-ink">{title}</p>
                  <p className="text-sm text-ink-muted">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <Dialog
        open={leaveTo !== null}
        onOpenChange={(open) => (open ? undefined : setLeaveTo(null))}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Salir sin crear el cuaderno?</DialogTitle>
            <DialogDescription>Se perderá lo que escribiste.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setLeaveTo(null)}>
              Seguir editando
            </Button>
            <Button
              onClick={() => (leaveTo === null ? undefined : leave(leaveTo))}
            >
              Salir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { NotebookForm };
