import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { sampleDetail } from "@/test/experiments";

import { NotebookInspector, type TrialsPanel } from "./notebook-inspector";

const EMPTY: TrialsPanel = { kind: "ready", view: { trials: [], recent: [] } };

const cell = (variable_id: number, value: number) => ({
  variable_id,
  value,
  said_text: null,
  saved_at: "2026-10-29T12:00:00Z",
});

// Variables 1 Temperatura °C, 2 Duración min, 3 pH (no unit).
const READY: TrialsPanel = {
  kind: "ready",
  view: {
    trials: [
      { id: 11, number: 1, cells: [cell(1, 65.5), cell(2, 20)] },
      { id: 13, number: 3, cells: [cell(1, 70), cell(3, 7.25)] },
    ],
    recent: [
      {
        trial_number: 3,
        variable_id: 3,
        value: 7.25,
        saved_at: "2026-10-29T12:05:00Z",
      },
      {
        trial_number: 3,
        variable_id: 1,
        value: 70,
        saved_at: "2026-10-29T12:04:00Z",
      },
    ],
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NotebookInspector", () => {
  it("summarizes the notebook from API data only", async () => {
    const { container } = render(
      <NotebookInspector
        experiment={sampleDetail}
        trialCount={4}
        trials={EMPTY}
      />,
    );

    const panel = screen.getByRole("complementary", {
      name: "Inspector activo",
    });
    const summary = within(panel).getByRole("region", { name: "Resumen" });
    expect(
      within(summary).getByText("Ensayos guardados").nextSibling,
    ).toHaveTextContent("4");
    expect(
      within(summary).getByText("Variables").nextSibling,
    ).toHaveTextContent(String(sampleDetail.variables.length));
    expect(within(panel).getByText(`#${sampleDetail.id}`)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows a dash while the trial count is unknown", () => {
    render(
      <NotebookInspector
        experiment={sampleDetail}
        trialCount={undefined}
        trials={EMPTY}
      />,
    );
    expect(screen.getByText("Ensayos guardados").nextSibling).toHaveTextContent(
      "—",
    );
  });

  it("links the quick actions and exports a CSV", async () => {
    const createUrl = vi.fn(() => "blob:csv");
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createUrl,
      revokeObjectURL: revokeUrl,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    let csv = "";
    vi.spyOn(globalThis, "Blob").mockImplementation(function (
      parts?: BlobPart[],
    ) {
      csv = (parts ?? []).join("");
      return {} as Blob;
    });
    render(
      <NotebookInspector
        experiment={sampleDetail}
        trialCount={2}
        trials={READY}
      />,
    );

    // "Revisar variables" brings the list into view and focuses it, so the
    // jump shows even when the list is already on screen.
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    await userEvent.click(
      screen.getByRole("button", { name: "Revisar variables" }),
    );
    expect(scroll).toHaveBeenCalledOnce();
    expect(screen.getByRole("region", { name: "Variables" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(createUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledWith("blob:csv");
    // The same rows as the table, dot decimals, an empty field for no value.
    expect(csv).toBe(
      "\uFEFFEnsayo,Temperatura (°C),Duración (min),pH\r\n1,65.5,20,\r\n3,70,,7.25\r\n",
    );
    vi.unstubAllGlobals();
  });
});

describe("NotebookInspector full table dialog", () => {
  it("opens when the page asks (Ver resultados)", () => {
    render(
      <NotebookInspector
        experiment={sampleDetail}
        trialCount={2}
        trials={READY}
        tableOpen
        onTableOpenChange={() => undefined}
      />,
    );
    expect(
      screen.getByRole("dialog", { name: /Ensayos · / }),
    ).toBeInTheDocument();
  });
});

describe("NotebookInspector trials (spec 0007)", () => {
  it("shows saved trials and recent measurements", async () => {
    const { container } = render(
      <NotebookInspector
        experiment={sampleDetail}
        trialCount={2}
        trials={READY}
      />,
    );
    const table = within(
      screen.getByRole("region", { name: "Ensayos" }),
    ).getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "165,520—pH sin valor",
      "370—Duración sin valor7,25",
    ]);
    const recent = within(
      screen.getByRole("region", { name: "Mediciones recientes" }),
    ).getAllByRole("listitem");
    expect(recent[0]).toHaveTextContent("Ensayo 3 · pH 7,25");
    expect(recent[1]).toHaveTextContent("Ensayo 3 · Temperatura 70 °C");
    expect(screen.queryByText("Aún no hay ensayos")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("keeps the empty texts with no trials", async () => {
    const { container } = render(
      <NotebookInspector
        experiment={sampleDetail}
        trialCount={0}
        trials={EMPTY}
      />,
    );
    expect(screen.getByText("Aún no hay ensayos")).toBeInTheDocument();
    expect(screen.getByText(/Aún no hay mediciones/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows skeletons and holds the export while loading", async () => {
    const { container } = render(
      <NotebookInspector
        experiment={sampleDetail}
        trialCount={undefined}
        trials={{ kind: "loading" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Exportar CSV (cargando…)" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("Aún no hay ensayos")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("offers Reintentar when the trials fail to load", async () => {
    const onRetry = vi.fn();
    const { container } = render(
      <NotebookInspector
        experiment={sampleDetail}
        trialCount={0}
        trials={{ kind: "error", onRetry }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar los ensayos",
    );
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("opens the full table in a dialog (spec 0007, AC-8)", async () => {
    const user = userEvent.setup();
    const { baseElement } = render(
      <NotebookInspector
        experiment={sampleDetail}
        trialCount={2}
        trials={READY}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Tabla completa" }));
    const dialog = await screen.findByRole("dialog", {
      name: `Ensayos · ${sampleDetail.title}`,
    });
    expect(within(dialog).getByText("2 ensayos guardados")).toBeInTheDocument();
    const rows = within(dialog).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "165,520—pH sin valor",
      "370—Duración sin valor7,25",
    ]);
    expect(
      within(dialog).getByRole("button", { name: "Exportar CSV" }),
    ).toBeEnabled();
    expect(await axe(baseElement)).toHaveNoViolations();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tabla completa" }),
    ).toHaveFocus();
  });
});
