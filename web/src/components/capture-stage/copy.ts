import type { CaptureFailure } from "@/api/capture";

export const copy = {
  label: "Escribe una medición",
  placeholder: "Ensayo 6: temperatura 65 grados, rendimiento 74 por ciento",
  send: "Enviar",
  sending: "Enviando…",
  limit: (n: number) => `${n}/500`,
  loadError: "No pude cargar la tarjeta pendiente.",
} as const;

// The API's Spanish message when there is one; fixed copy otherwise.
export const failureMessage = (failure: CaptureFailure): string => {
  switch (failure.kind) {
    case "rejected":
      return failure.message;
    case "unauthorized":
      return "Tu acceso venció. Escribe tu código de acceso para continuar.";
    case "unavailable":
      return "No pude conectar con LabFlow. Intenta de nuevo.";
  }
};
