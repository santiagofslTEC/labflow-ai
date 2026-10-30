"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useState } from "react";

import { startVoiceSession } from "@/api/voice";
import { Button } from "@/components/ui/button";

type LogLine = { readonly at: number; readonly text: string };

// Task 1 only: shows every message and mode change with its time, so the call
// can confirm what the transcript looks like (fact c) and whether muting on
// release ends a held turn quickly (fact d). Replaced by useVoiceSession in task 4.
export function VoiceProbe({
  experimentId,
}: {
  readonly experimentId: number;
}) {
  return (
    <ConversationProvider>
      <Probe experimentId={experimentId} />
    </ConversationProvider>
  );
}

function Probe({ experimentId }: { readonly experimentId: number }) {
  const [log, setLog] = useState<readonly LogLine[]>([]);
  const [hold, setHold] = useState(false);
  const [held, setHeld] = useState(false);
  const add = (text: string) =>
    setLog((lines) => [...lines, { at: performance.now(), text }]);

  const conversation = useConversation({
    micMuted: hold && !held,
    onMessage: ({ role, message }) => add(`${role}: ${message}`),
    onModeChange: ({ mode }) => add(`modo: ${mode}`),
    onStatusChange: ({ status }) => add(`estado: ${status}`),
    onError: (message) => add(`error: ${String(message)}`),
  });

  const start = async () => {
    add("pidiendo sesión…");
    const result = await startVoiceSession(experimentId);
    if (!result.ok) {
      add(`error: ${result.message}`);
      return;
    }
    conversation.startSession({
      signedUrl: result.data.signed_url,
      customLlmExtraBody: { session_token: result.data.session_token },
    });
  };

  const press = (down: boolean) => {
    setHeld(down);
    add(down ? "mic: presionado" : "mic: soltado");
  };

  const connected = conversation.status === "connected";
  const first = log[0]?.at ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {connected ? (
          <Button variant="secondary" onClick={conversation.endSession}>
            Terminar
          </Button>
        ) : (
          <Button onClick={() => void start()}>Empezar</Button>
        )}
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={hold}
            onChange={(event) => setHold(event.target.checked)}
          />
          Mantener para hablar
        </label>
        {hold && connected ? (
          <Button
            variant="secondary"
            onPointerDown={() => press(true)}
            onPointerUp={() => press(false)}
            onPointerLeave={() => held && press(false)}
          >
            {held ? "Hablando…" : "Mantén aquí"}
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-ink-muted">
        Estado: {conversation.status} · {conversation.mode} · mic{" "}
        {conversation.isMuted ? "silenciado" : "abierto"}
      </p>
      <ol className="flex flex-col gap-1 font-mono text-xs text-ink">
        {log.map((line, index) => (
          <li key={index}>
            +{((line.at - first) / 1000).toFixed(2)} s · {line.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
