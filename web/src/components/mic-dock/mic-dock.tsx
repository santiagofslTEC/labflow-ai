"use client";

import {
  MicIcon,
  MicOffIcon,
  OctagonAlertIcon,
  RotateCcwIcon,
  SendHorizontalIcon,
  SquareIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { announcement, copy } from "./copy";
import { formatElapsed, levelBars } from "./meter";
import type { MicDockProps, MicDockState } from "./types";

const LIVE_DELAY_MS = 100;
const PULSE_DELAYS = ["0ms", "120ms", "240ms", "360ms", "480ms"] as const;

// The bottom composer (Copilot, Hume): one rounded box with a text field that
// always works, send, and the mic pill. It holds no state; the parent owns the
// recording and the text.
function MicDock({
  state,
  text,
  onTextChange,
  onSubmitText,
  onStart,
  onStop,
  onRetry,
}: MicDockProps) {
  const reduced = useReducedMotion();
  const fieldId = useId();
  const liveRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blank = text.trim() === "";

  const liveText = announcement(state);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (liveRef.current) liveRef.current.textContent = liveText;
    }, LIVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [liveText]);

  // Without a mic, typing is the way in: move focus to the field.
  useEffect(() => {
    if (state.kind === "unavailable") inputRef.current?.focus();
  }, [state.kind]);

  const fade = { duration: duration.fade };

  return (
    <div
      data-slot="mic-dock"
      data-state={state.kind}
      data-motion={reduced ? "reduced" : "full"}
      className="rounded-card border border-line bg-surface shadow-dock"
    >
      <div ref={liveRef} aria-live="polite" className="sr-only" />
      <div className="flex w-full flex-col gap-1 p-1.5">
        <AnimatePresence initial={false} mode="popLayout">
          <Status key={state.kind} state={state} reduced={reduced} />
        </AnimatePresence>

        <div className="flex items-center gap-1.5">
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!blank) onSubmitText();
            }}
          >
            <label htmlFor={fieldId} className="sr-only">
              {copy.fieldLabel}
            </label>
            <Input
              ref={inputRef}
              id={fieldId}
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder={copy.placeholder}
              autoComplete="off"
              enterKeyHint="send"
              className="h-12 min-w-0 flex-1 truncate border-transparent bg-transparent shadow-none"
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon-lg"
              disabled={blank}
              aria-label={copy.submit}
            >
              <SendHorizontalIcon aria-hidden />
            </Button>
          </form>

          {state.kind === "unavailable" ? null : (
            <motion.div
              layout
              transition={reduced ? fade : spring.snappy}
              className="shrink-0"
            >
              <MicButton
                state={state}
                reduced={reduced}
                onStart={onStart}
                onStop={onStop}
                onRetry={onRetry}
              />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function Status({
  state,
  reduced,
}: {
  readonly state: MicDockState;
  readonly reduced: boolean;
}) {
  const motionProps = {
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: reduced ? { duration: duration.fade } : spring.snappy,
  };

  if (state.kind === "unavailable")
    return (
      <motion.p
        {...motionProps}
        className="flex min-h-10 items-center gap-2 rounded-control bg-sunken px-3 py-2 text-sm text-ink-muted"
      >
        <MicOffIcon aria-hidden className="size-4 shrink-0" />
        {copy.reasons[state.reason]}
      </motion.p>
    );

  if (state.kind === "service_error")
    return (
      <motion.div
        {...motionProps}
        role="alert"
        className="flex items-start gap-3 rounded-control bg-sunken px-3 py-2 text-sm"
      >
        <OctagonAlertIcon
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-danger"
        />
        <div className="flex flex-col">
          <p className="font-medium text-ink">{copy.serviceError}</p>
          <p className="text-ink-muted">{state.message}</p>
        </div>
      </motion.div>
    );

  return null;
}

type MicButtonProps = {
  readonly state: Exclude<MicDockState, { readonly kind: "unavailable" }>;
  readonly reduced: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onRetry: () => void;
};

// One button element in every state, so keyboard focus stays on it as it morphs.
function MicButton({
  state,
  reduced,
  onStart,
  onStop,
  onRetry,
}: MicButtonProps) {
  const busy =
    state.kind === "requesting_permission" || state.kind === "processing";
  const onClick =
    state.kind === "idle"
      ? onStart
      : state.kind === "listening"
        ? onStop
        : state.kind === "service_error"
          ? onRetry
          : undefined;

  return (
    <Button
      size="lg"
      aria-disabled={busy || undefined}
      onClick={onClick}
      className={cn(
        "rounded-full px-5",
        busy && "bg-sunken text-ink hover:bg-sunken",
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={state.kind}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.fade }}
          className="inline-flex items-center gap-2"
        >
          <MicButtonContent state={state} reduced={reduced} />
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

function MicButtonContent({
  state,
  reduced,
}: {
  readonly state: MicButtonProps["state"];
  readonly reduced: boolean;
}) {
  switch (state.kind) {
    case "idle":
      return (
        <>
          <MicIcon aria-hidden />
          {copy.dictate}
        </>
      );
    case "requesting_permission":
      return (
        <>
          <MicIcon aria-hidden />
          <span className="max-sm:sr-only">{copy.requesting}</span>
        </>
      );
    case "listening":
      return (
        <>
          <LevelBars level={state.level} reduced={reduced} />
          <time className="font-mono text-sm tabular-nums">
            {formatElapsed(state.elapsedMs)}
          </time>
          <SquareIcon aria-hidden className="size-4 fill-current" />
          {copy.stop}
        </>
      );
    case "processing":
      return (
        <>
          <Spinner />
          <span className="max-sm:sr-only">{copy.processing}</span>
        </>
      );
    case "service_error":
      return (
        <>
          <RotateCcwIcon aria-hidden />
          {copy.retry}
        </>
      );
  }
}

function LevelBars({
  level,
  reduced,
}: {
  readonly level: number | undefined;
  readonly reduced: boolean;
}) {
  const heights = level === undefined ? null : levelBars(level);
  return (
    <span
      aria-hidden
      data-slot="level-bars"
      className="flex h-5 items-center gap-0.5"
    >
      {PULSE_DELAYS.map((delay, i) => (
        <span
          key={delay}
          data-bar
          className={cn(
            "h-full w-1 origin-center rounded-full bg-current",
            heights
              ? !reduced && "transition-transform duration-100"
              : "animate-mic-pulse",
          )}
          style={
            heights
              ? { transform: `scaleY(${heights[i]})` }
              : { animationDelay: delay }
          }
        />
      ))}
    </span>
  );
}

export { MicDock };
export type { MicDockProps, MicDockState } from "./types";
