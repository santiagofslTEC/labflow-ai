// Props mirror spec 0002's proposal and proposal_value, so feature 6 maps data straight in.
export type ProposalValue = {
  readonly variableId: number;
  readonly name: string; // variable.name
  readonly unit: string | null; // proposal_value.unit (null for unitless)
  readonly value: number | null; // null = missing, shown as an empty slot
  readonly previous?: number | null; // correction only: saved measurement.value
  readonly warning?: string | null; // feature 11 fills it
};

export type ProposalCardState =
  | { readonly kind: "proposed" }
  | { readonly kind: "editing"; readonly variableId: number }
  | { readonly kind: "saving" }
  | { readonly kind: "saved" }
  | { readonly kind: "needs_clarification"; readonly question: string }
  | { readonly kind: "correction" }
  | { readonly kind: "save_error"; readonly message: string };

export type ProposalCardProps = {
  readonly trialNumber: number | null; // in correction: the trial being replaced
  readonly values: readonly ProposalValue[]; // already in variable.position order
  readonly layoutIdPrefix?: string; // flight: value and table cell share `${prefix}-${variableId}`
  readonly phrase: string;
  readonly source: "voice" | "text";
  readonly state: ProposalCardState;
  readonly onConfirm: () => void;
  readonly onEdit: (variableId: number) => void;
  readonly onCommitEdit: (variableId: number, value: number) => void;
  readonly onCancelEdit: () => void;
  readonly onDiscard: () => void;
  readonly onRetry: () => void;
  readonly onSettled: () => void; // once, after the saved exit animation
};

export const isUnsaved = (state: ProposalCardState): boolean =>
  state.kind !== "saved";

export const flightLayoutId = (
  prefix: string | undefined,
  variableId: number,
): string | undefined => (prefix ? `${prefix}-${variableId}` : undefined);
