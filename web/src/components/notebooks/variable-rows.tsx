"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LIMITS,
  UNIT_SUGGESTIONS,
  fieldId,
  type FormErrors,
  type VariableField,
  type VariableRow,
} from "@/lib/experiment-form";
import { cn } from "@/lib/utils";

import { FieldMessage, errorId } from "./field-error";

export const ADD_VARIABLE_ID = "agregar-variable";
const UNITS_LIST_ID = "unidades-sugeridas";
const LIMIT_HINT_ID = "variables-limite";

// From 640px: one row per variable under column headers. Below: each row is a
// block, with Nombre and Unidad on one line and Mín, Máx, Esperada on the next.
const COLUMNS = "sm:grid-cols-[minmax(0,1fr)_7rem_5.5rem_5.5rem_5.5rem_2.5rem]";

type VariableRowsProps = {
  readonly rows: readonly VariableRow[];
  readonly errors: FormErrors;
  readonly onChange: (key: number, field: VariableField, value: string) => void;
  readonly onRequiredChange: (key: number, value: boolean) => void;
  readonly onAdd: () => void;
  readonly onRemove: (key: number) => void;
};

function VariableRows({
  rows,
  errors,
  onChange,
  onRequiredChange,
  onAdd,
  onRemove,
}: VariableRowsProps) {
  const full = rows.length >= LIMITS.variables;

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-hidden
        className={cn(
          "hidden gap-x-2 border-b border-line pb-2 text-xs text-ink-muted sm:grid",
          COLUMNS,
        )}
      >
        <span>Nombre</span>
        <span>Unidad</span>
        <span>Mín</span>
        <span>Máx</span>
        <span className="text-center">Esperada</span>
        <span />
      </div>

      <ol className="flex flex-col">
        {rows.map((row, index) => (
          <VariableRowFields
            key={row.key}
            row={row}
            number={index + 1}
            errors={errors}
            removable={rows.length > 1}
            onChange={onChange}
            onRequiredChange={onRequiredChange}
            onRemove={onRemove}
          />
        ))}
      </ol>

      <datalist id={UNITS_LIST_ID}>
        {UNIT_SUGGESTIONS.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          id={ADD_VARIABLE_ID}
          variant="secondary"
          onClick={onAdd}
          disabled={full}
          aria-describedby={full ? LIMIT_HINT_ID : undefined}
        >
          <PlusIcon aria-hidden />
          Agregar variable
        </Button>
        {full ? (
          <p id={LIMIT_HINT_ID} className="text-sm text-ink-muted">
            Máximo {LIMITS.variables} variables
          </p>
        ) : null}
      </div>
    </div>
  );
}

type VariableRowFieldsProps = {
  readonly row: VariableRow;
  readonly number: number;
  readonly errors: FormErrors;
  readonly removable: boolean;
  readonly onChange: VariableRowsProps["onChange"];
  readonly onRequiredChange: VariableRowsProps["onRequiredChange"];
  readonly onRemove: VariableRowsProps["onRemove"];
};

function VariableRowFields({
  row,
  number,
  errors,
  removable,
  onChange,
  onRequiredChange,
  onRemove,
}: VariableRowFieldsProps) {
  // Where the proposed range came from (AC-24), tied to Mín and Máx.
  const quote = row.proposedRange ?? null;
  const quoteId = `variable-${row.key}-cita`;
  const text = (
    field: VariableField,
    label: string,
    props: Omit<React.ComponentProps<"input">, "value">,
  ) => (
    <RowTextField
      id={fieldId.variable(row.key, field)}
      label={label}
      number={number}
      value={row[field]}
      error={errors[fieldId.variable(row.key, field)]}
      onValue={(value) => onChange(row.key, field, value)}
      describedBy={
        quote !== null && (field === "min" || field === "max")
          ? quoteId
          : undefined
      }
      {...props}
    />
  );
  const requiredId = fieldId.variable(row.key, "required");

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_6.5rem] gap-x-2 gap-y-2 border-b border-line py-3 sm:items-start sm:gap-y-0",
        COLUMNS,
      )}
    >
      <p
        aria-hidden
        className="col-start-1 row-start-1 self-center text-sm font-medium text-ink sm:hidden"
      >
        Variable {number}
      </p>

      {text("name", "Nombre", {
        maxLength: LIMITS.name,
        placeholder: "Temperatura",
        autoComplete: "off",
      })}
      {text("unit", "Unidad", {
        maxLength: LIMITS.unit,
        placeholder: "°C",
        list: UNITS_LIST_ID,
        autoComplete: "off",
        className: "font-mono",
      })}

      <div className="col-span-full grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-2 sm:contents">
        {text("min", "Mín", {
          inputMode: "decimal",
          placeholder: "—",
          autoComplete: "off",
          className: "font-mono tabular-nums",
        })}
        {text("max", "Máx", {
          inputMode: "decimal",
          placeholder: "—",
          autoComplete: "off",
          className: "font-mono tabular-nums",
        })}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={requiredId}
            className="text-xs text-ink-muted sm:sr-only"
          >
            Esperada<span className="sr-only">, variable {number}</span>
          </label>
          <div className="flex h-10 items-center sm:justify-center">
            <input
              id={requiredId}
              type="checkbox"
              checked={row.required}
              onChange={(event) =>
                onRequiredChange(row.key, event.target.checked)
              }
              className="size-5 cursor-pointer rounded accent-ink focus-ring"
            />
          </div>
        </div>
      </div>

      <Button
        id={fieldId.variable(row.key, "remove")}
        variant="ghost"
        size="icon"
        onClick={() => onRemove(row.key)}
        disabled={!removable}
        aria-label={`Quitar variable ${number}`}
        className="col-start-2 row-start-1 justify-self-end sm:col-start-6 sm:row-start-1"
      >
        <Trash2Icon aria-hidden />
      </Button>

      {quote !== null ? (
        <p
          id={quoteId}
          className="col-span-full pt-1 text-xs text-ink-muted sm:pt-2"
        >
          <span className="sr-only">Rango tomado de tus instrucciones: </span>«
          {quote.quote}»{quote.page !== null ? ` · p. ${quote.page}` : ""}
        </p>
      ) : null}
    </li>
  );
}

type RowTextFieldProps = Omit<React.ComponentProps<"input">, "value"> & {
  readonly id: string;
  readonly label: string;
  readonly number: number;
  readonly value: string;
  readonly error: string | undefined;
  readonly describedBy?: string | undefined;
  readonly onValue: (value: string) => void;
};

// Each label names its row ("Nombre, variable 2"); from 640px the visible
// column headers take over and the label is read by screen readers only.
function RowTextField({
  id,
  label,
  number,
  value,
  error,
  describedBy,
  onValue,
  className,
  ...props
}: RowTextFieldProps) {
  const described =
    [error ? errorId(id) : null, describedBy ?? null]
      .filter((part) => part !== null)
      .join(" ") || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs text-ink-muted sm:sr-only">
        {label}
        <span className="sr-only">, variable {number}</span>
      </label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onValue(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        className={className}
        {...props}
      />
      <FieldMessage id={errorId(id)} message={error} />
    </div>
  );
}

export { VariableRows };
