import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { readSession, signOut } from "@/api/access";

import { SettingsView } from "./settings-view";

vi.mock("@/api/access", () => ({
  readSession: vi.fn(),
  signOut: vi.fn(),
}));

const readMock = vi.mocked(readSession);
const signOutMock = vi.mocked(signOut);

beforeEach(() => {
  readMock.mockReset();
  signOutMock.mockReset();
});

describe("SettingsView", () => {
  it("names who is signed in", async () => {
    readMock.mockResolvedValue({ ok: true, holder: "ana" });
    const { container } = render(<SettingsView connection={<span>ok</span>} />);

    expect(await screen.findByText("ana")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Configuración" }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("says when the session cannot be read", async () => {
    readMock.mockResolvedValue({ ok: false });
    render(<SettingsView connection={null} />);
    expect(await screen.findByText("No disponible")).toBeInTheDocument();
  });

  it("signs out and goes to the access page", async () => {
    readMock.mockResolvedValue({ ok: true, holder: "ana" });
    signOutMock.mockResolvedValue(true);
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    render(<SettingsView connection={null} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    );

    expect(signOutMock).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith("/access");
    vi.unstubAllGlobals();
  });

  it("explains a failed sign out and stays", async () => {
    readMock.mockResolvedValue({ ok: true, holder: "ana" });
    signOutMock.mockResolvedValue(false);

    render(<SettingsView connection={null} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos cerrar la sesión",
    );
  });
});
