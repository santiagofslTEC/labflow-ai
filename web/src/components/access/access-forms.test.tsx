import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { readAccessOptions } from "@/api/access";
import {
  sendPasswordReset,
  setNewPassword,
  signInWithGoogle,
  signInWithPassword,
  signUp,
} from "@/api/auth";
import { AUTH_MESSAGES } from "@/lib/auth-messages";

import { NewPasswordForm } from "./new-password-form";
import { RecoverForm } from "./recover-form";
import { SignIn } from "./sign-in";
import { SignUpForm } from "./sign-up-form";

const navigation = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("@/api/auth", () => ({
  signInWithGoogle: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  sendPasswordReset: vi.fn(),
  setNewPassword: vi.fn(),
}));
vi.mock("@/api/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/access")>()),
  readAccessOptions: vi.fn(),
}));

const optionsMock = vi.mocked(readAccessOptions);

beforeEach(() => {
  navigation.search = "";
  optionsMock.mockResolvedValue({ codes: true, accounts: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("SignIn (spec 0014, AC-1)", () => {
  it("offers Google, email and password, and the code link", async () => {
    navigation.search = "next=%2Fcuadernos%2F7";
    vi.mocked(signInWithGoogle).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const { container } = render(<SignIn accounts />);
    await user.click(
      screen.getByRole("button", { name: "Continuar con Google" }),
    );
    expect(signInWithGoogle).toHaveBeenCalledWith("/cuadernos/7");
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute(
      "href",
      "/access/crear",
    );
    expect(
      await screen.findByRole("button", { name: "Tengo un código de acceso" }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("checks the email, then shows Supabase's answer in Spanish", async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({
      ok: false,
      message: AUTH_MESSAGES.wrongCredentials,
    });
    const user = userEvent.setup();
    render(<SignIn accounts />);
    await user.type(screen.getByLabelText("Correo"), "ana@");
    await user.type(screen.getByLabelText("Contraseña"), "secreta-larga");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByLabelText("Correo")).toHaveAccessibleDescription(
      "Escribe un correo válido.",
    );
    expect(screen.getByLabelText("Correo")).toHaveFocus();
    expect(signInWithPassword).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Correo"), "example.com");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Correo o contraseña incorrectos.",
    );
  });

  it("explains a failed return from Google", () => {
    navigation.search = "error=google";
    render(<SignIn accounts />);
    expect(screen.getByRole("alert")).toHaveTextContent(AUTH_MESSAGES.google);
  });

  it("shows only the code form without accounts, and hides the code link without codes", async () => {
    const { unmount } = render(<SignIn accounts={false} />);
    expect(screen.getByLabelText("Código de acceso")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continuar con Google" }),
    ).toBeNull();
    unmount();
    optionsMock.mockResolvedValue({ codes: false, accounts: true });
    render(<SignIn accounts />);
    await waitFor(() => expect(optionsMock).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "Tengo un código de acceso" }),
    ).toBeNull();
  });

  it("shows and hides the password", async () => {
    const user = userEvent.setup();
    render(<SignIn accounts />);
    const field = screen.getByLabelText("Contraseña");
    expect(field).toHaveAttribute("type", "password");
    await user.click(
      screen.getByRole("button", { name: "Mostrar contraseña" }),
    );
    expect(field).toHaveAttribute("type", "text");
  });
});

describe("SignUpForm (AC-2)", () => {
  it("asks for 10 characters, then says to check the email", async () => {
    vi.mocked(signUp).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const { container } = render(<SignUpForm />);
    await user.type(screen.getByLabelText("Correo"), "ana@example.com");
    const password = screen.getByLabelText("Contraseña (10 caracteres o más)");
    await user.type(password, "corta");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(password).toHaveFocus();
    expect(password).toHaveAccessibleDescription(AUTH_MESSAGES.weakPassword);
    expect(await axe(container)).toHaveNoViolations();
    await user.type(password, "-y-mas-larga");
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Te enviamos un enlace a ana@example.com. Ábrelo para activar tu cuenta.",
    );
  });
});

describe("RecoverForm and NewPasswordForm (AC-3)", () => {
  it("always answers that a link was sent", async () => {
    vi.mocked(sendPasswordReset).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<RecoverForm />);
    await user.type(screen.getByLabelText("Correo"), "nadie@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar enlace" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      AUTH_MESSAGES.resetSent,
    );
  });

  it("asks for the same password twice, then goes into the app", async () => {
    vi.mocked(setNewPassword).mockResolvedValue({ ok: true });
    const done = vi.fn();
    const user = userEvent.setup();
    render(<NewPasswordForm onDone={done} />);
    await user.type(
      screen.getByLabelText("Contraseña nueva (10 caracteres o más)"),
      "nueva-contrasena-1",
    );
    await user.type(
      screen.getByLabelText("Repite la contraseña"),
      "nueva-contrasena-2",
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar contraseña" }),
    );
    expect(
      screen.getByLabelText("Repite la contraseña"),
    ).toHaveAccessibleDescription("Las contraseñas no coinciden.");
    await user.clear(screen.getByLabelText("Repite la contraseña"));
    await user.type(
      screen.getByLabelText("Repite la contraseña"),
      "nueva-contrasena-1",
    );
    await user.click(
      screen.getByRole("button", { name: "Guardar contraseña" }),
    );
    await waitFor(() => expect(done).toHaveBeenCalledWith("/"));
    expect(setNewPassword).toHaveBeenCalledWith("nueva-contrasena-1");
  });
});
