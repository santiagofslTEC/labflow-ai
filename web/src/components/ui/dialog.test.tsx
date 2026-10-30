import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { stubMatchMedia } from "@/test/media";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

const Sheet = ({ variant }: { readonly variant?: "sheet" | "alert" }) => (
  <Dialog>
    <DialogTrigger>Tabla completa</DialogTrigger>
    <DialogContent variant={variant}>
      <DialogTitle>Ensayos</DialogTitle>
      <DialogDescription>3 ensayos guardados</DialogDescription>
    </DialogContent>
  </Dialog>
);

const desktop = () =>
  stubMatchMedia((query) => query === "(min-width: 1024px)");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Sheets on the phone (spec 0010, AC-3)", () => {
  it("opens full screen with one history entry, and the back gesture closes it", async () => {
    const user = userEvent.setup();
    const push = vi.spyOn(window.history, "pushState");
    const { baseElement } = render(<Sheet />);
    await user.click(screen.getByRole("button", { name: "Tabla completa" }));
    const sheet = screen.getByRole("dialog", { name: "Ensayos" });
    expect(sheet).toHaveAttribute("data-variant", "sheet");
    expect(sheet).toHaveClass("inset-0", "h-dvh");
    expect(push).toHaveBeenCalledTimes(1);
    expect(await axe(baseElement)).toHaveNoViolations();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Tabla completa" }),
      ).toHaveFocus(),
    );
  });

  it("pops its own entry when closed with the close button", async () => {
    const user = userEvent.setup();
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<Sheet />);
    await user.click(screen.getByRole("button", { name: "Tabla completa" }));
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("leaves history alone on desktop and for an alert", async () => {
    const user = userEvent.setup();
    const push = vi.spyOn(window.history, "pushState");
    desktop();
    const { unmount } = render(<Sheet />);
    await user.click(screen.getByRole("button", { name: "Tabla completa" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-variant", "sheet");
    unmount();
    stubMatchMedia(() => false);
    render(<Sheet variant="alert" />);
    await user.click(screen.getByRole("button", { name: "Tabla completa" }));
    expect(screen.getByRole("dialog")).toHaveClass("top-1/2");
    expect(push).not.toHaveBeenCalled();
  });
});
