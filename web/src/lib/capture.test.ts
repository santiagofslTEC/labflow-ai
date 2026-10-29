import { describe, expect, it } from "vitest";

import { type CardView, cardState } from "./capture";

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
