import type { ProposalCardState, ProposalValue } from "./types";

// Spanish copy from spec 0003's copy table, in one place.
const trial = (n: number | null): string => (n === null ? "?" : String(n));

export const copy = {
  unsavedBadge: "Sin guardar",
  savedBadge: "Guardado",
  title: (n: number | null) => `Ensayo ${trial(n)}`,
  promptProposed: "¿Lo guardo?",
  promptCorrection: (n: number | null) => `¿Reemplazo el ensayo ${trial(n)}?`,
  emptySlot: (name: string) => `${name} sin valor`,
  badNumber: "Escribe un número, por ejemplo 73,5",
  saveErrorHeadline: "No se pudo guardar",
  edit: (name: string) => `Editar ${name}`,
  sourceVoice: "Dictado",
  sourceText: "Escrito",
  before: "Antes",
  after: "Ahora",
  actions: {
    confirm: "Confirmar",
    replace: "Reemplazar",
    discard: "Descartar",
    cancel: "Cancelar",
    save: "Guardar",
    saving: "Guardando…",
    retry: "Reintentar",
  },
} as const;

// The polite live region text for each state; save_error speaks through role="alert".
export const announcement = (
  state: ProposalCardState,
  trialNumber: number | null,
  values: readonly ProposalValue[],
): string => {
  const n = trial(trialNumber);
  switch (state.kind) {
    case "proposed":
      return `Propuesta del ensayo ${n}, sin guardar`;
    case "editing": {
      const name = values.find((v) => v.variableId === state.variableId)?.name;
      return `Editando ${name ?? "valor"}`;
    }
    case "saving":
      return `Guardando ensayo ${n}`;
    case "saved":
      return `Ensayo ${n} guardado`;
    case "needs_clarification":
      return `Faltan valores: ${state.question}`;
    case "correction":
      return `El ensayo ${n} ya existe. ¿Lo reemplazo?`;
    case "save_error":
      return "";
  }
};
