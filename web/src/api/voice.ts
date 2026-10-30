import { api } from "./client";
import type { components } from "./schema";

// Voice conversation with the ElevenLabs Agent (spec 0007).
export type VoiceSession = components["schemas"]["VoiceSession"];

export type VoiceStartResult =
  | { readonly ok: true; readonly data: VoiceSession }
  | { readonly ok: false; readonly message: string };

const FALLBACK = "La voz no está disponible. Escribe la medición.";

const messageOf = (error: unknown): string =>
  typeof error === "object" &&
  error !== null &&
  "message" in error &&
  typeof error.message === "string"
    ? error.message
    : FALLBACK;

export const startVoiceSession = async (
  experimentId: number,
): Promise<VoiceStartResult> => {
  try {
    const { data, error } = await api.POST("/api/voice/session", {
      body: { experiment_id: experimentId },
    });
    return data ? { ok: true, data } : { ok: false, message: messageOf(error) };
  } catch {
    return { ok: false, message: FALLBACK };
  }
};

// Ends the session on our side so its token stops working (AC-1, AC-13). Best
// effort: a failure here only means the token expires on its own.
export const endVoiceSession = async (sid: string): Promise<void> => {
  try {
    await api.DELETE("/api/voice/session/{sid}", { params: { path: { sid } } });
  } catch {
    // Nothing to show: the session is already over for the user.
  }
};
