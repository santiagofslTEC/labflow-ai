import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import {
  confirmProposal,
  getProposal,
  sendUtterance,
  checkValue,
  undoSave,
  type ProposalView,
  type TurnResponse,
} from "@/api/capture";
import { renderWithQuery } from "@/test/query";

import { CaptureStage } from "./capture-stage";

vi.mock("@/api/capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/capture")>()),
  getProposal: vi.fn(),
  sendUtterance: vi.fn(),
  undoSave: vi.fn(),
  confirmProposal: vi.fn(),
  checkValue: vi.fn(),
}));

const getMock = vi.mocked(getProposal);
const sendMock = vi.mocked(sendUtterance);
const confirmMock = vi.mocked(confirmProposal);
const checkMock = vi.mocked(checkValue);
const undoMock = vi.mocked(undoSave);

const value = (
  variable_id: number,
  name: string,
  unit: string,
  v: number | null,
  extra: Partial<ProposalView["values"][number]> = {},
): ProposalView["values"][number] => ({
  variable_id,
  name,
  unit,
  value: v,
  previous: null,
  said_text: v === null ? null : `${v}`,
  interpreted: false,
  flags: [],
  checked: false,
  ...extra,
});

const card = (overrides: Partial<ProposalView> = {}): ProposalView => ({
  id: 10,
  trial_number: 6,
  target_trial_id: null,
  values: [
    value(1, "Temperatura", "°C", 65),
    value(2, "Duración", "min", 20),
    value(3, "Rendimiento", "%", 74),
  ],
  phrase: "Ensayo 6: 65 grados, 20 minutos, 74 por ciento",
  source: "text",
  flagged: false,
  question: { reason: "ready", text: "¿Lo guardo?" },
  can_confirm: true,
  ...overrides,
});

const turn = (overrides: Partial<TurnResponse> = {}): TurnResponse => ({
  turn_id: 1,
  reply: { reason: "ready", text: "¿Lo guardo?" },
  proposal: card(),
  saved: null,
  ...overrides,
});

const ok = <T,>(data: T) => ({ ok: true as const, data });

const savedValues = [
  { variable_id: 1, name: "Temperatura", value: 65, unit: "°C" },
  { variable_id: 2, name: "Duración", value: 20, unit: "min" },
  { variable_id: 3, name: "Rendimiento", value: 73.5, unit: "%" },
];

const confirmed: NonNullable<TurnResponse["saved"]> = {
  trial_id: 6,
  trial_number: 6,
  created: true,
  proposal_id: 10,
  auto: false,
  values: savedValues,
};

// A clean reading LabFlow saved with no tap (spec 0006, AC-27).
const autoSaved = (): TurnResponse =>
  turn({
    reply: { reason: "auto_saved", text: "Guardé el ensayo 6." },
    proposal: null,
    saved: { ...confirmed, auto: true },
  });

beforeEach(() => {
  getMock.mockResolvedValue(ok(null));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

const field = () =>
  screen.getByRole("textbox", { name: "Escribe una medición" });

describe("CaptureStage (spec 0006, AC-18)", () => {
  it("sends on Enter, clears the field, and shows the card", async () => {
    const user = userEvent.setup();
    sendMock.mockResolvedValue(ok(turn()));
    const { container } = renderWithQuery(<CaptureStage experimentId={1} />);
    await user.type(field(), "Ensayo 6, 65 grados{Enter}");
    expect(sendMock).toHaveBeenCalledWith(1, "Ensayo 6, 65 grados");
    expect(
      await screen.findByRole("button", {
        name: "Guardar ensayo 6 · 3 valores",
      }),
    ).toBeInTheDocument();
    expect(field()).toHaveValue("");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("keeps the text and shows the message on a 503", async () => {
    const user = userEvent.setup();
    sendMock.mockResolvedValue({
      ok: false,
      error: {
        kind: "rejected",
        code: "llm_unavailable",
        message: "No pude procesarlo. Intenta de nuevo o edita la tarjeta.",
      },
    });
    renderWithQuery(<CaptureStage experimentId={1} />);
    await user.type(field(), "rendimiento 74{Enter}");
    expect(
      await screen.findByText(
        "No pude procesarlo. Intenta de nuevo o edita la tarjeta.",
      ),
    ).toBeInTheDocument();
    expect(field()).toHaveValue("rendimiento 74");
  });

  it("runs one request at a time", async () => {
    const user = userEvent.setup();
    let release: (
      value: Awaited<ReturnType<typeof sendUtterance>>,
    ) => void = () => undefined;
    sendMock.mockReturnValue(new Promise((resolve) => (release = resolve)));
    renderWithQuery(<CaptureStage experimentId={1} />);
    await user.type(field(), "uno{Enter}");
    await user.type(field(), "{Enter}");
    expect(sendMock).toHaveBeenCalledTimes(1);
    await act(async () => release(ok(turn())));
  });

  it("shows a pending card after a reload", async () => {
    getMock.mockResolvedValue(
      ok(
        card({
          question: {
            reason: "missing_values",
            text: "Me falta Duración. ¿Cuánto fue?",
          },
        }),
      ),
    );
    renderWithQuery(<CaptureStage experimentId={1} />);
    expect(
      await screen.findByText("Me falta Duración. ¿Cuánto fue?"),
    ).toBeInTheDocument();
  });

  it("sends the waiting sentence again after card 6 is saved (AC-8)", async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue(ok(card()));
    sendMock
      .mockResolvedValueOnce(
        ok(
          turn({
            reply: {
              reason: "pending_other_trial",
              text: "Tienes el ensayo 6 sin guardar. ¿Lo guardo o lo descarto?",
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        ok(turn({ proposal: card({ id: 11, trial_number: 7 }) })),
      );
    confirmMock.mockResolvedValue(
      ok(
        turn({
          turn_id: null,
          reply: { reason: "saved", text: "Guardado el ensayo 6." },
          proposal: null,
          saved: confirmed,
        }),
      ),
    );
    const onSaved = vi.fn();
    renderWithQuery(<CaptureStage experimentId={1} onSaved={onSaved} />);
    await screen.findByRole("button", { name: "Guardar ensayo 6 · 3 valores" });

    await user.type(field(), "Ensayo 7, 60 grados{Enter}");
    expect(
      await screen.findByText(
        "Tienes el ensayo 6 sin guardar. ¿Lo guardo o lo descarto?",
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Guardar ensayo 6 · 3 valores" }),
    );

    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(2));
    expect(sendMock).toHaveBeenLastCalledWith(1, "Ensayo 7, 60 grados");
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ trialId: 6, trialNumber: 6, auto: false }),
    );
  });

  it("drops the waiting sentence when another sentence comes in", async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue(ok(card()));
    sendMock
      .mockResolvedValueOnce(
        ok(
          turn({
            reply: {
              reason: "pending_other_trial",
              text: "Tienes el ensayo 6 sin guardar. ¿Lo guardo o lo descarto?",
            },
          }),
        ),
      )
      .mockResolvedValueOnce(ok(turn()));
    confirmMock.mockResolvedValue(
      ok(
        turn({
          turn_id: null,
          reply: { reason: "saved", text: "Guardado el ensayo 6." },
          proposal: null,
          saved: confirmed,
        }),
      ),
    );
    renderWithQuery(<CaptureStage experimentId={1} />);
    await screen.findByRole("button", { name: "Guardar ensayo 6 · 3 valores" });
    await user.type(field(), "Ensayo 7, 60 grados{Enter}");
    // The reply can show twice (transcript and live region), so wait for any copy.
    await screen.findAllByText(/Tienes el ensayo 6 sin guardar/);
    await user.type(field(), "rendimiento 75{Enter}");
    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(2));
    await user.click(
      screen.getByRole("button", { name: "Guardar ensayo 6 · 3 valores" }),
    );
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("checks a flagged value through the API", async () => {
    const user = userEvent.setup();
    const flagged = card({
      flagged: true,
      can_confirm: false,
      question: {
        reason: "check_values",
        text: "Antes de guardar, revisa Duración.",
      },
      values: [
        value(1, "Temperatura", "°C", 65),
        value(2, "Duración", "min", 120, {
          said_text: "2 horas",
          interpreted: true,
          flags: [{ reason: "converted", text: "Convertí 2 horas a 120 min" }],
        }),
        value(3, "Rendimiento", "%", 74),
      ],
    });
    getMock.mockResolvedValue(ok(flagged));
    checkMock.mockResolvedValue(ok(turn({ turn_id: null })));
    const { container } = renderWithQuery(<CaptureStage experimentId={1} />);
    const save = await screen.findByRole("button", {
      name: "Guardar ensayo 6 · 3 valores",
    });
    expect(save).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Sí, es 120 min" }));
    expect(checkMock).toHaveBeenCalledWith(10, 2);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Guardar ensayo 6 · 3 valores" }),
      ).toBeEnabled(),
    );
  });
});

describe("CaptureStage save without the card (spec 0006, AC-27 to AC-29)", () => {
  const notice = "Guardado ensayo 6 · 65 °C, 20 min y 73,5 %";

  it("shows the notice for a clean reading, with no card", async () => {
    const user = userEvent.setup();
    sendMock.mockResolvedValue(ok(autoSaved()));
    const onSaved = vi.fn();
    const { container } = renderWithQuery(
      <CaptureStage experimentId={1} onSaved={onSaved} />,
    );
    await user.type(field(), "Ensayo 6: 65 grados, 20 minutos, 73,5 %{Enter}");
    expect(await screen.findByRole("status")).toHaveTextContent(notice);
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Guardar/ }),
    ).not.toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ trialNumber: 6, auto: true }),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("undo removes the save and brings the same card back", async () => {
    const user = userEvent.setup();
    sendMock.mockResolvedValue(ok(autoSaved()));
    undoMock.mockResolvedValue(ok(turn({ turn_id: 2 })));
    const onUndone = vi.fn();
    renderWithQuery(<CaptureStage experimentId={1} onUndone={onUndone} />);
    await user.type(field(), "Ensayo 6: 65 grados, 20 minutos, 73,5 %{Enter}");
    await user.click(await screen.findByRole("button", { name: "Deshacer" }));
    expect(undoMock).toHaveBeenCalledWith(10);
    expect(
      await screen.findByRole("button", {
        name: "Guardar ensayo 6 · 3 valores",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(notice)).not.toBeInTheDocument();
    expect(onUndone).toHaveBeenCalled();
  });

  it("the next sentence hides the notice", async () => {
    const user = userEvent.setup();
    sendMock.mockResolvedValueOnce(ok(autoSaved())).mockResolvedValueOnce(
      ok(
        turn({
          reply: { reason: "off_topic", text: "Solo registro mediciones." },
          proposal: null,
        }),
      ),
    );
    renderWithQuery(<CaptureStage experimentId={1} />);
    await user.type(field(), "Ensayo 6: 65 grados, 20 minutos, 73,5 %{Enter}");
    await screen.findByRole("button", { name: "Deshacer" });
    await user.type(field(), "hola{Enter}");
    expect(
      await screen.findByText("Solo registro mediciones."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deshacer" }),
    ).not.toBeInTheDocument();
  });

  it("a flagged reading still shows the card, not the notice", async () => {
    const user = userEvent.setup();
    sendMock.mockResolvedValue(
      ok(
        turn({
          reply: {
            reason: "check_values",
            text: "Antes de guardar, revisa Temperatura.",
          },
          proposal: card({
            flagged: true,
            can_confirm: false,
            values: [
              value(1, "Temperatura", "°C", 500, {
                flags: [
                  {
                    reason: "out_of_range",
                    text: "Fuera del rango esperado: 20 a 100 °C",
                  },
                ],
              }),
              value(2, "Duración", "min", 20),
              value(3, "Rendimiento", "%", 74),
            ],
          }),
        }),
      ),
    );
    renderWithQuery(<CaptureStage experimentId={1} />);
    await user.type(field(), "Ensayo 6: 500 grados, 20 minutos, 74 %{Enter}");
    expect(
      await screen.findByRole("button", {
        name: "Guardar ensayo 6 · 3 valores",
      }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Deshacer" }),
    ).not.toBeInTheDocument();
  });

  it("shows the API message when undo is too late", async () => {
    const user = userEvent.setup();
    sendMock.mockResolvedValue(ok(autoSaved()));
    undoMock.mockResolvedValue({
      ok: false,
      error: {
        kind: "rejected",
        code: "undo_expired",
        message:
          "Ya no se puede deshacer; corrige el ensayo dictándolo de nuevo.",
      },
    });
    renderWithQuery(<CaptureStage experimentId={1} />);
    await user.type(field(), "Ensayo 6: 65 grados, 20 minutos, 73,5 %{Enter}");
    await user.click(await screen.findByRole("button", { name: "Deshacer" }));
    expect(
      await screen.findByText(
        "Ya no se puede deshacer; corrige el ensayo dictándolo de nuevo.",
      ),
    ).toBeInTheDocument();
  });
});
