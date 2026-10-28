"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MicDock } from "@/components/mic-dock/mic-dock";
import type { MicDockState } from "@/components/mic-dock/types";

import { StatePicker } from "./state-picker";

const STATES: Readonly<Record<string, { label: string }>> = {
  idle: { label: "idle" },
  requesting_permission: { label: "requesting_permission" },
  listening: { label: "listening (con nivel)" },
  listening_pulse: { label: "listening (sin nivel: pulso)" },
  processing: { label: "processing" },
  denied: { label: "unavailable: denied" },
  no_device: { label: "unavailable: no_device" },
  insecure: { label: "unavailable: insecure" },
  service_error: { label: "service_error" },
};

const OPTIONS = Object.entries(STATES).map(([value, { label }]) => ({
  value,
  label,
}));

const TICK_MS = 120;

// Fakes a recording clock and audio level, the way feature 8 will feed them.
const useFakeRecording = (active: boolean) => {
  const [clock, setClock] = useState({ elapsedMs: 0, level: 0.4 });
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      setClock({
        elapsedMs: Date.now() - started,
        level: 0.25 + Math.random() * 0.75,
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);
  return clock;
};

const toState = (
  key: string,
  clock: { elapsedMs: number; level: number },
): MicDockState => {
  switch (key) {
    case "requesting_permission":
      return { kind: "requesting_permission" };
    case "listening":
      return {
        kind: "listening",
        elapsedMs: clock.elapsedMs,
        level: clock.level,
      };
    case "listening_pulse":
      return { kind: "listening", elapsedMs: clock.elapsedMs };
    case "processing":
      return { kind: "processing" };
    case "denied":
    case "no_device":
    case "insecure":
      return { kind: "unavailable", reason: key };
    case "service_error":
      return {
        kind: "service_error",
        message:
          "El servicio de voz no respondió. Escribe o inténtalo de nuevo.",
      };
    default:
      return { kind: "idle" };
  }
};

function DockStatesDemo() {
  const [key, setKey] = useState("idle");
  const [text, setText] = useState("");
  const clock = useFakeRecording(key.startsWith("listening"));

  return (
    <div className="flex flex-col gap-6">
      <StatePicker
        id="dock-state"
        label="Estado del dock"
        value={key}
        options={OPTIONS}
        onChange={setKey}
      />
      <div className="overflow-hidden rounded-card border border-line bg-canvas pt-10">
        <MicDock
          state={toState(key, clock)}
          text={text}
          onTextChange={setText}
          onSubmitText={() => {
            toast(`onSubmitText: ${text}`);
            setText("");
          }}
          onStart={() => setKey("requesting_permission")}
          onStop={() => setKey("processing")}
          onRetry={() => setKey("requesting_permission")}
        />
      </div>
    </div>
  );
}

export { DockStatesDemo };
