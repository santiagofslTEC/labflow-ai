import type { ProposalView, ReplyReason, TurnResponse } from "@/api/capture";
import type {
  ProposalCardState,
  ProposalValue,
} from "@/components/proposal-card/types";

// The card as the screen uses it: ProposalView in camelCase (spec 0006).
export type CardView = {
  readonly id: number;
  readonly trialNumber: number | null;
  readonly targetTrialId: number | null;
  readonly values: readonly ProposalValue[];
  readonly phrase: string;
  readonly source: "voice" | "text";
  readonly flagged: boolean;
  readonly question: { readonly reason: ReplyReason; readonly text: string };
  readonly canConfirm: boolean;
};

// What a save wrote. `auto`: LabFlow saved a clean reading with no tap, and it
// can be undone until the next sentence (spec 0006, AC-27 to AC-29).
export type SavedTrial = {
  readonly trialId: number;
  readonly trialNumber: number;
  readonly created: boolean;
  readonly proposalId: number;
  readonly auto: boolean;
  readonly values: readonly {
    readonly variableId: number;
    readonly name: string;
    readonly value: number;
    readonly unit: string | null;
  }[];
};

export type Turn = {
  readonly reply: {
    readonly reason: ReplyReason;
    readonly text: string;
  } | null;
  readonly card: CardView | null;
  readonly saved: SavedTrial | null;
};

export const toCard = (view: ProposalView): CardView => ({
  id: view.id,
  trialNumber: view.trial_number ?? null,
  targetTrialId: view.target_trial_id ?? null,
  values: view.values.map((v) => ({
    variableId: v.variable_id,
    name: v.name,
    unit: v.unit ?? null,
    value: v.value ?? null,
    previous: v.previous ?? null,
    saidText: v.said_text ?? null,
    interpreted: v.interpreted,
    flags: v.flags,
    checked: v.checked,
  })),
  phrase: view.phrase,
  source: view.source,
  flagged: view.flagged,
  question: view.question,
  canConfirm: view.can_confirm,
});

export const toTurn = (response: TurnResponse): Turn => ({
  reply: response.reply ?? null,
  card: response.proposal ? toCard(response.proposal) : null,
  saved: response.saved
    ? {
        trialId: response.saved.trial_id,
        trialNumber: response.saved.trial_number,
        created: response.saved.created,
        proposalId: response.saved.proposal_id,
        auto: response.saved.auto,
        values: response.saved.values.map((v) => ({
          variableId: v.variable_id,
          name: v.name,
          value: v.value,
          unit: v.unit ?? null,
        })),
      }
    : null,
});

// Reasons that come from one sentence: shown as that turn's question (AC-17).
const SENTENCE_REASONS: ReadonlySet<ReplyReason> = new Set([
  "ambiguous_variable",
  "two_values",
  "unknown_unit",
  "unclear_number",
]);

// Which card state the stage shows, from the card and the last reply (AC-18).
export const cardState = (
  card: CardView,
  reply: Turn["reply"],
): ProposalCardState => {
  if (reply?.reason === "pending_other_trial")
    return { kind: "pending_other_trial", question: reply.text };
  if (reply && SENTENCE_REASONS.has(reply.reason))
    return { kind: "needs_clarification", question: reply.text };
  switch (card.question.reason) {
    case "choose_trial": // cards from before spec 0011 only
      return { kind: "choose_trial", question: card.question.text };
    case "missing_trial":
    case "missing_values":
      return { kind: "needs_clarification", question: card.question.text };
    case "confirm_change": // a value would replace a saved one (spec 0011, AC-4)
      return { kind: "correction", question: card.question.text };
    default:
      return { kind: "proposed" };
  }
};

// The question one sentence left, shown beside an empty selection (AC-6).
export const sentenceQuestion = (reply: Turn["reply"]): string | null =>
  reply && SENTENCE_REASONS.has(reply.reason) ? reply.text : null;

// An empty selection (spec 0011, AC-8): a trial number and no values yet. The
// stage shows it as a quiet line, not a card with a save button.
export const isSelection = (card: CardView): boolean =>
  card.question.reason === "trial_selected";

// The waiting sentence of AC-8 survives these responses and is sent after saved
// or discarded; anything else drops it.
export const keepsWaiting = (turn: Turn, fromCheck: boolean): boolean =>
  fromCheck ||
  turn.reply?.reason === "check_values" ||
  turn.reply?.reason === "confirm_change" ||
  turn.reply?.reason === "pending_other_trial";

// Only once no card is pending: a split turn saves and still leaves a card
// waiting, so it does not resend (spec 0011, AC-16).
export const releasesWaiting = (turn: Turn): boolean =>
  (turn.saved !== null || turn.reply?.reason === "discarded") &&
  turn.card === null;
