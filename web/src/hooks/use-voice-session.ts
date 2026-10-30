"use client";

import { useConversation } from "@elevenlabs/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { captureKeys } from "@/api/capture";
import { experimentKeys } from "@/api/experiments";
import { endVoiceSession, startVoiceSession } from "@/api/voice";
import {
  micErrorMessage,
  SILENCE_MS,
  tentativeText,
  voiceCopy,
  withoutFiller,
  type VoiceState,
} from "@/lib/voice";

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "live"; readonly startedAt: number }
  | { readonly kind: "error"; readonly message: string };

export type VoiceSession = {
  readonly state: VoiceState;
  readonly heard: string | null; // the last thing you said, as the agent heard it
  readonly answer: string | null; // the last thing LabFlow said
  // 0 to 1: your voice while you talk, LabFlow's while it speaks. Read on each
  // animation frame by the level meter, never during render.
  readonly level: () => number;
  readonly start: () => void;
  readonly stop: () => void;
};

// One voice conversation with the ElevenLabs Agent for one notebook (spec
// 0007, AC-1, AC-2, AC-10, AC-11, AC-20). Our server decides and saves; the
// browser only learns a turn finished by refetching the card and the notebook.
// Must be used inside a ConversationProvider.
export function useVoiceSession(experimentId: number | null): VoiceSession {
  const client = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [heard, setHeard] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  // From your final words until LabFlow's real reply (spec 0007, AC-24).
  const [thinking, setThinking] = useState(false);
  const [now, setNow] = useState(0); // set when a session starts, never at render
  const sid = useRef<string | null>(null);
  const silence = useRef<number | undefined>(undefined);

  const refresh = useCallback(() => {
    if (experimentId === null) return;
    void client.invalidateQueries({
      queryKey: captureKeys.proposal(experimentId),
    });
    void client.invalidateQueries({ queryKey: experimentKeys.all });
  }, [client, experimentId]);

  const release = () => {
    window.clearTimeout(silence.current);
    setThinking(false);
    if (sid.current !== null) void endVoiceSession(sid.current);
    sid.current = null;
  };

  const conversation = useConversation({
    onMessage: ({ role, message }) => {
      if (role === "user") {
        setHeard(message);
        setThinking(true);
        // No silence timeout while LabFlow works on your turn (AC-24).
        window.clearTimeout(silence.current);
      } else {
        // The filler alone ("A ver.") does not end thinking (AC-22, AC-24).
        const reply = withoutFiller(message);
        if (reply === "") return;
        setAnswer(reply);
        setThinking(false);
        armSilence();
      }
      refresh();
    },
    // You kept talking: back to listening (AC-24).
    onIncomingEvent: (event: unknown) => {
      if (tentativeText(event) !== null) setThinking(false);
    },
    onModeChange: ({ mode }) => {
      if (mode === "listening") refresh();
    },
    onDisconnect: (details) => {
      console.warn("[voz] sesión terminada", details);
      release();
      setPhase(
        details.reason === "error"
          ? { kind: "error", message: voiceCopy.dropped }
          : { kind: "idle" },
      );
    },
    // An error during a live call (one failed turn) does not end it: the agent
    // keeps listening and onDisconnect reports a real drop. Only a session
    // that never connected turns into the error state (AC-11).
    onError: (message, context) => {
      console.warn("[voz] error", message, context);
      setPhase((current) =>
        current.kind === "starting"
          ? { kind: "error", message: voiceCopy.dropped }
          : current,
      );
    },
  });

  const { endSession, startSession } = conversation;

  const stop = useCallback(() => {
    endSession();
    release();
    setPhase({ kind: "idle" });
  }, [endSession]);

  // Hands free ends after 60 s with no user text (AC-10).
  const armSilence = () => {
    window.clearTimeout(silence.current);
    silence.current = window.setTimeout(stop, SILENCE_MS);
  };

  const start = async () => {
    if (experimentId === null) return;
    setHeard(null);
    setAnswer(null);
    if (!window.isSecureContext || !navigator.mediaDevices) {
      setPhase({ kind: "error", message: voiceCopy.insecure });
      return;
    }
    setPhase({ kind: "starting" });
    try {
      // Ask for the mic first so a denial gets its own message (AC-11).
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      setPhase({ kind: "error", message: micErrorMessage(error) });
      return;
    }
    const result = await startVoiceSession(experimentId);
    if (!result.ok) {
      setPhase({ kind: "error", message: result.message });
      return;
    }
    sid.current = result.data.sid;
    startSession({
      signedUrl: result.data.signed_url,
      customLlmExtraBody: { session_token: result.data.session_token },
    });
    const startedAt = Date.now();
    setNow(startedAt);
    setPhase({ kind: "live", startedAt });
    armSilence();
  };

  // The tab hiding (a phone lock too), the page closing, or the notebook
  // changing ends the session (AC-10).
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);
  const live = phase.kind === "live" || phase.kind === "starting";
  useEffect(() => {
    if (!live) return;
    const onHidden = () => {
      if (document.visibilityState === "hidden") stopRef.current();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onHidden);
    };
  }, [live]);
  useEffect(() => () => stopRef.current(), [experimentId]);

  // The elapsed time on the mic, once a second while live.
  useEffect(() => {
    if (phase.kind !== "live") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase.kind]);

  const state: VoiceState = (() => {
    switch (phase.kind) {
      case "idle":
      case "starting":
        return phase;
      case "error":
        return phase;
      case "live": {
        if (conversation.status !== "connected") return { kind: "starting" };
        const elapsedMs = Math.max(0, now - phase.startedAt);
        // Thinking wins over the filler's audio (AC-24).
        if (thinking) return { kind: "thinking", elapsedMs };
        return conversation.isSpeaking
          ? { kind: "speaking", elapsedMs }
          : { kind: "listening", elapsedMs };
      }
    }
  })();

  const level = () => {
    try {
      return conversation.isSpeaking
        ? conversation.getOutputVolume()
        : conversation.getInputVolume();
    } catch {
      return 0; // no session yet
    }
  };

  return { state, heard, answer, level, start: () => void start(), stop };
}
