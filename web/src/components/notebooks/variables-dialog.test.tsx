import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import {
  addVariable,
  deleteVariables,
  updateVariable,
  type ExperimentDetail,
} from "@/api/experiments";
import { sampleDetail } from "@/test/experiments";
import { renderWithQuery } from "@/test/query";

import { VariablesDialog } from "./variables-dialog";

vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  addVariable: vi.fn(),
  updateVariable: vi.fn(),
  deleteVariables: vi.fn(),
}));

const addMock = vi.mocked(addVariable);
const updateMock = vi.mocked(updateVariable);
const deleteMock = vi.mocked(deleteVariables);

afterEach(() => {
  vi.clearAllMocks();
});

// Temperatura has 6 saved values (30 to 80 °C, trials 1 to 6) and Duración 2;
// pH has none.
const SAVED = new Map([
  [1, [30, 40, 50, 60, 70, 80].map((value, i) => ({ trial: i + 1, value }))],
  [
    2,
    [
      { trial: 1, value: 20 },
      { trial: 2, value: 25 },
    ],
  ],
]);

const open = async (experiment: ExperimentDetail = sampleDetail) => {
  const user = userEvent.setup();
  const view = renderWithQuery(
    <VariablesDialog
      experiment={experiment}
      saved={SAVED}
      triggerClassName="trigger"
    >
      Revisar variables
    </VariablesDialog>,
  );
  await user.click(screen.getByRole("button", { name: "Revisar variables" }));
  const dialog = await screen.findByRole("dialog", {
    name: `Variables · ${experiment.title}`,
  });
  return { user, dialog, ...view };
};

const ok = <T,>(data: T) => ({ ok: true as const, data });

describe("VariablesDialog (spec 0008)", () => {
  it("lists the variables with their saved values", async () => {
    const { user, dialog, baseElement } = await open();
    expect(within(dialog).getByText("3 variables")).toBeInTheDocument();
    const rows = within(dialog).getAllByRole("row").slice(1);
    // Each name cell also holds the phone's one line summary (spec 0010, AC-4).
    expect(rows.map((row) => row.textContent)).toEqual([
      "Temperatura°C · 20 a 100 · Esperada · 6 valores°C20 a 100Esperada6 valores",
      "Duraciónmin · ≥ 0 · Esperada · 2 valoresmin≥ 0Esperada2 valores",
      "pHSin unidad · Sin rango · Opcional · 0 valores——Opcional0 valores",
    ]);
    expect(await axe(baseElement)).toHaveNoViolations();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revisar variables" }),
    ).toHaveFocus();
  });

  it("adds a variable at the end", async () => {
    addMock.mockResolvedValue(
      ok({ ...sampleDetail.variables[2]!, id: 9, name: "Presión" }),
    );
    const { user, dialog } = await open();
    await user.click(
      within(dialog).getByRole("button", { name: "Agregar variable" }),
    );
    const form = within(dialog).getByRole("form", { name: "Nueva variable" });
    await user.type(within(form).getByLabelText("Nombre"), "Presión");
    await user.type(within(form).getByLabelText("Unidad"), "kPa");
    await user.type(within(form).getByLabelText("Máx"), "5,5");
    await user.click(within(form).getByRole("button", { name: "Guardar" }));
    expect(addMock).toHaveBeenCalledWith(sampleDetail.id, {
      name: "Presión",
      unit: "kPa",
      min_value: null,
      max_value: 5.5,
      required: true,
      aliases: [],
    });
    await waitFor(() =>
      expect(
        within(dialog).queryByRole("form", { name: "Nueva variable" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("locks the unit of a variable with saved values and sends every field", async () => {
    updateMock.mockResolvedValue(ok(sampleDetail.variables[0]!));
    const { user, dialog } = await open();
    await user.click(
      within(dialog).getByRole("button", { name: "Editar Temperatura" }),
    );
    const form = within(dialog).getByRole("form", {
      name: "Editar Temperatura",
    });
    const unit = within(form).getByLabelText("Unidad");
    expect(unit).toBeDisabled();
    expect(unit).toHaveAccessibleDescription(
      "No se puede cambiar: ya hay valores guardados en °C",
    );
    const max = within(form).getByLabelText("Máx");
    await user.clear(max);
    await user.type(max, "120");
    await user.click(within(form).getByRole("button", { name: "Guardar" }));
    expect(updateMock).toHaveBeenCalledWith(1, {
      name: "Temperatura",
      unit: "°C",
      min_value: 20,
      max_value: 120,
      required: true,
      aliases: ["temp"],
    });
  });

  it("notes saved values a narrower range leaves outside, and still saves (AC-11)", async () => {
    updateMock.mockResolvedValue(ok(sampleDetail.variables[0]!));
    const { user, dialog, baseElement } = await open();
    await user.click(
      within(dialog).getByRole("button", { name: "Editar Temperatura" }),
    );
    const form = within(dialog).getByRole("form", {
      name: "Editar Temperatura",
    });
    const min = within(form).getByLabelText("Mín");
    const note =
      "2 valores guardados quedan fuera de este rango (ensayos 1 y 2). No se cambian.";
    await user.clear(min);
    await user.type(min, "45");
    expect(within(form).getByRole("status")).toHaveTextContent(note);
    expect(min).toHaveAccessibleDescription(note);
    expect(within(form).getByLabelText("Máx")).toHaveAccessibleDescription(
      note,
    );
    expect(await axe(baseElement)).toHaveNoViolations();
    await user.click(within(form).getByRole("button", { name: "Guardar" }));
    expect(updateMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ min_value: 45 }),
    );
  });

  it("refuses an other name another variable already has (AC-10)", async () => {
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Editar pH" }));
    const form = within(dialog).getByRole("form", { name: "Editar pH" });
    const aliases = within(form).getByLabelText("Otros nombres");
    await user.type(aliases, "acidez, Temp");
    await user.click(within(form).getByRole("button", { name: "Guardar" }));
    expect(aliases).toHaveFocus();
    expect(aliases).toHaveAccessibleDescription(
      expect.stringContaining("«Temp» ya es otro nombre de Temperatura."),
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("lets a variable with no values change its unit", async () => {
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Editar pH" }));
    const form = within(dialog).getByRole("form", { name: "Editar pH" });
    expect(within(form).getByLabelText("Unidad")).toBeEnabled();
  });

  it("shows field errors, focuses the first, and sends nothing", async () => {
    const { user, dialog, baseElement } = await open();
    await user.click(
      within(dialog).getByRole("button", { name: "Editar Duración" }),
    );
    const form = within(dialog).getByRole("form", { name: "Editar Duración" });
    const name = within(form).getByLabelText("Nombre");
    await user.clear(name);
    await user.type(name, "temperatura");
    await user.type(within(form).getByLabelText("Mín"), "9");
    await user.type(within(form).getByLabelText("Máx"), "2");
    await user.click(within(form).getByRole("button", { name: "Guardar" }));
    expect(name).toHaveFocus();
    expect(name).toHaveAccessibleDescription(
      "Hay otra variable con este nombre",
    );
    expect(
      within(form).getByText("El mínimo no puede ser mayor que el máximo"),
    ).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it("keeps the form and shows the API message when a save fails", async () => {
    updateMock.mockResolvedValue({
      ok: false,
      error: {
        kind: "invalid",
        code: "unit_locked",
        message:
          "No se puede cambiar la unidad: ya hay valores guardados en ella.",
      },
    });
    const { user, dialog } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Editar pH" }));
    const form = within(dialog).getByRole("form", { name: "Editar pH" });
    await user.type(within(form).getByLabelText("Unidad"), "K");
    await user.click(within(form).getByRole("button", { name: "Guardar" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "No se puede cambiar la unidad: ya hay valores guardados en ella.",
    );
    expect(
      within(dialog).getByRole("form", { name: "Editar pH" }),
    ).toBeInTheDocument();
  });

  it("selects several, keeps one, confirms, and reports the delete", async () => {
    deleteMock.mockResolvedValue(
      ok({ variables: 2, measurements: 8, trials: 1 }),
    );
    const { user, dialog, baseElement } = await open();
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Seleccionar todas" }),
    );
    const all = within(dialog).getByRole("button", {
      name: "Eliminar 3 variables",
    });
    expect(all).toHaveAttribute("aria-disabled", "true");
    expect(all).toHaveAccessibleDescription("Deja al menos una variable");
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Seleccionar pH" }),
    );
    expect(await axe(baseElement)).toHaveNoViolations();

    await user.click(
      within(dialog).getByRole("button", { name: "Eliminar 2 variables" }),
    );
    const confirm = within(dialog).getByRole("group", {
      name: /Se borrarán/,
    });
    expect(confirm).toHaveTextContent(
      "Se borrarán Temperatura y Duración y 8 valores guardados. Esto no se puede deshacer.",
    );
    expect(
      within(confirm).getByRole("button", { name: "Cancelar" }),
    ).toHaveFocus();
    expect(await axe(baseElement)).toHaveNoViolations();

    await user.click(within(confirm).getByRole("button", { name: "Eliminar" }));
    expect(deleteMock).toHaveBeenCalledWith(sampleDetail.id, [1, 2]);
    expect(await within(dialog).findByRole("status")).toHaveTextContent(
      "Eliminé 2 variables y 8 valores.",
    );
  });

  it("is read only on a closed notebook", async () => {
    const { dialog } = await open({ ...sampleDetail, status: "closed" });
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Agregar variable" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /Editar/ }),
    ).not.toBeInTheDocument();
  });
});
