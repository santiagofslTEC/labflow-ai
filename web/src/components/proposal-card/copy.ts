import { formatExact } from "@/lib/format";

import {
  needsCheck,
  type ProposalCardState,
  type ProposalValue,
} from "./types";

// Spanish copy from spec 0003's copy table plus spec 0006, in one place.
const trial = (n: number | null): string => (n === null ? "?" : String(n));

const quantity = (value: number, unit: string | null): string =>
  formatExact(value, unit);

export const copy = {
  unsavedBadge: "Sin guardar",
  savedBadge: "Guardado",
  title: (n: number | null) => `Ensayo ${trial(n)}`,
  promptProposed: "¿Lo guardo?",
  promptFlagged: "Revisa antes de guardar",
  promptCorrection: (n: number | null) => `¿Reemplazo el ensayo ${trial(n)}?`,
  emptySlot: (name: string) => `${name} sin valor`,
  badNumber: "Escribe un número, por ejemplo 73,5",
  saveErrorHeadline: "No se pudo guardar",
  edit: (name: string) => `Editar ${name}`,
  sourceVoice: "Dictado",
  sourceText: "Escrito",
  before: "Antes",
  after: "Ahora",
  handwritten: "Escrito a mano",
  said: "Dijiste",
  understood: "LabFlow entendió",
  checkedNote: "Revisado",
  check: (value: number, unit: string | null) =>
    `Sí, es ${quantity(value, unit)}`,
  chooseCorrection: (n: number | null) => `Corregir ensayo ${trial(n)}`,
  chooseNew: "Es otro ensayo",
  actions: {
    discard: "Descartar",
    cancel: "Cancelar",
    save: "Guardar",
    saving: "Guardando…",
    retry: "Reintentar",
  },
} as const;

// The save button names what it saves (spec 0006, AC-22).
export const saveLabel = (
  values: readonly ProposalValue[],
  trialNumber: number | null,
  isCorrection: boolean,
): string => {
  const set = values.filter(
    (v): v is ProposalValue & { readonly value: number } => v.value !== null,
  );
  const n = trial(trialNumber);
  if (set.length === 0) return copy.actions.save;
  if (isCorrection) {
    if (set.length > 1) return `Reemplazar ensayo ${n} · ${set.length} valores`;
    const [only] = set as [ProposalValue & { readonly value: number }];
    const previous = only.previous ?? null;
    return previous === null
      ? `Guardar ${quantity(only.value, only.unit)} en ensayo ${n}`
      : `Reemplazar ${quantity(previous, only.unit)} por ${quantity(only.value, only.unit)}`;
  }
  if (set.length >= 3) return `Guardar ensayo ${n} · ${set.length} valores`;
  return `Guardar ${set.map((v) => quantity(v.value, v.unit)).join(" y ")}`;
};

// The polite live region text for each state; save_error speaks through role="alert".
// Flagged values come first, so a screen reader hears what to check before anything else.
export const announcement = (
  state: ProposalCardState,
  trialNumber: number | null,
  values: readonly ProposalValue[],
): string => {
  const n = trial(trialNumber);
  const toCheck = values.filter(needsCheck).map((v) => v.name);
  const flagged =
    toCheck.length > 0 ? `${copy.promptFlagged}: ${toCheck.join(", ")}. ` : "";
  switch (state.kind) {
    case "proposed":
      return `${flagged}Propuesta del ensayo ${n}, sin guardar`;
    case "editing": {
      const name = values.find((v) => v.variableId === state.variableId)?.name;
      return `Editando ${name ?? "valor"}`;
    }
    case "checking":
      return `${flagged}Revisando`;
    case "saving":
      return `Guardando ensayo ${n}`;
    case "saved":
      return `Ensayo ${n} guardado`;
    case "needs_clarification":
      return `${flagged}${state.question}`;
    case "choose_trial":
    case "pending_other_trial":
      return state.question;
    case "correction":
      return state.question ?? `El ensayo ${n} ya existe. ¿Lo reemplazo?`;
    case "save_error":
      return "";
  }
};
