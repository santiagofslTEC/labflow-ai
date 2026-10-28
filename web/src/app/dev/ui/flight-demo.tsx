"use client";

import { RotateCcwIcon } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { ProposalCard } from "@/components/proposal-card/proposal-card";
import type {
  ProposalCardState,
  ProposalValue,
} from "@/components/proposal-card/types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableNumberCell,
  TableRow,
} from "@/components/ui/table";
import { formatQuantity } from "@/lib/format";
import { spring } from "@/lib/motion";

import {
  SAMPLE_PHRASE,
  SAMPLE_PROPOSAL_VALUES,
  SAMPLE_TRIALS,
  SAMPLE_VARIABLES,
  type SampleTrial,
} from "./sample-data";

const SAVE_DELAY_MS = 700;
const NEW_TRIAL = 3;
const cellLayoutId = (trial: number, variableId: number) =>
  `trial-${trial}-${variableId}`;

// The card to table flight (AC-15): confirm the card and each value flies into
// its cell of the new row, then the card collapses and settles.
function FlightDemo() {
  const [run, setRun] = useState(0);
  const [trials, setTrials] = useState<readonly SampleTrial[]>(
    SAMPLE_TRIALS.slice(0, 2),
  );
  const [values, setValues] = useState<readonly ProposalValue[]>(
    SAMPLE_PROPOSAL_VALUES,
  );
  const [state, setState] = useState<ProposalCardState>({ kind: "proposed" });
  const [showCard, setShowCard] = useState(true);
  const [failNext, setFailNext] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const save = () => {
    setState({ kind: "saving" });
    timer.current = window.setTimeout(() => {
      if (failNext) {
        setFailNext(false);
        setState({
          kind: "save_error",
          message: "La base de datos tardó demasiado. Tus valores siguen aquí.",
        });
        return;
      }
      setState({ kind: "saved" });
      setTrials((rows) => [
        ...rows,
        { trialNumber: NEW_TRIAL, values: values.map((v) => v.value ?? 0) },
      ]);
    }, SAVE_DELAY_MS);
  };

  const reset = () => {
    window.clearTimeout(timer.current);
    setTrials(SAMPLE_TRIALS.slice(0, 2));
    setValues(SAMPLE_PROPOSAL_VALUES);
    setState({ kind: "proposed" });
    setShowCard(true);
    setRun((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={reset}>
          <RotateCcwIcon data-icon="inline-start" aria-hidden />
          Repetir la demostración
        </Button>
        <Button
          variant="ghost"
          aria-pressed={failNext}
          onClick={() => setFailNext((on) => !on)}
        >
          {failNext
            ? "El próximo guardado fallará"
            : "Simular un fallo al guardar"}
        </Button>
      </div>

      <LayoutGroup id={`flight-${run}`}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
          <div className="flex min-h-80 flex-col justify-end">
            {showCard ? (
              <ProposalCard
                key={run}
                trialNumber={NEW_TRIAL}
                values={values}
                layoutIdPrefix={`trial-${NEW_TRIAL}`}
                phrase={SAMPLE_PHRASE}
                source="voice"
                state={state}
                onConfirm={save}
                onRetry={save}
                onEdit={(variableId) =>
                  setState({ kind: "editing", variableId })
                }
                onCommitEdit={(variableId, value) => {
                  setValues((current) =>
                    current.map((v) =>
                      v.variableId === variableId ? { ...v, value } : v,
                    ),
                  );
                  setState({ kind: "proposed" });
                }}
                onCancelEdit={() => setState({ kind: "proposed" })}
                onDiscard={() => setShowCard(false)}
                onSettled={() => setShowCard(false)}
              />
            ) : (
              <p className="rounded-card border border-dashed border-line p-6 text-sm text-ink-muted">
                La tarjeta terminó y llamó a <code>onSettled</code>. Pulsa
                «Repetir la demostración» para verlo otra vez.
              </p>
            )}
          </div>

          <Table containerClassName="lg:overflow-visible">
            <TableHeader>
              <TableRow>
                <TableHead>Ensayo</TableHead>
                {SAMPLE_VARIABLES.map((variable) => (
                  <TableHead key={variable.id} className="text-right">
                    {variable.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {trials.map((trial) => (
                <TableRow key={trial.trialNumber}>
                  <TableCell className="font-mono text-cell tabular-nums">
                    {trial.trialNumber}
                  </TableCell>
                  {SAMPLE_VARIABLES.map((variable, index) => (
                    <TableNumberCell key={variable.id}>
                      <motion.span
                        layoutId={cellLayoutId(trial.trialNumber, variable.id)}
                        layout="position"
                        transition={spring.gentle}
                        className="inline-block"
                      >
                        {formatQuantity(
                          trial.values[index] ?? 0,
                          variable.unit,
                        )}
                      </motion.span>
                    </TableNumberCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </LayoutGroup>
    </div>
  );
}

export { FlightDemo };
