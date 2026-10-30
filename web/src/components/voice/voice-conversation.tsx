"use client";

import { ConversationProvider } from "@elevenlabs/react";
import { MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { formatElapsed } from "@/components/mic-dock/meter";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { voiceCopy, type VoiceState } from "@/lib/voice";
import { cn } from "@/lib/utils";

type VoiceConversationProps = {
  readonly experimentId: number | null;
  // "hero" is the big mic on `/`; "inline" sits above the notebook's text field.
  readonly variant: "hero" | "inline";
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

  const hero = variant === "hero";
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

      <div className={cn("flex items-center gap-3", hero && "flex-col")}>
        {hero ? (
          <span className="relative flex size-24 items-center justify-center">
            {live ? (
              <span
                aria-hidden
                className={cn(
                  "absolute inset-0 rounded-full bg-brand-soft motion-safe:animate-pulse",
                  state.kind === "speaking" && "scale-110",
                )}
              />
            ) : null}
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
                "relative flex size-24 cursor-pointer items-center justify-center rounded-full shadow-dock focus-ring transition-colors",
                disabled
                  ? "cursor-not-allowed bg-sunken text-ink-muted"
                  : "bg-brand text-on-brand",
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
        ) : (
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
        )}

        <p className="min-h-5 text-sm text-ink-muted">
          {hint(state)}
          {live ? (
            <time className="ml-2 font-mono tabular-nums">
              {formatElapsed(state.elapsedMs)}
            </time>
          ) : null}
        </p>
      </div>

      {state.kind === "error" ? (
        <div role="alert" className="flex flex-col text-sm">
          <p className="font-medium text-ink">{voiceCopy.failed}</p>
          <p className="text-ink-muted">{state.message}</p>
        </div>
      ) : null}

      {live || voice.heard || voice.answer ? (
        <div
          className={cn(
            "flex w-full flex-col gap-2",
            hero ? "items-center" : "items-start",
          )}
        >
          <p
            aria-live="off"
            className="font-heading text-lg text-balance text-ink"
          >
            {voice.heard ?? (live ? voiceCopy.heardPending : null)}
          </p>
          {voice.answer ? (
            <p className="text-sm text-ink-muted">{voice.answer}</p>
          ) : null}
        </div>
      ) : null}
    </div>
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
