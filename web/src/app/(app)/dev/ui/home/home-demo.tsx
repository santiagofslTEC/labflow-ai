"use client";

import { SendHorizontalIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { MicDockState } from "@/components/mic-dock/types";
import { ProposalCard } from "@/components/proposal-card/proposal-card";
import type { ProposalCardState } from "@/components/proposal-card/types";
import { PushToTalk } from "@/components/push-to-talk/push-to-talk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatQuantity } from "@/lib/format";

import {
  SAMPLE_EXPERIMENT_TITLE,
  SAMPLE_PHRASE,
  SAMPLE_PROPOSAL_VALUES,
  SAMPLE_TRIALS,
  SAMPLE_VARIABLES,
  type SampleTrial,
} from "../sample-data";

const TICK_MS = 100;
const WORD_MS = 260;
const PROCESS_MS = 900;
const SAVE_MS = 700;
const WORDS = SAMPLE_PHRASE.split(" ");

const NOTEBOOKS = [
  { id: "demo", title: SAMPLE_EXPERIMENT_TITLE },
  { id: "ph", title: "Ejemplo: tampón de fosfato, pH" },
] as const;

const lastRowText = (trial: SampleTrial): string =>
  SAMPLE_VARIABLES.map((variable, index) =>
    formatQuantity(trial.values[index] ?? 0, variable.unit),
  ).join(" · ");

// Simulates feature 8: holding the mic streams the sample phrase word by word,
// releasing "transcribes" it, and the proposal card takes the stage.
function HomeDemo() {
  const [notebook, setNotebook] = useState<string>(NOTEBOOKS[0].id);
  const [mic, setMic] = useState<MicDockState>({ kind: "idle" });
  const [partial, setPartial] = useState("");
  const [card, setCard] = useState<ProposalCardState | null>(null);
  const [last, setLast] = useState<SampleTrial | undefined>(SAMPLE_TRIALS[1]);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const ticker = useRef<number | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      window.clearInterval(ticker.current);
      window.clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);

  const start = () => {
    setCard(null);
    setPartial("");
    const startedAt = performance.now();
    setMic({ kind: "listening", elapsedMs: 0, level: 0.3 });
    window.clearInterval(ticker.current);
    ticker.current = window.setInterval(() => {
      const elapsedMs = performance.now() - startedAt;
      setMic({
        kind: "listening",
        elapsedMs,
        level: 0.25 + Math.random() * 0.75,
      });
      setPartial(WORDS.slice(0, Math.floor(elapsedMs / WORD_MS) + 1).join(" "));
    }, TICK_MS);
  };

  const propose = () => {
    setMic({ kind: "processing" });
    timer.current = window.setTimeout(() => {
      setMic({ kind: "idle" });
      setPartial("");
      setCard({ kind: "proposed" });
    }, PROCESS_MS);
  };

  const stop = () => {
    window.clearInterval(ticker.current);
    setPartial(SAMPLE_PHRASE);
    propose();
  };

  const cancel = () => {
    window.clearInterval(ticker.current);
    setPartial("");
    setMic({ kind: "idle" });
  };

  const confirm = () => {
    setCard({ kind: "saving" });
    timer.current = window.setTimeout(() => {
      setCard({ kind: "saved" });
      setLast(SAMPLE_TRIALS[2]);
    }, SAVE_MS);
  };

  const listening = mic.kind === "listening";
  const processing = mic.kind === "processing";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="sr-only">Dictar</h1>
        <Select value={notebook} onValueChange={setNotebook}>
          <SelectTrigger
            aria-label="Cuaderno activo"
            className="max-w-full border-transparent bg-transparent shadow-none hover:bg-sunken"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NOTEBOOKS.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {last ? (
          <p className="text-sm text-ink-muted">
            Último: Ensayo {last.trialNumber} ·{" "}
            <span className="font-mono tabular-nums">{lastRowText(last)}</span>
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Aún no hay ensayos</p>
        )}
      </header>

      <div className="flex min-h-72 flex-1 flex-col items-center justify-center py-10">
        {card ? (
          <div className="w-full max-w-md">
            <ProposalCard
              trialNumber={3}
              values={SAMPLE_PROPOSAL_VALUES}
              phrase={SAMPLE_PHRASE}
              source={typing ? "text" : "voice"}
              state={card}
              onConfirm={confirm}
              onRetry={confirm}
              onEdit={(variableId) => setCard({ kind: "editing", variableId })}
              onCommitEdit={() => setCard({ kind: "proposed" })}
              onCancelEdit={() => setCard({ kind: "proposed" })}
              onDiscard={() => setCard(null)}
              onSettled={() => setCard(null)}
            />
          </div>
        ) : listening || processing ? (
          <p
            aria-live="off"
            className="max-w-xl text-center text-display font-semibold text-balance text-ink lg:text-display-lg"
          >
            {partial || "…"}
          </p>
        ) : (
          <p className="max-w-md text-center text-display font-semibold text-balance text-ink-muted lg:text-display-lg">
            ¿Qué mediste?
          </p>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col items-center gap-4 bg-surface pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        {typing ? (
          <form
            className="flex w-full max-w-md items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim() === "") return;
              setText("");
              setTyping(false);
              propose();
            }}
          >
            <label htmlFor="home-text" className="sr-only">
              Medición escrita
            </label>
            <Input
              ref={inputRef}
              id="home-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Ensayo 3, temperatura 50 grados…"
              enterKeyHint="send"
              className="h-12 rounded-full px-5"
            />
            <Button
              type="submit"
              size="icon-lg"
              className="rounded-full"
              disabled={text.trim() === ""}
              aria-label="Enviar"
            >
              <SendHorizontalIcon aria-hidden />
            </Button>
          </form>
        ) : null}
        <PushToTalk
          state={mic}
          onStart={start}
          onStop={stop}
          onCancel={cancel}
          onKeyboard={() => setTyping((on) => !on)}
        />
      </div>
    </div>
  );
}

export { HomeDemo };
