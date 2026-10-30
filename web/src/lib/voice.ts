// The browser side of a voice session (spec 0007, State transitions).
export type VoiceState =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "listening"; readonly elapsedMs: number }
  | { readonly kind: "thinking"; readonly elapsedMs: number }
  | { readonly kind: "speaking"; readonly elapsedMs: number }
  | { readonly kind: "error"; readonly message: string };

export const SILENCE_MS = 60_000; // hands free ends after 60 s with no user text (AC-10)
export const ACTIVE_NOTEBOOK_KEY = "labflow.activeExperimentId";

export const voiceCopy = {
  start: "Hablar",
  stop: "Terminar",
  starting: "Conectando…",
  listening: "Te escucho. Dicta el ensayo.",
  thinking: "Pensando…",
  speaking: "LabFlow está hablando",
  heardPending: "Escuchando…",
  failed: "No te escuché bien",
  denied: "Micrófono bloqueado. Puedes escribir.",
  noDevice: "No hay micrófono. Puedes escribir.",
  insecure: "El micrófono necesita HTTPS. Puedes escribir.",
  dropped: "Se cortó la conversación. Puedes escribir o volver a intentarlo.",
} as const;

// Why the mic could not open, from the browser's getUserMedia error name.
export const micErrorMessage = (error: unknown): string => {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return voiceCopy.denied;
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return voiceCopy.noDevice;
  return voiceCopy.dropped;
};

// The active notebook (spec 0004, AC-2): the stored id when it is still in the
// list, otherwise the first (most recent) notebook.
export const pickActive = <T extends { readonly id: number }>(
  notebooks: readonly T[],
  stored: string | null,
): T | null => {
  const id = stored === null ? NaN : Number.parseInt(stored, 10);
  return notebooks.find((n) => n.id === id) ?? notebooks[0] ?? null;
};

// The spoken filler our server sends while a reply is still coming (spec 0007,
// AC-22). It may arrive glued to the reply in one agent message.
export const FILLER = "A ver.";

// An agent message without the leading filler; "" when it was only the filler.
export const withoutFiller = (message: string): string => {
  const text = message.trimStart();
  return (text.startsWith(FILLER) ? text.slice(FILLER.length) : text).trim();
};

// The words of a `tentative_user_transcript` socket event (spec 0007, AC-26),
// or null for any other event. The SDK types incoming events loosely.
export const tentativeText = (event: unknown): string | null => {
  if (typeof event !== "object" || event === null) return null;
  const { type, tentative_user_transcription_event: body } = event as {
    readonly type?: unknown;
    readonly tentative_user_transcription_event?: unknown;
  };
  if (type !== "tentative_user_transcript") return null;
  if (typeof body !== "object" || body === null) return null;
  const text = (body as { readonly user_transcript?: unknown }).user_transcript;
  return typeof text === "string" ? text : null;
};
