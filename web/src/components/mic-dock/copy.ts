import type { MicDockState } from "./types";

// Spanish copy from spec 0003's copy table.
export const copy = {
  dictate: "Dictar",
  stop: "Detener",
  submit: "Enviar",
  retry: "Reintentar",
  requesting: "Permite el micrófono",
  processing: "Transcribiendo…",
  serviceError: "No te escuché bien",
  placeholder:
    "Escribe una medición, por ejemplo: Ensayo 3, temperatura 50 grados",
  fieldLabel: "Medición escrita",
  reasons: {
    denied: "Micrófono bloqueado. Puedes escribir.",
    no_device: "No hay micrófono. Puedes escribir.",
    insecure: "El micrófono necesita HTTPS. Puedes escribir.",
  },
} as const;

// The polite live region text; service_error speaks through role="alert".
export const announcement = (state: MicDockState): string => {
  switch (state.kind) {
    case "idle":
      return "Micrófono listo";
    case "requesting_permission":
      return copy.requesting;
    case "listening":
      return "Escuchando";
    case "processing":
      return copy.processing;
    case "unavailable":
      return copy.reasons[state.reason];
    case "service_error":
      return "";
  }
};
