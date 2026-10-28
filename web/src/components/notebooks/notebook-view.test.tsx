import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { getExperiment } from "@/api/experiments";
import { sampleDetail } from "@/test/experiments";
import { renderWithQuery } from "@/test/query";

import { NotebookView, parseNotebookId } from "./notebook-view";

vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  getExperiment: vi.fn(),
}));

vi.mock("@/api/capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/capture")>()),
  getProposal: vi.fn().mockResolvedValue({ ok: true, data: null }),
}));

const getMock = vi.mocked(getExperiment);

beforeEach(() => {
  getMock.mockReset();
});

describe("parseNotebookId", () => {
  it.each([
    ["7", 7],
    ["0", 0],
    ["abc", null],
    ["7.5", null],
    ["-1", null],
    ["99999999999999999999", null],
  ])("%s → %s", (raw, expected) => {
    expect(parseNotebookId(raw)).toBe(expected);
  });
});

describe("NotebookView (spec 0005, AC-10, AC-11)", () => {
  it("shows the notebook with its variables in order", async () => {
    getMock.mockResolvedValue({ ok: true, data: sampleDetail });
    const { container } = renderWithQuery(<NotebookView rawId="7" />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: sampleDetail.title,
      }),
    ).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(7);
    expect(screen.getByText(sampleDetail.goal ?? "")).toBeInTheDocument();
    expect(screen.getByText(/Creado por ana/)).toHaveTextContent(
      "Creado por ana · 28 oct",
    );
    expect(screen.getByText("Abierto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mis cuadernos" })).toHaveAttribute(
      "href",
      "/cuadernos",
    );

    const variables = screen.getByRole("region", { name: "Variables" });
    const rows = within(variables).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Temperatura°C20 a 100Requerida",
      "Duraciónmin≥ 0Requerida",
      "pH——Opcional",
    ]);

    const trials = screen.getByRole("region", { name: "Ensayos" });
    expect(within(trials).getByText("Aún no hay ensayos")).toBeInTheDocument();
    expect(screen.queryByText(/Dictar aquí/)).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows a skeleton title and three variable rows while loading", () => {
    getMock.mockReturnValue(new Promise(() => {}));
    renderWithQuery(<NotebookView rawId="7" />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando cuaderno");
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(3);
  });

  it("offers Reintentar when the request fails", async () => {
    getMock.mockResolvedValue({ ok: false, error: { kind: "unavailable" } });
    const user = userEvent.setup();
    renderWithQuery(<NotebookView rawId="7" />);

    const retry = await screen.findByRole("button", { name: "Reintentar" });
    expect(
      screen.getByRole("heading", { name: "No pudimos cargar este cuaderno" }),
    ).toBeInTheDocument();
    getMock.mockResolvedValue({ ok: true, data: sampleDetail });
    await user.click(retry);
    expect(
      await screen.findByRole("heading", { name: sampleDetail.title }),
    ).toBeInTheDocument();
  });

  it("says the notebook does not exist on a 404", async () => {
    getMock.mockResolvedValue({ ok: false, error: { kind: "not_found" } });
    renderWithQuery(<NotebookView rawId="999999" />);
    expect(
      await screen.findByRole("heading", { name: "Este cuaderno no existe" }),
    ).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("link", { name: "Ver mis cuadernos" }),
    ).toHaveAttribute("href", "/cuadernos");
  });

  it("never asks the API about a non integer id", async () => {
    renderWithQuery(<NotebookView rawId="abc" />);
    expect(
      screen.getByRole("heading", { name: "Este cuaderno no existe" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(getMock).not.toHaveBeenCalled());
  });
});

describe("Typed capture in the notebook (spec 0006)", () => {
  it("shows the text box on an open notebook", async () => {
    getMock.mockResolvedValue({ ok: true, data: sampleDetail });
    renderWithQuery(<NotebookView rawId="7" />);
    expect(
      await screen.findByRole("textbox", { name: "Escribe una medición" }),
    ).toBeInTheDocument();
  });

  it("hides it on a closed notebook", async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: { ...sampleDetail, status: "closed" },
    });
    renderWithQuery(<NotebookView rawId="7" />);
    expect(
      await screen.findByText("Este cuaderno está cerrado"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Escribe una medición" }),
    ).not.toBeInTheDocument();
  });
});
