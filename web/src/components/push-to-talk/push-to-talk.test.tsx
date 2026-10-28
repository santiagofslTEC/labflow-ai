import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import type { MicDockState } from "@/components/mic-dock/types";

import { HOLD_MS } from "./press";
import { PushToTalk } from "./push-to-talk";

const handlers = () => ({
  onStart: vi.fn(),
  onStop: vi.fn(),
  onCancel: vi.fn(),
  onKeyboard: vi.fn(),
});

// A parent that flips idle <-> listening, as feature 8 will.
function Controlled(h: ReturnType<typeof handlers>) {
  const [state, setState] = useState<MicDockState>({ kind: "idle" });
  return (
    <PushToTalk
      state={state}
      onStart={() => {
        h.onStart();
        setState({ kind: "listening", elapsedMs: 0 });
      }}
      onStop={() => {
        h.onStop();
        setState({ kind: "processing" });
      }}
      onCancel={() => {
        h.onCancel();
        setState({ kind: "idle" });
      }}
      onKeyboard={h.onKeyboard}
    />
  );
}

const mic = () => screen.getByRole("button", { name: "Dictar" });

const pressFor = (ms: number) => {
  const now = vi.spyOn(performance, "now").mockReturnValue(1000);
  fireEvent.pointerDown(mic(), { button: 0, pointerId: 1 });
  now.mockReturnValue(1000 + ms);
  fireEvent.pointerUp(mic(), { button: 0, pointerId: 1 });
};

afterEach(() => vi.restoreAllMocks());

describe("PushToTalk", () => {
  it("hold to talk: pressing starts, releasing after a hold sends", () => {
    const h = handlers();
    render(<Controlled {...h} />);
    pressFor(HOLD_MS + 200);
    expect(h.onStart).toHaveBeenCalledOnce();
    expect(h.onStop).toHaveBeenCalledOnce();
  });

  it("tap fallback: a short press keeps listening until the next tap", () => {
    const h = handlers();
    render(<Controlled {...h} />);
    pressFor(80);
    expect(h.onStart).toHaveBeenCalledOnce();
    expect(h.onStop).not.toHaveBeenCalled();
    expect(mic()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Toca otra vez para terminar")).toBeInTheDocument();

    pressFor(80);
    expect(h.onStop).toHaveBeenCalledOnce();
  });

  it("Space works as a hold from the keyboard", () => {
    const h = handlers();
    render(<Controlled {...h} />);
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    fireEvent.keyDown(mic(), { key: " " });
    expect(h.onStart).toHaveBeenCalledOnce();
    now.mockReturnValue(HOLD_MS + 1);
    fireEvent.keyUp(mic(), { key: " " });
    expect(h.onStop).toHaveBeenCalledOnce();
  });

  it("Enter toggles, so keyboard and screen reader users never need to hold", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<Controlled {...h} />);
    mic().focus();
    await user.keyboard("{Enter}");
    expect(h.onStart).toHaveBeenCalledOnce();
    await user.keyboard("{Enter}");
    expect(h.onStop).toHaveBeenCalledOnce();
  });

  it("shows Cancelar only while listening, and it cancels", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<Controlled {...h} />);
    expect(
      screen.queryByRole("button", { name: "Cancelar el dictado" }),
    ).not.toBeInTheDocument();
    pressFor(80);
    await user.click(
      screen.getByRole("button", { name: "Cancelar el dictado" }),
    );
    expect(h.onCancel).toHaveBeenCalledOnce();
    expect(h.onStop).not.toHaveBeenCalled();
  });

  it("ignores presses while processing or without a mic", () => {
    const h = handlers();
    const { rerender } = render(
      <PushToTalk state={{ kind: "processing" }} {...h} />,
    );
    pressFor(500);
    rerender(
      <PushToTalk state={{ kind: "unavailable", reason: "denied" }} {...h} />,
    );
    pressFor(500);
    expect(h.onStart).not.toHaveBeenCalled();
    expect(h.onStop).not.toHaveBeenCalled();
    expect(mic()).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("Micrófono bloqueado. Puedes escribir."),
    ).toBeInTheDocument();
  });

  it("offers the keyboard and reads a service error as an alert", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(
      <PushToTalk
        state={{ kind: "service_error", message: "Intenta de nuevo." }}
        {...h}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("No te escuché bien");
    await user.click(
      screen.getByRole("button", { name: "Escribir en lugar de dictar" }),
    );
    expect(h.onKeyboard).toHaveBeenCalledOnce();
  });

  it.each<MicDockState>([
    { kind: "idle" },
    { kind: "listening", elapsedMs: 7000, level: 0.6 },
    { kind: "processing" },
    { kind: "unavailable", reason: "insecure" },
  ])("$kind has no axe violations", async (state) => {
    const { container } = render(<PushToTalk state={state} {...handlers()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
