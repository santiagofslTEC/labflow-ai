import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import {
  SAMPLE_PHRASE,
  SAMPLE_PROPOSAL_VALUES,
} from "@/app/(app)/dev/ui/sample-data";
import { ProposalCard } from "@/components/proposal-card/proposal-card";

import { MicDock } from "./mic-dock";
import type { MicDockProps, MicDockState } from "./types";

const handlers = () => ({
  onTextChange: vi.fn(),
  onSubmitText: vi.fn(),
  onStart: vi.fn(),
  onStop: vi.fn(),
  onRetry: vi.fn(),
});

const props = (
  state: MicDockState,
  overrides: Partial<MicDockProps> = {},
): MicDockProps => ({ state, text: "", ...handlers(), ...overrides });

// A parent that owns the text, as feature 6 will.
const Controlled = (p: Omit<MicDockProps, "text" | "onTextChange">) => {
  const [text, setText] = useState("");
  return <MicDock {...p} text={text} onTextChange={setText} />;
};

const field = () => screen.getByRole("textbox", { name: "Medición escrita" });

const ALL_STATES: readonly MicDockState[] = [
  { kind: "idle" },
  { kind: "requesting_permission" },
  { kind: "listening", elapsedMs: 12_000, level: 0.6 },
  { kind: "listening", elapsedMs: 3_000 },
  { kind: "processing" },
  { kind: "unavailable", reason: "denied" },
  { kind: "unavailable", reason: "no_device" },
  { kind: "unavailable", reason: "insecure" },
  { kind: "service_error", message: "El servicio de voz no respondió." },
];

describe("MicDock states (AC-12, AC-6)", () => {
  it.each(ALL_STATES)(
    "renders $kind with no axe violations and a usable field",
    async (state) => {
      const user = userEvent.setup();
      const p = props(state);
      const { container } = render(<Controlled {...p} />);
      expect(container.querySelector("[data-slot=mic-dock]")).toHaveAttribute(
        "data-state",
        state.kind,
      );
      await user.type(field(), "Ensayo 3");
      expect(field()).toHaveValue("Ensayo 3");
      expect(await axe(container)).toHaveNoViolations();
    },
  );

  it("idle shows the 48px Dictar pill and starts recording", async () => {
    const user = userEvent.setup();
    const p = props({ kind: "idle" });
    render(<MicDock {...p} />);
    const pill = screen.getByRole("button", { name: "Dictar" });
    expect(pill).toHaveClass("h-12", "rounded-full");
    await user.click(pill);
    expect(p.onStart).toHaveBeenCalledTimes(1);
  });

  it("asks for the mic while requesting permission, without acting on clicks", async () => {
    const user = userEvent.setup();
    const p = props({ kind: "requesting_permission" });
    render(<MicDock {...p} />);
    const pill = screen.getByRole("button", { name: "Permite el micrófono" });
    expect(pill).toHaveAttribute("aria-disabled", "true");
    await user.click(pill);
    expect(p.onStart).not.toHaveBeenCalled();
  });

  it("listening shows five level bars, the timer, and Detener", async () => {
    const user = userEvent.setup();
    const p = props({ kind: "listening", elapsedMs: 65_400, level: 1 });
    const { container } = render(<MicDock {...p} />);
    const bars = container.querySelectorAll("[data-bar]");
    expect(bars).toHaveLength(5);
    expect(
      [...bars].map((bar) => (bar as HTMLElement).style.transform),
    ).toEqual([
      "scaleY(0.5)",
      "scaleY(0.8)",
      "scaleY(1)",
      "scaleY(0.8)",
      "scaleY(0.5)",
    ]);
    expect(screen.getByText("01:05")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Detener/ }));
    expect(p.onStop).toHaveBeenCalledTimes(1);
  });

  it("pulses the bars when no level is reported", () => {
    const { container } = render(
      <MicDock {...props({ kind: "listening", elapsedMs: 0 })} />,
    );
    for (const bar of container.querySelectorAll("[data-bar]")) {
      expect(bar).toHaveClass("animate-mic-pulse");
    }
  });

  it("shows Transcribiendo… while processing", () => {
    render(<MicDock {...props({ kind: "processing" })} />);
    expect(
      screen.getByRole("button", { name: "Transcribiendo…" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it.each([
    ["denied", "Micrófono bloqueado. Puedes escribir."],
    ["no_device", "No hay micrófono. Puedes escribir."],
    ["insecure", "El micrófono necesita HTTPS. Puedes escribir."],
  ] as const)(
    "unavailable (%s) shows the reason, hides the pill, and focuses the field",
    async (reason, text) => {
      const user = userEvent.setup();
      render(<Controlled {...props({ kind: "unavailable", reason })} />);
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Dictar" }),
      ).not.toBeInTheDocument();
      expect(field()).toHaveFocus();
      await user.keyboard("pH 7,2");
      expect(field()).toHaveValue("pH 7,2");
    },
  );

  it("service_error shows the headline and message in an alert, and Reintentar retries", async () => {
    const user = userEvent.setup();
    const p = props({
      kind: "service_error",
      message: "El servicio de voz no respondió.",
    });
    render(<MicDock {...p} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No te escuché bien");
    expect(alert).toHaveTextContent("El servicio de voz no respondió.");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(p.onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("MicDock text field (AC-12)", () => {
  it("disables Enviar while the text is blank", () => {
    render(<MicDock {...props({ kind: "idle" }, { text: "   " })} />);
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("submits with Enter or Enviar, never with blank text", async () => {
    const user = userEvent.setup();
    const p = props({ kind: "idle" });
    const { rerender } = render(<MicDock {...p} />);
    await user.click(field());
    await user.keyboard("{Enter}");
    expect(p.onSubmitText).not.toHaveBeenCalled();

    rerender(<MicDock {...p} text="Ensayo 3, 50 grados" />);
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(p.onSubmitText).toHaveBeenCalledTimes(2);
  });

  it("is a 48px single line field", () => {
    render(<MicDock {...props({ kind: "idle" })} />);
    expect(field().tagName).toBe("INPUT");
    expect(field()).toHaveClass("h-12");
  });

  it("never confirms a card: typing sí and Enter only submits text (AC-10)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onSubmitText = vi.fn();
    render(
      <>
        <ProposalCard
          trialNumber={3}
          values={SAMPLE_PROPOSAL_VALUES}
          phrase={SAMPLE_PHRASE}
          source="voice"
          state={{ kind: "proposed" }}
          onConfirm={onConfirm}
          onEdit={vi.fn()}
          onCommitEdit={vi.fn()}
          onCancelEdit={vi.fn()}
          onDiscard={vi.fn()}
          onRetry={vi.fn()}
          onSettled={vi.fn()}
        />
        <Controlled {...props({ kind: "idle" })} onSubmitText={onSubmitText} />
      </>,
    );
    await user.click(field());
    await user.keyboard("sí{Enter}");
    expect(onSubmitText).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("MicDock live region (AC-12)", () => {
  it("is rendered empty, then announces the state", async () => {
    const markup = renderToStaticMarkup(
      <MicDock {...props({ kind: "idle" })} />,
    );
    expect(markup).toMatch(/<div aria-live="polite" class="sr-only"><\/div>/);

    const p = props({ kind: "idle" });
    const { container, rerender } = render(<MicDock {...p} />);
    const region = container.querySelector("[aria-live=polite]");
    expect(region).toBeEmptyDOMElement();
    await waitFor(() => expect(region).toHaveTextContent("Micrófono listo"));
    rerender(<MicDock {...p} state={{ kind: "listening", elapsedMs: 0 }} />);
    await waitFor(() => expect(region).toHaveTextContent("Escuchando"));
  });

  it("animates with full motion by default", () => {
    const { container } = render(<MicDock {...props({ kind: "idle" })} />);
    expect(container.querySelector("[data-slot=mic-dock]")).toHaveAttribute(
      "data-motion",
      "full",
    );
  });
});
