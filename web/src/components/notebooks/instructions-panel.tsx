"use client";

import { CircleAlertIcon, RotateCwIcon, SparklesIcon } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  INSTRUCTION_MESSAGES,
  checkInstructionsInput,
  checkPageRange,
  type InstructionsInput,
  type PageRange,
} from "@/lib/instructions";
import { cn } from "@/lib/utils";

import { FieldMessage } from "./field-error";

type Mode = "pdf" | "text";

export type PanelPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "reading" }
  | { readonly kind: "needs_pages"; readonly pageCount: number };

type InstructionsPanelProps = {
  readonly phase: PanelPhase;
  // A 409, 413, or 422 from the read (AC-28, AC-30).
  readonly message: string | null;
  // 503, 5xx, or the network (AC-28).
  readonly failed: boolean;
  // Llenar a mano only makes sense while the form is still hidden.
  readonly showManual: boolean;
  readonly onRead: (input: InstructionsInput, range: PageRange | null) => void;
  readonly onCancelRead: () => void;
  readonly onRetry: () => void;
  readonly onManual: () => void;
  // Any change to the input drops a page question or message about the old one.
  readonly onInputChange: () => void;
};

const MODES = [
  { value: "pdf", label: "Subir PDF" },
  { value: "text", label: "Pegar texto" },
] as const;

// "Desde instrucciones" on /cuadernos/nuevo (spec 0005, AC-19 to AC-22, AC-28,
// AC-35). It keeps what you chose or pasted; the form owns the read itself.
function InstructionsPanel({
  phase,
  message,
  failed,
  showManual,
  onRead,
  onCancelRead,
  onRetry,
  onManual,
  onInputChange,
}: InstructionsPanelProps) {
  const ids = useId();
  const [mode, setMode] = useState<Mode>("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [fromPage, setFromPage] = useState("");
  const [toPage, setToPage] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const reading = phase.kind === "reading";

  const changed = () => {
    setInputError(null);
    setRangeError(null);
    onInputChange();
  };

  const read = () => {
    if (reading) return;
    if (mode === "pdf" && file === null) {
      setInputError(INSTRUCTION_MESSAGES.notPdf);
      return;
    }
    const input: InstructionsInput =
      mode === "pdf" && file !== null
        ? { kind: "pdf", file }
        : { kind: "text", text };
    const error = checkInstructionsInput(input);
    setInputError(error);
    if (error !== null) return;
    if (phase.kind !== "needs_pages") {
      onRead(input, null);
      return;
    }
    const range = checkPageRange(fromPage, toPage, phase.pageCount);
    if ("error" in range) {
      setRangeError(range.error);
      return;
    }
    setRangeError(null);
    onRead(input, range);
  };

  const fileId = `${ids}-archivo`;
  const textId = `${ids}-texto`;
  const hintId = `${ids}-pista`;
  const inputErrorId = `${ids}-error`;
  const rangeErrorId = `${ids}-paginas-error`;

  return (
    <section
      aria-labelledby={`${ids}-titulo`}
      className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 shadow-control sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2
          id={`${ids}-titulo`}
          className="flex items-center gap-2 text-base font-medium text-ink"
        >
          <SparklesIcon aria-hidden className="size-4 text-ink-muted" />
          Desde instrucciones
        </h2>
        <p className="text-sm text-ink-muted">
          LabFlow lee tu guía de práctica y llena el cuaderno. Tú revisas antes
          de crearlo.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Cómo nos das las instrucciones</legend>
        <div className="flex w-fit gap-1 rounded-control bg-sunken p-1">
          {MODES.map(({ value, label }) => (
            <label
              key={value}
              className={cn(
                "flex h-10 cursor-pointer items-center rounded-control px-4 text-sm text-ink-muted transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
                mode === value && "bg-surface text-ink shadow-control",
              )}
            >
              <input
                type="radio"
                name={`${ids}-modo`}
                value={value}
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  changed();
                }}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "pdf" ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={fileId} className="text-sm font-medium text-ink">
            Archivo PDF
          </label>
          <input
            id={fileId}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              changed();
            }}
            aria-invalid={inputError ? true : undefined}
            aria-describedby={inputError ? inputErrorId : undefined}
            className="w-full min-w-0 rounded-control border border-control bg-surface text-sm text-ink-muted shadow-control focus-ring file:mr-3 file:h-10 file:border-0 file:border-r file:border-line file:bg-sunken file:px-4 file:text-sm file:text-ink"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={textId} className="text-sm font-medium text-ink">
            Instrucciones
          </label>
          <Textarea
            id={textId}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              changed();
            }}
            placeholder="Pega aquí la parte de tu guía de práctica"
            className="max-h-80 min-h-32"
            aria-invalid={inputError ? true : undefined}
            aria-describedby={inputError ? inputErrorId : undefined}
          />
        </div>
      )}
      <FieldMessage id={inputErrorId} message={inputError ?? undefined} />

      <div aria-live="polite" className="flex flex-col gap-4 empty:hidden">
        {phase.kind === "needs_pages" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink">
              Este PDF tiene {phase.pageCount} páginas y es muy largo para
              leerlo completo. ¿Qué páginas son de tu práctica?
            </p>
            <div className="flex flex-wrap gap-3">
              <PageField
                label="Desde"
                value={fromPage}
                max={phase.pageCount}
                invalid={rangeError !== null}
                describedBy={rangeErrorId}
                onValue={setFromPage}
              />
              <PageField
                label="Hasta"
                value={toPage}
                max={phase.pageCount}
                invalid={rangeError !== null}
                describedBy={rangeErrorId}
                onValue={setToPage}
              />
            </div>
            <FieldMessage id={rangeErrorId} message={rangeError ?? undefined} />
          </div>
        ) : null}
        {message ? (
          <p className="flex items-start gap-1.5 text-sm text-ink">
            <CircleAlertIcon
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-danger"
            />
            {message}
          </p>
        ) : null}
        {failed ? (
          <div className="flex flex-col items-start gap-3 rounded-control bg-sunken px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm text-ink">
              <CircleAlertIcon
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-danger"
              />
              {INSTRUCTION_MESSAGES.readFailed}
            </p>
            <Button variant="secondary" onClick={onRetry}>
              <RotateCwIcon aria-hidden />
              Reintentar
            </Button>
          </div>
        ) : null}
        {reading ? (
          <p id={hintId} className="text-sm text-ink-muted">
            Leyendo instrucciones… Puede tardar hasta un minuto.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          onClick={read}
          aria-disabled={reading || undefined}
          aria-describedby={reading ? hintId : undefined}
        >
          {reading ? <Spinner /> : null}
          {reading ? "Leyendo instrucciones…" : "Leer instrucciones"}
        </Button>
        {reading ? (
          <Button variant="ghost" size="lg" onClick={onCancelRead}>
            Cancelar lectura
          </Button>
        ) : showManual ? (
          <Button variant="ghost" size="lg" onClick={onManual}>
            Llenar a mano
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function PageField({
  label,
  value,
  max,
  invalid,
  describedBy,
  onValue,
}: {
  readonly label: string;
  readonly value: string;
  readonly max: number;
  readonly invalid: boolean;
  readonly describedBy: string;
  readonly onValue: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex w-28 flex-col gap-1">
      <label htmlFor={id} className="text-xs text-ink-muted">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        inputMode="numeric"
        autoComplete="off"
        placeholder={label === "Desde" ? "1" : String(max)}
        onChange={(event) => onValue(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? describedBy : undefined}
        className="font-mono tabular-nums"
      />
    </div>
  );
}

export { InstructionsPanel };
