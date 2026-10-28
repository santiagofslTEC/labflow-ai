"use client";

import {
  ChartSplineIcon,
  MicIcon,
  SparkleIcon,
  Table2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PanelHeading } from "@/components/app-shell/panel-heading";
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
    time: "10:02",
    text: "Ensayo 1, 40 grados, 15 minutos, rendimiento 58 por ciento",
  },
  { role: "assistant", time: "10:02", text: "Guardé el ensayo 1." },
  {
    role: "user",
    time: "10:03",
    text: "Ensayo 2, 45 grados, 15 minutos, 64 por ciento",
  },
  { role: "assistant", time: "10:03", text: "Guardé el ensayo 2." },
  { role: "user", time: "10:04", text: SAMPLE_PHRASE },
] as const;

// A transcript, not chat bubbles (OpenAI audio, Otter): speaker and time, then text.
function Conversation() {
  return (
    <section aria-labelledby="transcripcion" className="flex flex-col gap-4">
      <h2 id="transcripcion" className="text-xs font-medium text-ink-muted">
        Transcripción · hoy
      </h2>
      <ol className="flex flex-col gap-5">
        {TURNS.map((turn, index) => (
          <li key={index} className="flex flex-col gap-1">
            <p className="flex items-center gap-1.5 text-xs text-ink-muted">
              {turn.role === "user" ? (
                <MicIcon aria-hidden className="size-3.5" />
              ) : (
                <SparkleIcon aria-hidden className="size-3.5 text-saved" />
              )}
              <span className="font-medium text-ink">
                {turn.role === "user" ? "Tú" : "LabFlow"}
              </span>
              <time className="font-mono tabular-nums">{turn.time}</time>
            </p>
            <p className="text-[0.9375rem] leading-6 text-ink">{turn.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TrialsTable({ trials }: { readonly trials: readonly SampleTrial[] }) {
  return (
    <section aria-labelledby="vista-tabla" className="flex flex-col gap-2">
      <PanelHeading
        id="vista-tabla"
        icon={Table2Icon}
        title="Tabla"
        meta={`${trials.length} ensayos`}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
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
              <TableCell className="font-mono text-cell text-ink-muted tabular-nums">
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
    </section>
  );
}

// Summary figures above the chart (Plane, Vercel), computed from the rows shown.
function Stats({ trials }: { readonly trials: readonly SampleTrial[] }) {
  const yields = trials.map((trial) => trial.values[2] ?? 0);
  const unit = SAMPLE_VARIABLES[2]?.unit ?? null;
  const stats = [
    { label: "Ensayos", value: String(trials.length) },
    {
      label: "Rendimiento máximo",
      value: formatQuantity(Math.max(...yields), unit),
    },
    {
      label: "Rendimiento promedio",
      value: formatQuantity(
        yields.reduce((sum, y) => sum + y, 0) / Math.max(yields.length, 1),
        unit,
      ),
    },
  ] as const;
  return (
    <dl className="grid grid-cols-3 gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col gap-1">
          <dt className="text-xs text-ink-muted">{stat.label}</dt>
          <dd className="font-mono text-xl text-ink tabular-nums">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// PLACEHOLDER: feature 9 replaces this with the Plotly chart built on the chart tokens.
const X_TICKS = [40, 45, 50, 55, 60] as const;
const Y_TICKS = [50, 60, 70, 80, 90] as const;

function ChartPlaceholder({
  trials,
}: {
  readonly trials: readonly SampleTrial[];
}) {
  const points = trials.map((trial) => ({
    x: trial.values[0] ?? 0,
    y: trial.values[2] ?? 0,
  }));
  const sx = (x: number) => 48 + ((x - 37.5) / 25) * 336;
  const sy = (y: number) => 200 - ((y - 50) / 40) * 180;
  return (
    <section aria-labelledby="vista-grafico" className="flex flex-col gap-4">
      <PanelHeading
        id="vista-grafico"
        icon={ChartSplineIcon}
        title="Gráfico"
        meta="Rendimiento vs. temperatura"
      />
      <Stats trials={trials} />
      <svg
        viewBox="0 0 400 240"
        role="img"
        aria-label={`Rendimiento según la temperatura, ${points.length} ensayos`}
        className="h-auto w-full font-mono text-[10px]"
      >
        {Y_TICKS.map((tick) => (
          <g key={tick}>
            <line
              x1="48"
              x2="384"
              y1={sy(tick)}
              y2={sy(tick)}
              strokeDasharray="2 4"
              className="stroke-line"
            />
            <text
              x="40"
              y={sy(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-ink-muted"
            >
              {formatQuantity(tick, "%")}
            </text>
          </g>
        ))}
        <line x1="48" x2="384" y1="200" y2="200" className="stroke-line" />
        {X_TICKS.map((tick) => (
          <text
            key={tick}
            x={sx(tick)}
            y="218"
            textAnchor="middle"
            className="fill-ink-muted"
          >
            {formatQuantity(tick, "°C")}
          </text>
        ))}
        <polyline
          points={points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          className="stroke-chart-1"
        />
        {points.map((p) => (
          <circle
            key={p.x}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r="4"
            strokeWidth="2"
            className="fill-surface stroke-chart-1"
          />
        ))}
      </svg>
    </section>
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
