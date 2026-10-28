// Props mirror spec 0006's ProposalView (camelCase), so CaptureStage maps data straight in.
export type ValueFlag = {
  readonly reason: "out_of_range" | "converted" | "code_match";
  readonly text: string; // Spanish, from the API
};

export type ProposalValue = {
  readonly variableId: number;
  readonly name: string; // variable.name
  readonly unit: string | null; // proposal_value.unit (null for unitless)
  readonly value: number | null; // null = missing, shown as an empty slot
  readonly previous?: number | null; // correction only: saved measurement.value
  readonly saidText?: string | null; // the user's own words; null = typed by hand
  readonly interpreted?: boolean; // highlight the understood side (words or a converted unit)
  readonly flags?: readonly ValueFlag[]; // reasons to look again (AC-23)
  readonly checked?: boolean; // a flagged value the user checked or typed
};

export type TrialChoice = "correction" | "new";

export type ProposalCardState =
  | { readonly kind: "proposed" }
  | { readonly kind: "editing"; readonly variableId: number }
  | { readonly kind: "checking"; readonly variableId: number }
  | { readonly kind: "saving" }
  | { readonly kind: "saved" }
  | { readonly kind: "needs_clarification"; readonly question: string }
  | { readonly kind: "choose_trial"; readonly question: string }
  | { readonly kind: "pending_other_trial"; readonly question: string }
  | { readonly kind: "correction" }
  | { readonly kind: "save_error"; readonly message: string };

export type ProposalCardProps = {
  readonly trialNumber: number | null; // in correction: the trial being replaced
  readonly values: readonly ProposalValue[]; // already in variable.position order
  readonly layoutIdPrefix?: string; // flight: value and table cell share `${prefix}-${variableId}`
  readonly phrase: string;
  readonly source: "voice" | "text";
  readonly state: ProposalCardState;
  // From the API (AC-24). Omitted: confirmable when no value is missing or unchecked.
  readonly canConfirm?: boolean;
  readonly onConfirm: () => void;
  readonly onEdit: (variableId: number) => void;
  readonly onCommitEdit: (variableId: number, value: number) => void;
  readonly onCancelEdit: () => void;
  readonly onDiscard: () => void;
  readonly onRetry: () => void;
  readonly onSettled: () => void; // once, after the saved exit animation
  readonly onCheck?: (variableId: number) => void;
  readonly onChooseTrial?: (choice: TrialChoice) => void;
};

export const isUnsaved = (state: ProposalCardState): boolean =>
  state.kind !== "saved";

export const flightLayoutId = (
  prefix: string | undefined,
  variableId: number,
): string | undefined => (prefix ? `${prefix}-${variableId}` : undefined);

const flagsOf = (value: ProposalValue): readonly ValueFlag[] =>
  value.flags ?? [];

// A value still waiting for its check (AC-23).
export const needsCheck = (value: ProposalValue): boolean =>
  value.value !== null && flagsOf(value).length > 0 && !value.checked;

export const isFlagged = (values: readonly ProposalValue[]): boolean =>
  values.some((value) => flagsOf(value).length > 0);
