import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { Button } from "./button";

describe("Button", () => {
  it("is reached with Tab and pressed with Enter and Space", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Confirmar</Button>);

    await user.tab();
    const button = screen.getByRole("button", { name: "Confirmar" });
    expect(button).toHaveFocus();
    expect(button).toHaveClass("focus-ring");

    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("defaults to type button so it never submits a form by accident", () => {
    render(<Button>Editar</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("is 40px by default and 48px at size lg (AC-7)", () => {
    render(
      <>
        <Button>Normal</Button>
        <Button size="lg">Grande</Button>
        <Button size="icon-lg" aria-label="Editar" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Normal" })).toHaveClass("h-10");
    expect(screen.getByRole("button", { name: "Grande" })).toHaveClass("h-12");
    expect(screen.getByRole("button", { name: "Editar" })).toHaveClass(
      "size-12",
    );
  });

  it("has no axe violations in every variant", async () => {
    const { container } = render(
      <div>
        <Button variant="primary">Confirmar</Button>
        <Button variant="secondary">Editar</Button>
        <Button variant="ghost">Cancelar</Button>
        <Button variant="danger">Descartar</Button>
        <Button disabled>Guardando…</Button>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
