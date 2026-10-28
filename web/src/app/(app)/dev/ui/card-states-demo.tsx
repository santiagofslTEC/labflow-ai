"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ProposalCard } from "@/components/proposal-card/proposal-card";
import type { ProposalCardProps } from "@/components/proposal-card/types";
import { Button } from "@/components/ui/button";

import {
  SAMPLE_PH_VALUE,
  SAMPLE_PHRASE,
  SAMPLE_PROPOSAL_VALUES,
} from "./sample-data";
import { StatePicker } from "./state-picker";

type Example = Pick<
  ProposalCardProps,
  "state" | "values" | "trialNumber" | "phrase" | "source"
>;

const base = {
  values: SAMPLE_PROPOSAL_VALUES,
  trialNumber: 3,
  phrase: SAMPLE_PHRASE,
  source: "voice",
} as const;

const withMissing = SAMPLE_PROPOSAL_VALUES.map((v) =>
  v.variableId === 2 ? { ...v, value: null } : v,
);

const EXAMPLES: Readonly<Record<string, { label: string; example: Example }>> =
  {
    proposed: {
      label: "proposed",
      example: { ...base, state: { kind: "proposed" } },
    },
    editing: {
      label: "editing (Rendimiento)",
      example: { ...base, state: { kind: "editing", variableId: 3 } },
    },
    saving: {
      label: "saving",
      example: { ...base, state: { kind: "saving" } },
    },
    saved: {
      label: "saved (se cierra solo)",
      example: { ...base, state: { kind: "saved" } },
    },
    needs_clarification: {
      label: "needs_clarification",
      example: {
        ...base,
        values: withMissing,
        phrase: "Ensayo 3, 50 grados, rendimiento 73,5",
        state: {
          kind: "needs_clarification",
          question: "¿Cuántos minutos duró el ensayo 3?",
        },
      },
    },
    correction: {
      label: "correction",
      example: {
        ...base,
        phrase: "No, el ensayo 3 fue a 50 grados",
        source: "text",
        values: SAMPLE_PROPOSAL_VALUES.map((v) =>
          v.variableId === 1
            ? { ...v, previous: 48 }
            : { ...v, previous: v.value },
        ),
        state: { kind: "correction" },
      },
    },
    save_error: {
      label: "save_error",
      example: {
        ...base,
        state: {
          kind: "save_error",
          message: "La base de datos no respondió. Tus valores siguen aquí.",
        },
      },
    },
    warning: {
      label: "proposed con aviso de rango",
      example: {
        ...base,
        phrase: "Ensayo 3, temperatura 500 grados",
        values: SAMPLE_PROPOSAL_VALUES.map((v) =>
          v.variableId === 1
            ? {
                ...v,
                value: 500,
                warning: "Fuera del rango esperado (20 a 100 °C).",
              }
            : v,
        ),
        state: { kind: "proposed" },
      },
    },
    missing: {
      label: "proposed con un valor vacío",
      example: { ...base, values: withMissing, state: { kind: "proposed" } },
    },
    unitless: {
      label: "proposed sin unidad (pH) y ensayo ?",
      example: {
        ...base,
        trialNumber: null,
        phrase: "pH siete coma dos",
        source: "text",
        values: [SAMPLE_PH_VALUE],
        state: { kind: "proposed" },
      },
    },
  };

const OPTIONS = Object.entries(EXAMPLES).map(([value, { label }]) => ({
  value,
  label,
}));

const announce = (name: string, detail?: string) => () =>
  toast(`${name}${detail ? `: ${detail}` : ""}`);

function CardStatesDemo() {
  const [key, setKey] = useState("proposed");
  const [settled, setSettled] = useState(false);
  const { example } = EXAMPLES[key] ?? EXAMPLES.proposed;

  return (
    <div className="flex flex-col gap-6">
      <StatePicker
        id="card-state"
        label="Estado de la tarjeta"
        value={key}
        options={OPTIONS}
        onChange={(value) => {
          setKey(value);
          setSettled(false);
        }}
      />
      <div className="max-w-xl">
        {settled ? (
          <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-line p-6 text-sm text-ink-muted">
            <p>
              La tarjeta guardada se cerró y llamó a <code>onSettled</code>.
            </p>
            <Button variant="secondary" onClick={() => setSettled(false)}>
              Mostrar otra vez
            </Button>
          </div>
        ) : (
          <ProposalCard
            key={key}
            {...example}
            layoutIdPrefix="gallery"
            onConfirm={announce("onConfirm")}
            onEdit={(id) => toast(`onEdit: variable ${id}`)}
            onCommitEdit={(id, value) =>
              toast(`onCommitEdit: variable ${id} = ${value}`)
            }
            onCancelEdit={announce("onCancelEdit")}
            onDiscard={announce("onDiscard")}
            onRetry={announce("onRetry")}
            onSettled={() => setSettled(true)}
          />
        )}
      </div>
    </div>
  );
}

export { CardStatesDemo };
