import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { experimentKeys, getExperiment, getTrials } from "@/api/experiments";
import { sampleDetail } from "@/test/experiments";
import { renderWithQuery } from "@/test/query";

import { NotebookView, parseNotebookId } from "./notebook-view";

vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  getExperiment: vi.fn(),
  getTrials: vi.fn(),
}));

const navigation = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/cuadernos/7",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock("@/api/capture", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/capture")>()),
  getProposal: vi.fn().mockResolvedValue({ ok: true, data: null }),
}));

const getMock = vi.mocked(getExperiment);
const trialsMock = vi.mocked(getTrials);

beforeEach(() => {
  navigation.search = "";
  navigation.replace.mockReset();
  getMock.mockReset();
  trialsMock.mockReset();
  trialsMock.mockResolvedValue({ ok: true, data: { trials: [], recent: [] } });
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
    // The header's and the phone Ensayos view's (CSS shows one per width).
    expect(screen.getAllByText("Abierto")).toHaveLength(2);
    for (const link of screen.getAllByRole("link", { name: "Ver resultados" }))
      expect(link).toHaveAttribute("href", "/cuadernos/7/resultados");
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
    expect(
      await within(trials).findByText("Aún no hay ensayos"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Dictar aquí/)).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("refreshes the trials when a save invalidates the notebooks (spec 0007, AC-4)", async () => {
    getMock.mockResolvedValue({ ok: true, data: sampleDetail });
    const { client } = renderWithQuery(<NotebookView rawId="7" />);
    const trials = await screen.findByRole("region", { name: "Ensayos" });
    await within(trials).findByText("Aún no hay ensayos");
    expect(trialsMock).toHaveBeenCalledWith(7);

    trialsMock.mockResolvedValue({
      ok: true,
      data: {
        trials: [
          {
            id: 1,
            number: 6,
            cells: [
              {
                variable_id: 1,
                value: 65,
                said_text: "65 grados",
                saved_at: "2026-10-29T12:00:00Z",
              },
            ],
          },
        ],
        recent: [],
      },
    });
    await client.invalidateQueries({ queryKey: experimentKeys.all });
    await waitFor(() =>
      expect(within(trials).getAllByRole("row")).toHaveLength(2),
    );
    expect(within(trials).getAllByRole("row")[1]).toHaveTextContent("665");
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

describe("NotebookView instructions (spec 0005, AC-31)", () => {
  it("shows the context and the stored instructions", async () => {
    getMock.mockResolvedValue({
      ok: true,
      data: {
        ...sampleDetail,
        context: "Se mide el rendimiento a 3 temperaturas.",
        protocol: {
          source: "pdf",
          filename: "practica.pdf",
          page_count: 12,
          read_from_page: null,
          read_to_page: null,
        },
      },
    });
    const { container } = renderWithQuery(<NotebookView rawId="7" />);

    const context = await screen.findByRole("region", { name: "Contexto" });
    expect(context).toHaveTextContent(
      "Se mide el rendimiento a 3 temperaturas.",
    );
    expect(screen.getByText(/Creado por ana/)).toHaveTextContent(
      "Creado por ana · 28 oct · Instrucciones: practica.pdf (12 págs)",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows neither for a notebook made by hand", async () => {
    getMock.mockResolvedValue({ ok: true, data: sampleDetail });
    renderWithQuery(<NotebookView rawId="7" />);
    await screen.findByRole("heading", { level: 1, name: sampleDetail.title });
    expect(screen.queryByRole("region", { name: "Contexto" })).toBeNull();
    expect(screen.queryByText(/Instrucciones:/)).toBeNull();
  });
});

describe("NotebookView on the phone (spec 0010, AC-2)", () => {
  it("switches views through ?vista and marks the open one", async () => {
    getMock.mockResolvedValue({ ok: true, data: sampleDetail });
    const user = userEvent.setup();
    const { container } = renderWithQuery(<NotebookView rawId="7" />);
    const views = await screen.findByRole("group", {
      name: "Vistas del cuaderno",
    });
    const capturar = within(views).getByRole("button", { name: "Capturar" });
    expect(capturar).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector("[data-vista]")).toHaveAttribute(
      "data-vista",
      "capturar",
    );

    await user.click(within(views).getByRole("button", { name: "Ensayos" }));
    expect(navigation.replace).toHaveBeenCalledWith(
      "/cuadernos/7?vista=ensayos",
      { scroll: false },
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("reads the view from the URL, and the bare URL is Capturar", async () => {
    navigation.search = "vista=variables";
    getMock.mockResolvedValue({ ok: true, data: sampleDetail });
    const user = userEvent.setup();
    const { container } = renderWithQuery(<NotebookView rawId="7" />);
    const views = await screen.findByRole("group", {
      name: "Vistas del cuaderno",
    });
    expect(
      within(views).getByRole("button", { name: "Variables" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector("[data-vista]")).toHaveAttribute(
      "data-vista",
      "variables",
    );
    await user.click(within(views).getByRole("button", { name: "Capturar" }));
    expect(navigation.replace).toHaveBeenCalledWith("/cuadernos/7", {
      scroll: false,
    });
  });

  it("opens Más as a sheet with the goal and both header actions", async () => {
    getMock.mockResolvedValue({ ok: true, data: sampleDetail });
    const user = userEvent.setup();
    const { baseElement } = renderWithQuery(<NotebookView rawId="7" />);
    await user.click(await screen.findByRole("button", { name: "Más" }));
    const sheet = screen.getByRole("dialog", { name: sampleDetail.title });
    expect(
      within(sheet).getByText(sampleDetail.goal ?? ""),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: "Exportar datos" }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole("link", { name: "Ver resultados" }),
    ).toHaveAttribute("href", "/cuadernos/7/resultados");
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
