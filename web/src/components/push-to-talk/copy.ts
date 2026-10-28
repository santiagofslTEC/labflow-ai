import type { MicDockState } from "@/components/mic-dock/types";

// Spanish copy for the push to talk button. Unavailable reasons and the
// service error headline match the dock's copy.
export const copy = {
  button: "Dictar",
  cancel: "Cancelar el dictado",
  keyboard: "Escribir en lugar de dictar",
  hint: {
    idle: "Mantén pulsado para dictar, o toca para empezar",
    holding: "Suelta para enviar",
    tapped: "Toca otra vez para terminar",
    requesting: "Permite el micrófono",
    processing: "Transcribiendo…",
  },
  serviceError: "No te escuché bien",
  reasons: {
    denied: "Micrófono bloqueado. Puedes escribir.",
    no_device: "No hay micrófono. Puedes escribir.",
    insecure: "El micrófono necesita HTTPS. Puedes escribir.",
  },
} as const;

export const announcement = (state: MicDockState): string => {
  switch (state.kind) {
    case "idle":
      return "";
    case "requesting_permission":
      return copy.hint.requesting;
    case "listening":
      return "Escuchando";
    case "processing":
      return copy.hint.processing;
    case "unavailable":
      return copy.reasons[state.reason];
    case "service_error":
      return "";
  }
};
