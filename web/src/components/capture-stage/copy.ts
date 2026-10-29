import type { CaptureFailure } from "@/api/capture";
import { formatQuantity } from "@/lib/format";
import type { SavedTrial } from "@/lib/capture";

export const copy = {
  label: "Escribe una medición",
  placeholder: "Ensayo 6: temperatura 65 grados, rendimiento 74 por ciento",
  send: "Enviar",
  sending: "Enviando…",
  limit: (n: number) => `${n}/500`,
  loadError: "No pude cargar la tarjeta pendiente.",
  undo: "Deshacer",
  undoing: "Deshaciendo…",
} as const;

const joined = (parts: readonly string[]): string =>
  parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} y ${parts.at(-1) ?? ""}`;

// The auto save notice (spec 0006, AC-28): every saved value, in order.
export const savedNotice = (saved: SavedTrial): string => {
  const values = joined(
    saved.values.map((v) => formatQuantity(v.value, v.unit)),
  );
  return values
    ? `Guardado ensayo ${saved.trialNumber} · ${values}`
    : `Guardado ensayo ${saved.trialNumber}`;
};

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
