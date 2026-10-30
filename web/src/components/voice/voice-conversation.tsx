"use client";

import { ConversationProvider } from "@elevenlabs/react";
import { MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { formatElapsed } from "@/components/mic-dock/meter";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { LevelMeter } from "./level-meter";
import { voiceCopy, type VoiceState } from "@/lib/voice";
import { cn } from "@/lib/utils";

type VoiceConversationProps = {
  readonly experimentId: number | null;
  // "hero" is the big mic on `/`; "stage" is the same mic centered on top of
  // the notebook, whose thread keeps the history; "inline" is the small button.
  readonly variant: "hero" | "stage" | "inline";
  // Where focus goes when voice fails, so typing takes over (AC-11).
  readonly fallbackInputId?: string;
};

// Talk to LabFlow (spec 0007): start and stop a hands free session, see what
// the agent heard and what LabFlow answered. Used on `/` (AC-1) and on the
// notebook page (AC-19) with the same hook.
function VoiceConversation(props: VoiceConversationProps) {
  return (
    <ConversationProvider>
      <Conversation {...props} />
    </ConversationProvider>
  );
}

function Conversation({
  experimentId,
  variant,
  fallbackInputId,
}: VoiceConversationProps) {
  const voice = useVoiceSession(experimentId);
  const { state } = voice;
  const live =
    state.kind === "listening" ||
    state.kind === "thinking" ||
    state.kind === "speaking";
  // The screen stays on while the conversation is live (spec 0010, AC-9).
  useWakeLock(live);
  const liveRef = useRef<HTMLDivElement>(null);

  // One polite region for session states; the final user text is said once.
  const announced = announcement(state, voice.heard);
  useEffect(() => {
    if (liveRef.current) liveRef.current.textContent = announced;
  }, [announced]);

  useEffect(() => {
    if (state.kind === "error" && fallbackInputId)
      document.getElementById(fallbackInputId)?.focus();
  }, [state.kind, fallbackInputId]);

  const hero = variant !== "inline";
  // On the notebook the thread holds what was said; the stage shows it live only.
  const showWords =
    variant === "stage" ? live : live || voice.heard || voice.answer;
  const disabled = experimentId === null || state.kind === "starting";

  return (
    <div
      data-slot="voice-conversation"
      data-state={state.kind}
      className={cn(
        "flex flex-col gap-3",
        hero ? "items-center text-center" : "items-start",
      )}
    >
      <div ref={liveRef} aria-live="polite" className="sr-only" />

      {hero ? (
        <div className="flex flex-col items-center gap-3">
          <StatusPill state={state} />
          <div className="flex items-center gap-4">
            <LevelMeter
              active={live}
              level={voice.level}
              tone={state.kind === "thinking" ? "muted" : "brand"}
              className="flex-row-reverse"
            />
            <span className="relative flex size-24 items-center justify-center">
              {/* The halo: a soft ring at rest, breathing while live. */}
              <span
                aria-hidden
                className={cn(
                  "absolute -inset-2 rounded-full bg-brand-soft transition-transform duration-500",
                  live && "animate-halo",
                  disabled && "opacity-0",
                )}
              />
              <button
                type="button"
                aria-label={live ? voiceCopy.stop : voiceCopy.start}
                aria-pressed={live}
                aria-disabled={disabled || undefined}
                onClick={() => {
                  if (disabled) return;
                  if (live) voice.stop();
                  else voice.start();
                }}
                className={cn(
                  "relative flex size-24 cursor-pointer items-center justify-center rounded-full shadow-dock focus-ring transition-[background-color,transform] active:scale-95",
                  disabled
                    ? "cursor-not-allowed bg-sunken text-ink-muted"
                    : "bg-brand text-on-brand hover:brightness-110",
                )}
              >
                {state.kind === "starting" ? (
                  <Spinner className="size-7" />
                ) : live ? (
                  <SquareIcon aria-hidden className="size-7 fill-current" />
                ) : (
                  <MicIcon aria-hidden className="size-8" />
                )}
              </button>
            </span>
            <LevelMeter
              active={live}
              level={voice.level}
              tone={state.kind === "thinking" ? "muted" : "brand"}
            />
          </div>
          {live ? null : (
            <p className="min-h-5 text-sm text-ink-muted">{hint(state)}</p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            size="lg"
            variant={live ? "secondary" : "primary"}
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (disabled) return;
              if (live) voice.stop();
              else voice.start();
            }}
            className="rounded-full px-5"
          >
            {state.kind === "starting" ? (
              <Spinner />
            ) : live ? (
              <SquareIcon aria-hidden className="size-4 fill-current" />
            ) : (
              <MicIcon aria-hidden />
            )}
            {live ? voiceCopy.stop : voiceCopy.start}
          </Button>
          <p className="min-h-5 text-sm text-ink-muted">
            {hint(state)}
            {live ? (
              <time className="ml-2 font-mono tabular-nums">
                {formatElapsed(state.elapsedMs)}
              </time>
            ) : null}
          </p>
        </div>
      )}

      {state.kind === "error" ? (
        <div role="alert" className="flex flex-col text-sm">
          <p className="font-medium text-ink">{voiceCopy.failed}</p>
          <p className="text-ink-muted">{state.message}</p>
        </div>
      ) : null}

      {showWords ? (
        <div
          className={cn(
            "flex w-full max-w-xl flex-col gap-1",
            hero ? "items-center" : "items-start",
          )}
        >
          <p className="text-xs text-ink-muted">Dijiste</p>
          <p
            aria-live="off"
            className="font-heading text-lg text-balance text-ink"
          >
            {voice.heard ?? (live ? voiceCopy.heardPending : null)}
            {state.kind === "listening" ? (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.15em] animate-caret bg-brand"
              />
            ) : null}
          </p>
          {voice.answer && variant !== "stage" ? (
            <p className="text-sm text-ink-muted">{voice.answer}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// "● Escuchando 0:12": where the session is, at a glance (the site's pill).
function StatusPill({ state }: { readonly state: VoiceState }) {
  const live =
    state.kind === "listening" ||
    state.kind === "thinking" ||
    state.kind === "speaking";
  const label =
    state.kind === "idle" || state.kind === "error"
      ? "Listo para escuchar"
      : hint(state);
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-full px-3 text-xs font-medium transition-colors",
        live || state.kind === "starting"
          ? "bg-brand-soft text-brand"
          : "bg-sunken text-ink-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          live ? "bg-brand motion-safe:animate-pulse" : "bg-control",
        )}
      />
      {label}
      {live ? (
        <time className="font-mono tabular-nums opacity-80">
          {formatElapsed(state.elapsedMs)}
        </time>
      ) : null}
    </span>
  );
}

const hint = (state: VoiceState): string => {
  switch (state.kind) {
    case "idle":
    case "error":
      return "Toca para hablar con LabFlow";
    case "starting":
      return voiceCopy.starting;
    case "listening":
      return voiceCopy.listening;
    case "thinking":
      return voiceCopy.thinking;
    case "speaking":
      return voiceCopy.speaking;
  }
};

const announcement = (state: VoiceState, heard: string | null): string => {
  switch (state.kind) {
    case "starting":
      return voiceCopy.starting;
    case "listening":
      return heard ?? voiceCopy.listening;
    case "thinking":
      return voiceCopy.thinking;
    case "speaking":
      return voiceCopy.speaking;
    case "idle":
    case "error":
      return "";
  }
};

export { VoiceConversation };
