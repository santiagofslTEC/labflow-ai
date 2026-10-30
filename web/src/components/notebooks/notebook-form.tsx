"use client";

import { CircleAlertIcon, ClipboardListIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useState } from "react";
import type * as React from "react";

import type { ApiFailure } from "@/api/experiments";
import { PageHeader } from "@/components/app-shell/page-header";
import { FolderPicker } from "@/components/folders/folder-picker";
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
import {
  useCreateExperiment,
  useReadInstructions,
} from "@/hooks/use-experiments";
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
import {
  INSTRUCTION_ERROR_CODES,
  chipLabel,
  type AttachedInstructions,
  type InstructionsInput,
  type PageRange,
} from "@/lib/instructions";

import { FieldMessage, errorId } from "./field-error";
import { InstructionsChip } from "./instructions-chip";
import { InstructionsPanel, type PanelPhase } from "./instructions-panel";
import { ADD_VARIABLE_ID, VariableRows } from "./variable-rows";

const LIST_PATH = "/cuadernos";
const CREATE_FAILED = "No pudimos crear el cuaderno. Inténtalo de nuevo.";

// An error the create route found in the attached instructions, shown next to
// the chip (AC-29).
const instructionsError = (error: ApiFailure | null): string | null =>
  error?.kind === "invalid" &&
  error.code !== undefined &&
  INSTRUCTION_ERROR_CODES.has(error.code)
    ? error.message
    : null;

// The alert above the buttons (AC-8). A 401 shows nothing: the client is
// already on its way to /access.
const failureMessage = (error: ApiFailure | null): string | null => {
  if (error === null || error.kind === "unauthorized") return null;
  if (instructionsError(error) !== null) return null;
  return error.kind === "invalid" && error.message
    ? error.message
    : CREATE_FAILED;
};

type ReadRequest = {
  readonly input: InstructionsInput;
  readonly range: PageRange | null;
};

// What a read attaches: the page numbers only after a successful read (AC-28).
const attach = (
  input: InstructionsInput,
  pages: {
    readonly pageCount: number;
    readonly readFromPage: number | null;
    readonly readToPage: number | null;
  } | null,
): AttachedInstructions =>
  input.kind === "text"
    ? { kind: "text", text: input.text }
    : {
        kind: "pdf",
        file: input.file,
        pageCount: pages?.pageCount ?? null,
        readFromPage: pages?.readFromPage ?? null,
        readToPage: pages?.readToPage ?? null,
      };

type Banner = { readonly found: number; readonly shown: number };

const IDLE: PanelPhase = { kind: "idle" };

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

// /cuadernos/nuevo (spec 0005, AC-3 to AC-9, AC-18 to AC-29). It opens on the
// instructions panel; the form appears after a read or after Llenar a mano.
type NotebookFormProps = {
  // The class folder it starts in, from `?carpeta=` (2026-10-30).
  readonly defaultFolderId?: number | null;
};

function NotebookForm({ defaultFolderId = null }: NotebookFormProps) {
  const router = useRouter();
  const [folderId, setFolderId] = useState<number | null>(defaultFolderId);
  const [state, dispatch] = useReducer(formReducer, initialFormState);
  const [submitted, setSubmitted] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const create = useCreateExperiment();
  const reader = useReadInstructions();
  const [panelOpen, setPanelOpen] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [phase, setPhase] = useState<PanelPhase>(IDLE);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  // Quitar remounts the panel, which clears its file picker and text area.
  const [panelKey, setPanelKey] = useState(0);
  const [pendingReplace, setPendingReplace] = useState<ReadRequest | null>(
    null,
  );
  const lastRead = useRef<ReadRequest | null>(null);
  const abort = useRef<AbortController | null>(null);
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
    create.mutate(
      {
        body: { ...toCreateBody(state), folder_id: folderId },
        instructions: state.instructions,
      },
      {
        onSuccess: (created) => leave(`/cuadernos/${created.id}`),
        onError: () => {
          inFlight.current = false;
        },
      },
    );
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
    setFormOpen(true);
    dispatch({ type: "fill_example" });
  };

  const sendRead = async (request: ReadRequest) => {
    lastRead.current = request;
    const controller = new AbortController();
    abort.current = controller;
    const waiting = phase;
    setPhase({ kind: "reading" });
    setPanelMessage(null);
    setReadFailed(false);
    const result = await reader.mutateAsync({
      ...request,
      signal: controller.signal,
    });
    if (abort.current !== controller) return; // a newer read or a cancel
    abort.current = null;
    if (result.ok && result.data.kind === "proposal") {
      const proposal = result.data;
      dispatch({
        type: "fill_from_proposal",
        proposal,
        attached: attach(request.input, {
          pageCount: proposal.page_count,
          readFromPage: proposal.read_from_page,
          readToPage: proposal.read_to_page,
        }),
      });
      setBanner({
        found: proposal.found_count,
        shown: proposal.variables.length,
      });
      setPhase(IDLE);
      setFormOpen(true);
      focusNext.current = fieldId.title;
      return;
    }
    if (result.ok) {
      setPhase({ kind: "needs_pages", pageCount: result.data.page_count });
      return;
    }
    const keep = waiting.kind === "needs_pages" ? waiting : IDLE;
    switch (result.error.kind) {
      case "rejected":
        setPhase(keep);
        setPanelMessage(result.error.message);
        return;
      case "unavailable":
        setPhase(IDLE);
        setReadFailed(true);
        dispatch({
          type: "attach_instructions",
          attached: attach(request.input, null),
        });
        setFormOpen(true);
        return;
      case "aborted":
      case "unauthorized":
        setPhase(keep);
        return;
    }
  };

  // Replacing what you typed asks first (AC-27).
  const read = (input: InstructionsInput, range: PageRange | null) => {
    const request = { input, range };
    if (!isPristine(state)) {
      setPendingReplace(request);
      return;
    }
    void sendRead(request);
  };

  // Starlette keeps the handler running; only the browser stops (accepted).
  const cancelRead = () => {
    const controller = abort.current;
    abort.current = null;
    controller?.abort();
    setPhase(IDLE);
  };

  const retryRead = () => {
    if (lastRead.current !== null) void sendRead(lastRead.current);
  };

  const detach = () => {
    dispatch({ type: "detach_instructions" });
    setPanelKey((key) => key + 1);
    setPhase(IDLE);
    setPanelMessage(null);
    setReadFailed(false);
    create.reset();
  };

  const fillByHand = () => {
    setPanelOpen(false);
    setFormOpen(true);
    focusNext.current = fieldId.title;
  };

  const alert = failureMessage(create.error);
  const chipError = instructionsError(create.error);
  const titleError = errors[fieldId.title];
  const goalError = errors[fieldId.goal];
  const contextError = errors[fieldId.context];
  const contextCountId = `${fieldId.context}-cuenta`;

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
        <div className="flex min-w-0 flex-col gap-8">
          {panelOpen ? (
            <InstructionsPanel
              key={panelKey}
              phase={phase}
              message={panelMessage}
              failed={readFailed}
              showManual={!formOpen}
              onRead={read}
              onCancelRead={cancelRead}
              onRetry={retryRead}
              onManual={fillByHand}
              onInputChange={() => {
                setPanelMessage(null);
                if (phase.kind === "needs_pages") setPhase(IDLE);
              }}
            />
          ) : state.instructions === null ? (
            <Button
              variant="ghost"
              className="w-fit"
              onClick={() => setPanelOpen(true)}
            >
              <SparklesIcon aria-hidden />
              Leer instrucciones
            </Button>
          ) : null}

          {formOpen ? (
            <form
              noValidate
              onSubmit={onSubmit}
              aria-label="Nuevo cuaderno"
              className="flex min-w-0 flex-col gap-10"
            >
              {banner !== null || state.instructions !== null ? (
                <div className="flex flex-col gap-3">
                  {banner !== null ? (
                    <div className="border-l-2 border-control bg-sunken px-4 py-3 text-sm text-ink">
                      <p>
                        Propuesto desde tus instrucciones. Revisa antes de
                        crear.
                      </p>
                      {banner.found > banner.shown ? (
                        <p className="text-ink-muted">
                          Encontramos {banner.found} variables; dejamos{" "}
                          {banner.shown}. Quita o cambia las que quieras.
                        </p>
                      ) : null}
                      {banner.shown === 0 ? (
                        <p className="text-ink-muted">
                          No encontramos variables en las instrucciones.
                          Agrégalas a mano.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {state.instructions !== null ? (
                    <InstructionsChip
                      label={chipLabel(state.instructions)}
                      error={chipError}
                      onRemove={detach}
                    />
                  ) : null}
                </div>
              ) : null}

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
                  <FieldMessage
                    id={errorId(fieldId.title)}
                    message={titleError}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="notebook-folder"
                    className="text-sm font-medium text-ink"
                  >
                    Carpeta{" "}
                    <span className="font-normal text-ink-muted">
                      (opcional)
                    </span>
                  </label>
                  <FolderPicker
                    id="notebook-folder"
                    label="Carpeta"
                    value={folderId}
                    onChange={setFolderId}
                    className="w-full sm:w-72"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor={fieldId.goal}
                    className="text-sm font-medium text-ink"
                  >
                    Objetivo{" "}
                    <span className="font-normal text-ink-muted">
                      (opcional)
                    </span>
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
                    aria-describedby={
                      goalError ? errorId(fieldId.goal) : undefined
                    }
                  />
                  <FieldMessage
                    id={errorId(fieldId.goal)}
                    message={goalError}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <label
                      htmlFor={fieldId.context}
                      className="text-sm font-medium text-ink"
                    >
                      Contexto para la captura{" "}
                      <span className="font-normal text-ink-muted">
                        (opcional)
                      </span>
                    </label>
                    <p
                      id={contextCountId}
                      className="text-xs text-ink-muted tabular-nums"
                    >
                      {state.context.length}/{LIMITS.context}
                    </p>
                  </div>
                  <Textarea
                    id={fieldId.context}
                    value={state.context}
                    placeholder="Qué se mide, cómo se organizan los ensayos, condiciones clave"
                    onChange={(event) =>
                      dispatch({
                        type: "set_context",
                        value: event.target.value,
                      })
                    }
                    aria-invalid={contextError ? true : undefined}
                    aria-describedby={
                      contextError
                        ? `${errorId(fieldId.context)} ${contextCountId}`
                        : contextCountId
                    }
                  />
                  <FieldMessage
                    id={errorId(fieldId.context)}
                    message={contextError}
                  />
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
                      <p className="font-medium text-ink">
                        No se creó el cuaderno
                      </p>
                      <p className="text-ink-muted">{alert}</p>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-col-reverse gap-3 max-lg:sticky max-lg:bottom-[var(--tabbar-height)] max-lg:z-20 max-lg:-mx-4 max-lg:border-t max-lg:border-line max-lg:bg-surface/95 max-lg:px-4 max-lg:py-3 max-lg:backdrop-blur-md sm:flex-row sm:justify-end">
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
          ) : null}
        </div>

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
        open={pendingReplace !== null}
        onOpenChange={(open) => (open ? undefined : setPendingReplace(null))}
      >
        <DialogContent variant="alert" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              ¿Reemplazar lo que escribiste con lo que leímos?
            </DialogTitle>
            <DialogDescription>
              El formulario se llenará con lo que encontremos en las
              instrucciones.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPendingReplace(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const request = pendingReplace;
                setPendingReplace(null);
                if (request !== null) void sendRead(request);
              }}
            >
              Reemplazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={leaveTo !== null}
        onOpenChange={(open) => (open ? undefined : setLeaveTo(null))}
      >
        <DialogContent variant="alert" showCloseButton={false}>
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
