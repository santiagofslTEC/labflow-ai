import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { UNAUTHORIZED_EVENT } from "@/api/client";
import {
  createExperiment,
  experimentKeys,
  type ApiResult,
  type ExperimentDetail,
} from "@/api/experiments";
import { sampleDetail } from "@/test/experiments";
import { renderWithQuery } from "@/test/query";

import { NotebookForm } from "./notebook-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  createExperiment: vi.fn(),
}));

const createMock = vi.mocked(createExperiment);

// The page opens on the instructions panel (AC-19); these tests fill by hand.
const setup = () => {
  const user = userEvent.setup();
  const view = renderWithQuery(<NotebookForm />);
  fireEvent.click(screen.getByRole("button", { name: "Llenar a mano" }));
  return { user, ...view };
};

const crear = () => screen.getByRole("button", { name: "Crear cuaderno" });
const usarEjemplo = () =>
  screen.queryByRole("button", { name: "Usar ejemplo" });
const field = (label: string | RegExp) => screen.getByLabelText(label);

beforeEach(() => {
  push.mockReset();
  createMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NotebookForm layout (AC-3, AC-4, AC-18)", () => {
  it("starts with a title, a goal, and one required empty row", () => {
    setup();
    expect(field("Título")).toHaveValue("");
    expect(field(/Objetivo/)).toHaveValue("");
    expect(field("Nombre, variable 1")).toHaveValue("");
    expect(field("Esperada, variable 1")).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Quitar variable 1" }),
    ).toBeDisabled();
    expect(field("Unidad, variable 1")).toHaveAttribute("maxlength", "20");
    expect(field("Mín, variable 1")).toHaveAttribute("inputmode", "decimal");
    expect(
      document.querySelectorAll("#unidades-sugeridas option"),
    ).toHaveLength(15);
  });

  it("adds a row and moves focus to its name; removing returns focus", async () => {
    const { user } = setup();
    const add = screen.getByRole("button", { name: "Agregar variable" });

    await user.click(add);
    expect(field("Nombre, variable 2")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Quitar variable 2" }));
    expect(field("Nombre, variable 1")).toHaveFocus();

    await user.click(add);
    await user.click(screen.getByRole("button", { name: "Quitar variable 1" }));
    expect(add).toHaveFocus();
  });

  it("stops at 12 rows with a hint", async () => {
    const { user } = setup();
    const add = screen.getByRole("button", { name: "Agregar variable" });
    for (let i = 0; i < 11; i += 1) await user.click(add);
    expect(field("Nombre, variable 12")).toBeInTheDocument();
    expect(add).toBeDisabled();
    expect(screen.getByText("Máximo 12 variables")).toBeInTheDocument();
    expect(screen.getByText("12 de 12")).toBeInTheDocument();
  });
});

describe("Usar ejemplo (AC-6)", () => {
  it("fills the sample without sending it, then hides", async () => {
    const { user } = setup();
    await user.click(usarEjemplo() as HTMLElement);

    expect(field("Título")).toHaveValue("Rendimiento vs temperatura");
    expect(field("Título")).toHaveFocus();
    expect(field("Nombre, variable 3")).toHaveValue("Rendimiento");
    expect(field("Máx, variable 2")).toHaveValue("180");
    expect(usarEjemplo()).not.toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("comes back when the form is cleared to its first state", async () => {
    const { user } = setup();
    await user.type(field("Título"), "x");
    expect(usarEjemplo()).not.toBeInTheDocument();
    await user.clear(field("Título"));
    expect(usarEjemplo()).toBeInTheDocument();
  });
});

describe("validation (AC-5, AC-18)", () => {
  it("blocks the request, shows each message, and focuses the first field", async () => {
    const { user, container } = setup();
    await user.click(crear());

    expect(createMock).not.toHaveBeenCalled();
    expect(field("Título")).toHaveFocus();
    expect(field("Título")).toHaveAccessibleDescription("Escribe un título");
    expect(field("Nombre, variable 1")).toHaveAccessibleDescription(
      "Escribe un nombre",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("flags a repeated name and a bad number", async () => {
    const { user } = setup();
    await user.type(field("Título"), "Cuaderno");
    await user.type(field("Nombre, variable 1"), "Temperatura");
    await user.click(screen.getByRole("button", { name: "Agregar variable" }));
    await user.type(field("Nombre, variable 2"), " temperatura ");
    await user.type(field("Mín, variable 2"), "abc");
    await user.click(crear());

    expect(field("Nombre, variable 2")).toHaveFocus();
    expect(field("Nombre, variable 2")).toHaveAccessibleDescription(
      "Hay otra variable con este nombre",
    );
    expect(field("Mín, variable 2")).toHaveAccessibleDescription(
      "Escribe un número, por ejemplo 20 o 20,5",
    );
  });
});

const fillValid = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(field("Título"), "  Mi cuaderno ");
  await user.type(field("Nombre, variable 1"), "Temperatura");
  await user.type(field("Unidad, variable 1"), "°C");
  await user.type(field("Mín, variable 1"), "20,5");
};

describe("create (AC-7, AC-8)", () => {
  it("sends the trimmed body, fills the cache, and opens the notebook", async () => {
    createMock.mockResolvedValue({ ok: true, data: sampleDetail });
    const { user, client } = setup();
    await fillValid(user);
    await user.click(crear());

    expect(createMock).toHaveBeenCalledWith({
      title: "Mi cuaderno",
      goal: null,
      context: null,
      variables: [
        {
          name: "Temperatura",
          unit: "°C",
          min_value: 20.5,
          max_value: null,
          required: true,
        },
      ],
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/cuadernos/7"));
    expect(client.getQueryData(experimentKeys.detail(7))).toEqual(sampleDetail);
  });

  it("is aria-disabled with a spinner while sending, and sends once", async () => {
    const pending = Promise.withResolvers<ApiResult<ExperimentDetail>>();
    createMock.mockReturnValue(pending.promise);
    const { user } = setup();
    await fillValid(user);

    const button = crear();
    fireEvent.submit(button.closest("form") as HTMLFormElement);
    fireEvent.submit(button.closest("form") as HTMLFormElement);
    expect(
      await screen.findByRole("button", { name: "Creando…" }),
    ).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("button", { name: "Creando…" }));
    expect(createMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ ok: true, data: sampleDetail });
      await pending.promise;
    });
  });

  it("shows the API message on a 422 and keeps what was typed", async () => {
    createMock.mockResolvedValue({
      ok: false,
      error: {
        kind: "invalid",
        message: "Hay dos variables llamadas «X». Cambia una.",
      },
    });
    const { user } = setup();
    await fillValid(user);
    await user.click(crear());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Hay dos variables llamadas «X». Cambia una.",
    );
    expect(field("Título")).toHaveValue("  Mi cuaderno ");
    expect(push).not.toHaveBeenCalled();
    expect(crear()).not.toHaveAttribute("aria-disabled");
  });

  it("shows a fixed message when the API is down", async () => {
    createMock.mockResolvedValue({ ok: false, error: { kind: "unavailable" } });
    const { user } = setup();
    await fillValid(user);
    await user.click(crear());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos crear el cuaderno. Inténtalo de nuevo.",
    );
  });

  it("shows nothing on a 401, since the client is already redirecting", async () => {
    createMock.mockResolvedValue({
      ok: false,
      error: { kind: "unauthorized" },
    });
    const { user } = setup();
    await fillValid(user);
    await user.click(crear());
    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

const beforeUnloadBlocked = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("leave warning (AC-9)", () => {
  it("does not ask while the form is untouched", async () => {
    const { user } = setup();
    expect(beforeUnloadBlocked()).toBe(false);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(push).toHaveBeenCalledWith("/cuadernos");
  });

  it("asks before Cancelar, reload, or a same origin link once dirty", async () => {
    const { user } = setup();
    const link = document.createElement("a");
    link.href = "/cuadernos/3";
    link.textContent = "Otro cuaderno";
    document.body.append(link);
    await user.type(field("Título"), "x");

    expect(beforeUnloadBlocked()).toBe(true);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.getByRole("dialog", { name: "¿Salir sin crear el cuaderno?" }),
    ).toHaveAccessibleDescription("Se perderá lo que escribiste.");
    await user.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    await user.click(link);
    await user.click(screen.getByRole("button", { name: "Salir" }));
    expect(push).toHaveBeenCalledWith("/cuadernos/3");
    expect(beforeUnloadBlocked()).toBe(false);
    link.remove();
  });

  it("lets a 401 redirect through without asking", async () => {
    const { user } = setup();
    await user.type(field("Título"), "x");
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    expect(beforeUnloadBlocked()).toBe(false);
  });

  it("does not ask after a successful create", async () => {
    createMock.mockResolvedValue({ ok: true, data: sampleDetail });
    const { user } = setup();
    await fillValid(user);
    await user.click(crear());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(beforeUnloadBlocked()).toBe(false);
  });
});

describe("accessibility (AC-18)", () => {
  it("has no axe violations when empty", async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});
