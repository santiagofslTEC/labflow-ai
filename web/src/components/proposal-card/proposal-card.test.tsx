import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import {
  SAMPLE_FLAGGED_VALUES,
  SAMPLE_SAID_VALUES,
  SAMPLE_PH_VALUE,
  SAMPLE_PHRASE,
  SAMPLE_PROPOSAL_VALUES,
} from "@/app/(app)/dev/ui/sample-data";

import { stubMatchMedia } from "@/test/media";

import { ProposalCard } from "./proposal-card";
import type { ProposalCardProps, ProposalCardState } from "./types";

const callbacks = () => ({
  onConfirm: vi.fn(),
  onEdit: vi.fn(),
  onCommitEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onDiscard: vi.fn(),
  onRetry: vi.fn(),
  onSettled: vi.fn(),
});

const props = (
  state: ProposalCardState,
  overrides: Partial<ProposalCardProps> = {},
): ProposalCardProps => ({
  trialNumber: 3,
  values: SAMPLE_PROPOSAL_VALUES,
  phrase: SAMPLE_PHRASE,
  source: "voice",
  state,
  ...callbacks(),
  ...overrides,
});

const card = () => screen.getByRole("region", { name: /Ensayo/ });

const ALL_STATES: readonly ProposalCardState[] = [
  { kind: "proposed" },
  { kind: "editing", variableId: 3 },
  { kind: "saving" },
  { kind: "saved" },
  { kind: "needs_clarification", question: "¿Cuál fue la duración?" },
  { kind: "correction" },
  { kind: "save_error", message: "La base de datos no respondió." },
  {
    kind: "choose_trial",
    question: "El ensayo 3 ya existe. ¿Es una corrección o un ensayo nuevo?",
  },
  {
    kind: "pending_other_trial",
    question: "Tienes el ensayo 3 sin guardar. ¿Lo guardo o lo descarto?",
  },
  { kind: "checking", variableId: 1 },
];

afterEach(() => {
  vi.useRealTimers();
});

describe("ProposalCard states (AC-8, AC-6)", () => {
  it.each(ALL_STATES)(
    "renders $kind from props with no axe violations",
    async (state) => {
      const values =
        state.kind === "needs_clarification"
          ? SAMPLE_PROPOSAL_VALUES.map((v) =>
              v.variableId === 2 ? { ...v, value: null } : v,
            )
          : state.kind === "correction"
            ? SAMPLE_PROPOSAL_VALUES.map((v) =>
                v.variableId === 1
                  ? { ...v, previous: 48 }
                  : { ...v, previous: v.value },
              )
            : SAMPLE_PROPOSAL_VALUES;
      const { container } = render(
        <ProposalCard {...props(state, { values })} />,
      );
      expect(card()).toHaveAttribute("data-state", state.kind);
      expect(await axe(container)).toHaveNoViolations();
    },
  );

  it("formats every value with its unit in the readout font", () => {
    render(<ProposalCard {...props({ kind: "proposed" })} />);
    for (const text of ["50 °C", "15 min", "73,5 %"]) {
      expect(screen.getByText(text)).toHaveClass("font-mono", "tabular-nums");
    }
    expect(screen.getByText(`${SAMPLE_PHRASE}`)).toBeInTheDocument();
  });

  it("shows a unitless value as the number alone", () => {
    render(
      <ProposalCard
        {...props({ kind: "proposed" }, { values: [SAMPLE_PH_VALUE] })}
      />,
    );
    expect(screen.getByText("7,2")).toBeInTheDocument();
  });

  it("shows an unknown trial as Ensayo ?", () => {
    render(
      <ProposalCard {...props({ kind: "proposed" }, { trialNumber: null })} />,
    );
    expect(card()).toHaveAccessibleName("Ensayo ?");
  });

  it("shows missing values as labelled empty slots and keeps the save button disabled", () => {
    const values = SAMPLE_PROPOSAL_VALUES.map((v) =>
      v.variableId === 3 ? { ...v, value: null } : v,
    );
    render(<ProposalCard {...props({ kind: "proposed" }, { values })} />);
    expect(screen.getByText("Rendimiento sin valor")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Guardar 50 °C y 15 min" }),
    ).toBeDisabled();
  });

  it("shows each flag reason under its value in any state", () => {
    const values = SAMPLE_PROPOSAL_VALUES.map((v) =>
      v.variableId === 1
        ? {
            ...v,
            flags: [
              {
                reason: "out_of_range" as const,
                text: "Fuera del rango esperado: 20 a 100 °C",
              },
            ],
          }
        : v,
    );
    for (const state of [{ kind: "proposed" }, { kind: "saving" }] as const) {
      const { unmount } = render(
        <ProposalCard {...props(state, { values })} />,
      );
      expect(
        screen.getByText("Fuera del rango esperado: 20 a 100 °C"),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("shows the old value struck through next to the new one in correction", async () => {
    const values = SAMPLE_PROPOSAL_VALUES.map((v) =>
      v.variableId === 1 ? { ...v, previous: 48 } : { ...v, previous: v.value },
    );
    render(<ProposalCard {...props({ kind: "correction" }, { values })} />);
    expect(screen.getByText("¿Reemplazo el ensayo 3?")).toBeInTheDocument();
    const old = screen.getByText("48 °C");
    expect(old.closest("del")).not.toBeNull();
    // Equal values show once.
    expect(screen.getAllByText("15 min")).toHaveLength(1);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Reemplazar ensayo 3 · 3 valores" }),
      ).toHaveFocus(),
    );
  });

  it("disables every action and shows Guardando… while saving", async () => {
    const user = userEvent.setup();
    const p = props({ kind: "saving" });
    render(<ProposalCard {...p} />);
    const primary = screen.getByRole("button", { name: "Guardando…" });
    expect(primary).toHaveAttribute("aria-disabled", "true");
    await user.click(primary);
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    expect(p.onConfirm).not.toHaveBeenCalled();
    expect(p.onDiscard).not.toHaveBeenCalled();
  });

  it("puts the save error in an alert and focuses Reintentar", async () => {
    const user = userEvent.setup();
    const p = props({
      kind: "save_error",
      message: "La base de datos no respondió.",
    });
    render(<ProposalCard {...p} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se pudo guardar");
    expect(alert).toHaveTextContent("La base de datos no respondió.");
    const retry = screen.getByRole("button", { name: "Reintentar" });
    await waitFor(() => expect(retry).toHaveFocus());
    await user.keyboard("{Enter}");
    expect(p.onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("Unsaved vs saved (AC-9)", () => {
  it.each(ALL_STATES.filter((s) => s.kind !== "saved"))(
    "$kind shows Sin guardar, the dashed edge, and the tint",
    (state) => {
      render(<ProposalCard {...props(state)} />);
      expect(within(card()).getByText("Sin guardar")).toBeInTheDocument();
      expect(card()).toHaveClass(
        "border-dashed",
        "border-unsaved-border",
        "bg-unsaved",
      );
      expect(within(card()).queryByText("Guardado")).not.toBeInTheDocument();
    },
  );

  it("saved shows a solid border, the check, and Guardado, with no actions", () => {
    render(<ProposalCard {...props({ kind: "saved" })} />);
    expect(card()).toHaveClass("border-solid", "border-saved");
    expect(card()).not.toHaveClass("border-dashed", "bg-unsaved");
    expect(within(card()).getByText("Guardado")).toBeInTheDocument();
    expect(within(card()).queryByText("Sin guardar")).not.toBeInTheDocument();
    expect(within(card()).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Focus and keyboard (AC-10)", () => {
  it("focuses the save button on mount and Enter confirms once", async () => {
    const user = userEvent.setup();
    const p = props({ kind: "proposed" });
    const { container } = render(<ProposalCard {...p} />);
    const confirm = screen.getByRole("button", {
      name: "Guardar ensayo 3 · 3 valores",
    });
    await waitFor(() => expect(confirm).toHaveFocus());
    await user.keyboard("{Enter}");
    expect(p.onConfirm).toHaveBeenCalledTimes(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("does not steal focus from a text field when it mounts", () => {
    const { rerender } = render(
      <label>
        Medición <input data-testid="dock" />
      </label>,
    );
    const dock = screen.getByTestId("dock");
    dock.focus();
    rerender(
      <>
        <label>
          Medición <input data-testid="dock" />
        </label>
        <ProposalCard {...props({ kind: "proposed" })} />
      </>,
    );
    expect(screen.getByTestId("dock")).toHaveFocus();
  });

  it("Editar asks the parent to edit that value", async () => {
    const user = userEvent.setup();
    const p = props({ kind: "proposed" });
    render(<ProposalCard {...p} />);
    await user.click(
      screen.getByRole("button", { name: "Editar Rendimiento" }),
    );
    expect(p.onEdit).toHaveBeenCalledWith(3);
  });

  it("edits inline: rejects a bad number, commits a good one, Esc cancels and refocuses Editar", async () => {
    const user = userEvent.setup();
    const p = props({ kind: "editing", variableId: 3 });
    const { rerender } = render(<ProposalCard {...p} />);

    const field = screen.getByRole("textbox", { name: "Rendimiento" });
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveValue("73,5");

    await user.clear(field);
    await user.type(field, "abc{Enter}");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(
      "Escribe un número, por ejemplo 73,5",
    );
    expect(p.onCommitEdit).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, "74,2{Enter}");
    expect(p.onCommitEdit).toHaveBeenCalledWith(3, 74.2);

    await user.keyboard("{Escape}");
    expect(p.onCancelEdit).toHaveBeenCalledTimes(1);

    rerender(<ProposalCard {...p} state={{ kind: "proposed" }} />);
    expect(
      screen.getByRole("button", { name: "Editar Rendimiento" }),
    ).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Guardar ensayo 3 · 3 valores" }),
    ).not.toHaveFocus();
  });

  it("Guardar submits the edit field", async () => {
    const user = userEvent.setup();
    const p = props({ kind: "editing", variableId: 1 });
    render(<ProposalCard {...p} />);
    const field = screen.getByRole("textbox", { name: "Temperatura" });
    await user.clear(field);
    await user.type(field, "51");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(p.onCommitEdit).toHaveBeenCalledWith(1, 51);
  });

  it("asks for missing values as slots and focuses the first one", async () => {
    stubMatchMedia((query) => query === "(min-width: 1024px)");
    const user = userEvent.setup();
    const values = SAMPLE_PROPOSAL_VALUES.map((v) =>
      v.variableId === 2 ? { ...v, value: null } : v,
    );
    const p = props(
      { kind: "needs_clarification", question: "¿Cuál fue la duración?" },
      { values },
    );
    render(<ProposalCard {...p} />);
    expect(screen.getByText("¿Cuál fue la duración?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Guardar 50 °C y 73,5 %" }),
    ).toBeDisabled();
    const slot = screen.getByRole("textbox", { name: "Duración" });
    await waitFor(() => expect(slot).toHaveFocus());
    await user.type(slot, "15{Enter}");
    expect(p.onCommitEdit).toHaveBeenCalledWith(2, 15);
  });

  it("leaves the slot unfocused on the phone, so the keyboard stays closed (spec 0010, AC-8)", async () => {
    const values = SAMPLE_PROPOSAL_VALUES.map((v) =>
      v.variableId === 2 ? { ...v, value: null } : v,
    );
    const p = props(
      { kind: "needs_clarification", question: "¿Cuál fue la duración?" },
      { values },
    );
    render(<ProposalCard {...p} />);
    const slot = screen.getByRole("textbox", { name: "Duración" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(slot).not.toHaveFocus();
  });
});

describe("Live region (AC-11)", () => {
  it("is rendered empty, then announces each state", async () => {
    const markup = renderToStaticMarkup(
      <ProposalCard {...props({ kind: "proposed" })} />,
    );
    expect(markup).toMatch(/<div aria-live="polite" class="sr-only"><\/div>/);

    const p = props({ kind: "proposed" });
    const { container, rerender } = render(<ProposalCard {...p} />);
    const region = container.querySelector("[aria-live=polite]");
    expect(region).toBeEmptyDOMElement();
    await waitFor(() =>
      expect(region).toHaveTextContent("Propuesta del ensayo 3, sin guardar"),
    );

    rerender(<ProposalCard {...p} state={{ kind: "saved" }} />);
    await waitFor(() => expect(region).toHaveTextContent("Ensayo 3 guardado"));
  });
});

describe("Settling (AC-15)", () => {
  it("calls onSettled once after the saved exit", () => {
    vi.useFakeTimers();
    const p = props({ kind: "saving" });
    const { rerender } = render(<ProposalCard {...p} />);
    rerender(<ProposalCard {...p} state={{ kind: "saved" }} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(p.onSettled).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(p.onSettled).toHaveBeenCalledTimes(1);
    rerender(<ProposalCard {...p} state={{ kind: "saved" }} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(p.onSettled).toHaveBeenCalledTimes(1);
  });

  it("animates with full motion by default", () => {
    render(<ProposalCard {...props({ kind: "proposed" })} />);
    expect(card().closest("[data-slot=proposal-card]")).toHaveAttribute(
      "data-motion",
      "full",
    );
  });
});

describe("Said vs understood and the flagged card (spec 0006, AC-21 to AC-23)", () => {
  it("shows what you said next to what LabFlow understood, highlighting only interpretations", () => {
    render(
      <ProposalCard
        {...props({ kind: "proposed" }, { values: SAMPLE_SAID_VALUES })}
      />,
    );
    expect(
      screen.getByText("setenta y tres coma cinco por ciento"),
    ).toBeInTheDocument();
    expect(screen.getByText("73,5 %")).toHaveClass("bg-brand-soft");
    expect(screen.getByText("50 °C")).not.toHaveClass("bg-brand-soft");
    expect(
      screen.getByRole("button", { name: "Guardar ensayo 3 · 3 valores" }),
    ).toBeEnabled();
  });

  it("shows Escrito a mano for a value typed by hand", () => {
    const values = SAMPLE_SAID_VALUES.map((v) =>
      v.variableId === 3 ? { ...v, saidText: null, interpreted: false } : v,
    );
    render(<ProposalCard {...props({ kind: "proposed" }, { values })} />);
    expect(screen.getByText("Escrito a mano")).toBeInTheDocument();
  });

  it("draws a flagged card, lists every reason, and keeps saving off until each is checked", async () => {
    const user = userEvent.setup();
    const p = props(
      { kind: "proposed" },
      { values: SAMPLE_FLAGGED_VALUES, onCheck: vi.fn() },
    );
    const { container } = render(<ProposalCard {...p} />);
    expect(card()).toHaveAttribute("data-flagged", "true");
    expect(screen.getByText("Revisa antes de guardar")).toBeInTheDocument();
    expect(
      screen.getByText("Fuera del rango esperado: 20 a 100 °C"),
    ).toBeInTheDocument();
    expect(screen.getByText("Convertí 932 °F a 500 °C")).toBeInTheDocument();
    expect(screen.getByText("Revisado")).toBeInTheDocument(); // Duración is checked
    expect(
      screen.getByRole("button", { name: "Guardar ensayo 3 · 3 valores" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Sí, es 500 °C" }));
    expect(p.onCheck).toHaveBeenCalledWith(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("puts the values to check first in the live region", async () => {
    render(
      <ProposalCard
        {...props({ kind: "proposed" }, { values: SAMPLE_FLAGGED_VALUES })}
      />,
    );
    await waitFor(() =>
      expect(
        card().querySelector("[aria-live=polite]")?.textContent ?? "",
      ).toMatch(/^Revisa antes de guardar: Temperatura\./),
    );
  });

  it("choose_trial offers correction or a new trial", async () => {
    const user = userEvent.setup();
    const p = props(
      {
        kind: "choose_trial",
        question:
          "El ensayo 3 ya existe. ¿Es una corrección o un ensayo nuevo?",
      },
      { onChooseTrial: vi.fn(), canConfirm: false },
    );
    render(<ProposalCard {...p} />);
    await user.click(screen.getByRole("button", { name: "Es otro ensayo" }));
    await user.click(screen.getByRole("button", { name: "Corregir ensayo 3" }));
    expect(p.onChooseTrial).toHaveBeenNthCalledWith(1, "new");
    expect(p.onChooseTrial).toHaveBeenNthCalledWith(2, "correction");
  });

  it("follows canConfirm from the API over its own guess", () => {
    const values = SAMPLE_PROPOSAL_VALUES.map((v) =>
      v.variableId === 3 ? { ...v, value: null } : v,
    );
    render(
      <ProposalCard
        {...props({ kind: "proposed" }, { values, canConfirm: true })}
      />,
    );
    // AC-5: a partial trial may be saved.
    expect(
      screen.getByRole("button", { name: "Guardar 50 °C y 15 min" }),
    ).toBeEnabled();
  });
});
