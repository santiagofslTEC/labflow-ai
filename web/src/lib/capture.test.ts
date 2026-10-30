import { describe, expect, it } from "vitest";

import {
  type CardView,
  type Turn,
  cardState,
  isSelection,
  releasesWaiting,
  sentenceQuestion,
} from "./capture";

const card: CardView = {
  id: 1,
  trialNumber: null,
  targetTrialId: null,
  values: [],
  phrase: "temperatura 23 a 71",
  source: "text",
  flagged: false,
  question: { reason: "missing_trial", text: "¿Qué número de ensayo es?" },
  canConfirm: false,
};

describe("cardState", () => {
  it("shows a two values reply as that turn's question", () => {
    const text = "Dijiste 23 y 71 para Temperatura. ¿Cuál guardo?";
    expect(cardState(card, { reason: "two_values", text })).toEqual({
      kind: "needs_clarification",
      question: text,
    });
  });

  it("falls back to the card's own question", () => {
    expect(cardState(card, null)).toEqual({
      kind: "needs_clarification",
      question: "¿Qué número de ensayo es?",
    });
  });
});

describe("partial readings (spec 0011)", () => {
  const change = "¿Cambio Temperatura del ensayo 3 de 65 a 68 °C?";
  const waiting: CardView = {
    ...card,
    trialNumber: 3,
    targetTrialId: 33,
    question: { reason: "confirm_change", text: change },
  };

  it("shows a confirm_change card as a correction asking the change (AC-4)", () => {
    expect(cardState(waiting, null)).toEqual({
      kind: "correction",
      question: change,
    });
  });

  it("a targeted card with no change to ask is a plain proposal", () => {
    const adding = {
      ...waiting,
      question: { reason: "ready" as const, text: "¿Lo guardo?" },
    };
    expect(cardState(adding, null)).toEqual({ kind: "proposed" });
  });

  it("knows an empty selection (AC-8)", () => {
    const selection = {
      ...card,
      trialNumber: 4,
      question: {
        reason: "trial_selected" as const,
        text: "Ensayo 4. Dime los valores.",
      },
    };
    expect(isSelection(selection)).toBe(true);
    expect(isSelection(waiting)).toBe(false);
  });

  it("resends the waiting sentence only once no card is pending (AC-16)", () => {
    const saved = {
      trialId: 3,
      trialNumber: 3,
      created: false,
      proposalId: 9,
      auto: true,
      values: [],
    };
    const split: Turn = {
      reply: { reason: "confirm_change", text: change },
      card: waiting,
      saved,
    };
    expect(releasesWaiting(split)).toBe(false);
    expect(releasesWaiting({ ...split, card: null })).toBe(true);
  });

  it("only a sentence question shows beside a selection", () => {
    const text = "No sé a qué variable va ese valor. ¿Es Temperatura?";
    expect(sentenceQuestion({ reason: "ambiguous_variable", text })).toBe(text);
    expect(
      sentenceQuestion({ reason: "trial_selected", text: "Ensayo 4." }),
    ).toBeNull();
  });
});
