"use client";

import { KeyboardIcon, MicIcon, MicOffIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";

import { formatElapsed, levelBars } from "@/components/mic-dock/meter";
import type { MicDockState } from "@/components/mic-dock/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

import { announcement, copy } from "./copy";
import { releaseOutcome } from "./press";

const LIVE_DELAY_MS = 100;
const BAR_KEYS = ["a", "b", "c", "d", "e"] as const;

type PushToTalkProps = {
  readonly state: MicDockState;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onCancel: () => void;
  readonly onKeyboard: () => void;
};

type Mode = "holding" | "tapped" | null;

// The main page's big mic (OpenPhone, Claude voice): hold to talk and release
// to send, or tap to start and tap again to stop. Space works the same way from
// the keyboard; Enter and assistive tech clicks toggle. It holds no recording
// state; the parent owns it, like MicDock.
function PushToTalk({
  state,
  onStart,
  onStop,
  onCancel,
  onKeyboard,
}: PushToTalkProps) {
  const reduced = useReducedMotion();
  const liveRef = useRef<HTMLDivElement>(null);
  const pressedAt = useRef<number | null>(null);
  const [mode, setMode] = useState<Mode>(null);

  const listening = state.kind === "listening";
  const busy =
    state.kind === "requesting_permission" || state.kind === "processing";
  const unavailable = state.kind === "unavailable";

  const liveText = announcement(state);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (liveRef.current) liveRef.current.textContent = liveText;
    }, LIVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [liveText]);

  const press = () => {
    if (busy || unavailable) return;
    if (listening) {
      pressedAt.current = null;
      setMode(null);
      onStop();
      return;
    }
    pressedAt.current = performance.now();
    setMode("holding");
    onStart();
  };

  const release = () => {
    if (pressedAt.current === null) return;
    const outcome = releaseOutcome(performance.now() - pressedAt.current);
    pressedAt.current = null;
    if (outcome === "stop") {
      setMode(null);
      onStop();
    } else {
      setMode("tapped");
    }
  };

  const toggle = () => {
    if (busy || unavailable) return;
    setMode(null);
    if (listening) onStop();
    else {
      setMode("tapped");
      onStart();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== " ") return;
    event.preventDefault();
    if (!event.repeat) press();
  };
  const onKeyUp = (event: React.KeyboardEvent) => {
    if (event.key !== " ") return;
    event.preventDefault();
    release();
  };

  const hint =
    state.kind === "listening"
      ? mode === "holding"
        ? copy.hint.holding
        : copy.hint.tapped
      : state.kind === "requesting_permission"
        ? copy.hint.requesting
        : state.kind === "processing"
          ? copy.hint.processing
          : state.kind === "unavailable"
            ? copy.reasons[state.reason]
            : copy.hint.idle;

  return (
    <div
      data-slot="push-to-talk"
      data-state={state.kind}
      data-motion={reduced ? "reduced" : "full"}
      className="flex flex-col items-center gap-4"
    >
      <div ref={liveRef} aria-live="polite" className="sr-only" />

      {state.kind === "service_error" ? (
        <div role="alert" className="flex flex-col items-center text-center">
          <p className="text-sm font-medium text-ink">{copy.serviceError}</p>
          <p className="text-sm text-ink-muted">{state.message}</p>
        </div>
      ) : null}

      <div
        aria-hidden
        className={cn(
          "flex h-6 items-center gap-3 font-mono text-sm text-ink-muted tabular-nums transition-opacity",
          listening ? "opacity-100" : "opacity-0",
        )}
      >
        <LevelBars level={listening ? state.level : undefined} />
        <span>{formatElapsed(listening ? state.elapsedMs : 0)}</span>
      </div>

      <div className="flex items-center gap-8">
        <Button
          variant="secondary"
          size="icon-lg"
          className={cn("rounded-full", !listening && "invisible")}
          aria-label={copy.cancel}
          aria-hidden={listening ? undefined : true}
          tabIndex={listening ? undefined : -1}
          onClick={() => {
            pressedAt.current = null;
            setMode(null);
            onCancel();
          }}
        >
          <XIcon aria-hidden />
        </Button>

        <span className="relative flex size-24 items-center justify-center">
          {listening ? (
            <span
              aria-hidden
              className={cn(
                "absolute inset-0 rounded-full bg-ink/10",
                !reduced && "transition-transform duration-100",
              )}
              style={{
                transform: `scale(${reduced ? 1.15 : 1.1 + (state.level ?? 0.4) * 0.35})`,
              }}
            />
          ) : null}
          <button
            type="button"
            aria-label={copy.button}
            aria-pressed={listening}
            aria-disabled={busy || unavailable || undefined}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              press();
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            // Pointer presses are handled above; this catches Enter and
            // assistive tech activation, which arrive as a click with detail 0.
            onClick={(event) => {
              if (event.detail === 0) toggle();
            }}
            onContextMenu={(event) => event.preventDefault()}
            className={cn(
              "relative flex size-24 cursor-pointer touch-none items-center justify-center rounded-full shadow-dock focus-ring transition-[transform,background-color] select-none [-webkit-touch-callout:none]",
              unavailable
                ? "cursor-not-allowed bg-sunken text-ink-muted"
                : busy
                  ? "bg-sunken text-ink"
                  : "bg-ink text-on-ink",
              listening && !reduced && "scale-105",
            )}
          >
            {state.kind === "processing" ||
            state.kind === "requesting_permission" ? (
              <Spinner className="size-7" />
            ) : unavailable ? (
              <MicOffIcon aria-hidden className="size-8" />
            ) : (
              <MicIcon aria-hidden className="size-8" />
            )}
          </button>
        </span>

        <Button
          variant="secondary"
          size="icon-lg"
          className="rounded-full"
          aria-label={copy.keyboard}
          onClick={onKeyboard}
        >
          <KeyboardIcon aria-hidden />
        </Button>
      </div>

      <p className="min-h-5 text-sm text-ink-muted">{hint}</p>
    </div>
  );
}

function LevelBars({ level }: { readonly level: number | undefined }) {
  const heights = levelBars(level ?? 0.4);
  return (
    <span data-slot="level-bars" className="flex h-5 items-center gap-0.5">
      {BAR_KEYS.map((key, i) => (
        <span
          key={key}
          className={cn(
            "h-full w-1 origin-center rounded-full bg-current transition-transform duration-100",
            level === undefined && "animate-mic-pulse",
          )}
          style={
            level === undefined
              ? { animationDelay: `${i * 120}ms` }
              : { transform: `scaleY(${heights[i]})` }
          }
        />
      ))}
    </span>
  );
}

export { PushToTalk };
export type { PushToTalkProps };
