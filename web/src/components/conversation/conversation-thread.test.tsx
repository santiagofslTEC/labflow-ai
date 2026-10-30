import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { getTurns, type TurnLine } from "@/api/experiments";
import { renderWithQuery } from "@/test/query";

import { ConversationThread } from "./conversation-thread";

vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  getTurns: vi.fn(),
}));

const turnsMock = vi.mocked(getTurns);
const at = new Date().toISOString();

const lines: readonly TurnLine[] = [
  {
    id: 1,
    role: "user",
    text: "Ensayo 3: 50 grados, 15 minutos, 73 por ciento",
    source: "voice",
    created_at: at,
    readings: [
      {
        variable: "Temperatura",
        said_text: "50 grados",
        value: 50,
        unit: "°C",
        trial_number: 3,
      },
    ],
  },
  {
    id: 2,
    role: "assistant",
    text: "Guardé el ensayo 3.",
    source: null,
    created_at: at,
    readings: [],
  },
  {
    id: 3,
    role: "user",
    text: "¿cuál fue el mejor?",
    source: "text",
    created_at: at,
    readings: [],
  },
];

beforeEach(() => {
  turnsMock.mockReset();
});

describe("ConversationThread", () => {
  it("shows spoken and typed lines and LabFlow's replies in order", async () => {
    turnsMock.mockResolvedValue({ ok: true, data: lines });
    const { container } = renderWithQuery(
      <ConversationThread experimentId={7} />,
    );

    const thread = await screen.findByRole("region", { name: "Conversación" });
    // The conversation's lines, not the reading cards nested inside a reply.
    const items = within(thread)
      .getAllByRole("listitem")
      .filter((item) => item.parentElement?.tagName === "OL");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(lines[0]?.text ?? "");
    expect(items[0]).toHaveTextContent("Dictado");
    expect(items[1]).toHaveTextContent("LabFlow");
    expect(items[1]).toHaveTextContent("Guardé el ensayo 3.");
    expect(items[1]).toHaveTextContent("LabFlow entendió");
    expect(items[1]).toHaveTextContent("50 grados");
    expect(items[1]).toHaveTextContent("50 °C");
    expect(items[2]).toHaveTextContent("Escrito");
    expect(within(thread).getByText("Hoy")).toBeInTheDocument();
    expect(turnsMock).toHaveBeenCalledWith(7);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("invites the first reading when the thread is empty", async () => {
    turnsMock.mockResolvedValue({ ok: true, data: [] });
    renderWithQuery(<ConversationThread experimentId={7} />);
    expect(
      await screen.findByText("Tu primer ensayo empieza aquí"),
    ).toBeInTheDocument();
  });

  it("says so when the thread cannot load", async () => {
    turnsMock.mockResolvedValue({ ok: false, error: { kind: "not_found" } });
    renderWithQuery(<ConversationThread experimentId={7} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos cargar la conversación.",
    );
  });
});
