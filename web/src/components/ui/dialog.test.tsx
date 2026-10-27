import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

const Sample = () => (
  <Dialog>
    <DialogTrigger asChild>
      <Button>Borrar experimento</Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>¿Borrar el experimento?</DialogTitle>
        <DialogDescription>Esto no se puede deshacer.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">Cancelar</Button>
        </DialogClose>
        <Button variant="danger">Borrar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

describe("Dialog", () => {
  it("opens by keyboard, traps focus, and returns it to the trigger on Esc", async () => {
    const user = userEvent.setup();
    render(<Sample />);

    await user.tab();
    const trigger = screen.getByRole("button", { name: "Borrar experimento" });
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    // Tab around more times than there are buttons: focus never leaves.
    for (let i = 0; i < 5; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("returns focus to the trigger after Cancelar", async () => {
    const user = userEvent.setup();
    render(<Sample />);
    const trigger = screen.getByRole("button", { name: "Borrar experimento" });
    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(trigger).toHaveFocus();
  });

  it("has a Spanish close label and no axe violations when open", async () => {
    const user = userEvent.setup();
    render(<Sample />);
    await user.click(
      screen.getByRole("button", { name: "Borrar experimento" }),
    );
    expect(
      await screen.findByRole("button", { name: "Cerrar" }),
    ).toBeInTheDocument();
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
