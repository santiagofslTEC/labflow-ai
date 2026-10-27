"use client";

import { BotIcon, MicIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { WorkspaceLayout } from "@/components/app-shell/workspace-layout";
import { MicDock } from "@/components/mic-dock/mic-dock";
import type { MicDockState } from "@/components/mic-dock/types";
import { ProposalCard } from "@/components/proposal-card/proposal-card";
import type { ProposalCardState } from "@/components/proposal-card/types";
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

import {
  SAMPLE_PHRASE,
  SAMPLE_PROPOSAL_VALUES,
  SAMPLE_TRIALS,
  SAMPLE_VARIABLES,
  type SampleTrial,
} from "../sample-data";

const TURNS = [
  {
    role: "user",
    text: "Ensayo 1, 40 grados, 15 minutos, rendimiento 58 por ciento",
  },
  { role: "assistant", text: "Guardé el ensayo 1." },
  { role: "user", text: "Ensayo 2, 45 grados, 15 minutos, 64 por ciento" },
  { role: "assistant", text: "Guardé el ensayo 2." },
  { role: "user", text: SAMPLE_PHRASE },
] as const;

function Conversation() {
  return (
    <ol aria-label="Conversación" className="flex flex-col gap-3">
      {TURNS.map((turn, index) => (
        <li
          key={index}
          className={
            turn.role === "user"
              ? "ml-auto flex max-w-[85%] items-start gap-2 rounded-card rounded-br-md bg-ink px-4 py-3 text-sm text-on-ink"
              : "flex max-w-[85%] items-start gap-2 rounded-card rounded-bl-md border border-line bg-surface px-4 py-3 text-sm text-ink"
          }
        >
          {turn.role === "user" ? (
            <MicIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : (
            <BotIcon
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-saved"
            />
          )}
          <span>
            <span className="sr-only">
              {turn.role === "user" ? "Tú: " : "LabFlow: "}
            </span>
            {turn.text}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TrialsTable({ trials }: { readonly trials: readonly SampleTrial[] }) {
  return (
    <Table>
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
                {formatQuantity(trial.values[index] ?? 0, variable.unit)}
              </TableNumberCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// PLACEHOLDER: feature 9 replaces this with the Plotly chart built on the chart tokens.
function ChartPlaceholder({
  trials,
}: {
  readonly trials: readonly SampleTrial[];
}) {
  const points = trials.map((trial) => ({
    x: trial.values[0] ?? 0,
    y: trial.values[2] ?? 0,
  }));
  const sx = (x: number) => 40 + ((x - 35) / 30) * 340;
  const sy = (y: number) => 200 - ((y - 50) / 40) * 170;
  return (
    <figure className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
      <figcaption className="text-sm font-semibold text-ink">
        Rendimiento vs. temperatura
      </figcaption>
      <svg
        viewBox="0 0 400 220"
        role="img"
        aria-label={`Rendimiento según la temperatura, ${points.length} ensayos`}
        className="h-auto w-full"
      >
        <line x1="40" y1="200" x2="380" y2="200" className="stroke-line" />
        <line x1="40" y1="20" x2="40" y2="200" className="stroke-line" />
        <polyline
          points={points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}
          fill="none"
          strokeWidth="2.5"
          className="stroke-chart-1"
        />
        {points.map((p) => (
          <circle
            key={p.x}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r="5"
            className="fill-chart-1"
          />
        ))}
      </svg>
    </figure>
  );
}

function WorkspaceDemo() {
  const [trials, setTrials] = useState<readonly SampleTrial[]>(
    SAMPLE_TRIALS.slice(0, 2),
  );
  const [cardState, setCardState] = useState<ProposalCardState | null>({
    kind: "proposed",
  });
  const [dockState, setDockState] = useState<MicDockState>({ kind: "idle" });
  const [text, setText] = useState("");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const confirm = () => {
    setCardState({ kind: "saving" });
    timer.current = window.setTimeout(() => {
      setCardState({ kind: "saved" });
      setTrials((rows) => [...rows, SAMPLE_TRIALS[2] ?? SAMPLE_TRIALS[0]]);
    }, 700);
  };

  return (
    <WorkspaceLayout
      conversation={<Conversation />}
      card={
        cardState ? (
          <ProposalCard
            trialNumber={3}
            values={SAMPLE_PROPOSAL_VALUES}
            phrase={SAMPLE_PHRASE}
            source="voice"
            state={cardState}
            onConfirm={confirm}
            onRetry={confirm}
            onEdit={(variableId) =>
              setCardState({ kind: "editing", variableId })
            }
            onCommitEdit={() => setCardState({ kind: "proposed" })}
            onCancelEdit={() => setCardState({ kind: "proposed" })}
            onDiscard={() => setCardState(null)}
            onSettled={() => setCardState(null)}
          />
        ) : undefined
      }
      table={<TrialsTable trials={trials} />}
      chart={<ChartPlaceholder trials={trials} />}
      dock={
        <MicDock
          state={dockState}
          text={text}
          onTextChange={setText}
          onSubmitText={() => setText("")}
          onStart={() =>
            setDockState({ kind: "unavailable", reason: "insecure" })
          }
          onStop={() => setDockState({ kind: "idle" })}
          onRetry={() => setDockState({ kind: "idle" })}
        />
      }
    />
  );
}

export { WorkspaceDemo };
