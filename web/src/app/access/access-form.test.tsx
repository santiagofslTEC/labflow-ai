import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import type { AccessResult } from "@/api/access";

import { AccessForm } from "./access-form";

const setup = (result: AccessResult) => {
  const submit = vi.fn<(code: string) => Promise<AccessResult>>(() =>
    Promise.resolve(result),
  );
  const onGranted = vi.fn();
  const view = render(<AccessForm submit={submit} onGranted={onGranted} />);
  return { submit, onGranted, view, user: userEvent.setup() };
};

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("AccessForm", () => {
  it("keeps Entrar disabled until a code is typed", async () => {
    const { user } = setup({ ok: true, holder: "ana" });
    const button = screen.getByRole("button", { name: "Entrar" });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Código de acceso"), "  ");
    expect(button).toBeDisabled();
  });

  it("submits the trimmed code and goes to the safe next page", async () => {
    window.history.replaceState(null, "", "/access?next=%2Fexperimentos%2F3");
    const { user, submit, onGranted } = setup({ ok: true, holder: "ana" });
    await user.type(
      screen.getByLabelText("Código de acceso"),
      " alpha-1 {Enter}",
    );
    expect(submit).toHaveBeenCalledWith("alpha-1");
    expect(onGranted).toHaveBeenCalledWith("/experimentos/3");
  });

  it("never follows next to another site", async () => {
    window.history.replaceState(null, "", "/access?next=%2F%2Fevil.example");
    const { user, onGranted } = setup({ ok: true, holder: "ana" });
    await user.type(
      screen.getByLabelText("Código de acceso"),
      "alpha-1{Enter}",
    );
    expect(onGranted).toHaveBeenCalledWith("/");
  });

  it("shows the API message as an alert on a wrong code, and clears it on edit", async () => {
    const message = "Ese código no es válido. Revisa que esté bien escrito.";
    const { user, onGranted, view } = setup({ ok: false, message });
    const input = screen.getByLabelText("Código de acceso");
    await user.type(input, "nope{Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(message);
    expect(onGranted).not.toHaveBeenCalled();
    expect(await axe(view.container)).toHaveNoViolations();

    await user.type(input, "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
