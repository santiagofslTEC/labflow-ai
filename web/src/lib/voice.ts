// The browser side of a voice session (spec 0007, State transitions).
export type VoiceState =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "listening"; readonly elapsedMs: number }
  | { readonly kind: "speaking"; readonly elapsedMs: number }
  | { readonly kind: "error"; readonly message: string };

export const SILENCE_MS = 60_000; // hands free ends after 60 s with no user text (AC-10)
export const ACTIVE_NOTEBOOK_KEY = "labflow.activeExperimentId";

export const voiceCopy = {
  start: "Hablar",
  stop: "Terminar",
  starting: "Conectando…",
  listening: "Te escucho. Dicta el ensayo.",
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
