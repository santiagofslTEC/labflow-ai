import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import {
  experimentKeys,
  getExperiment,
  getResults,
  getTrials,
  type ResultsView as Results,
  type TrialsView,
} from "@/api/experiments";
import { sampleDetail } from "@/test/experiments";
import { renderWithQuery } from "@/test/query";

import { ResultsView } from "./results-view";

const navigation = vi.hoisted(() => ({
  query: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => "/cuadernos/7/resultados",
}));

// Plotly needs a real browser; the chart's data and text are tested here, and
// the dynamic import is checked by the build.
vi.mock("./plotly-chart", () => ({
  Plot: (props: { readonly data: readonly { readonly x: number[] }[] }) => (
    <div data-testid="plot" data-points={props.data[0]?.x.length ?? 0} />
  ),
}));

vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  getExperiment: vi.fn(),
  getTrials: vi.fn(),
  getResults: vi.fn(),
}));

const experimentMock = vi.mocked(getExperiment);
const trialsMock = vi.mocked(getTrials);
const resultsMock = vi.mocked(getResults);

const cell = (variable_id: number, value: number) => ({
  variable_id,
  value,
  said_text: null,
  saved_at: "2026-10-29T12:00:00Z",
});

const TRIALS: TrialsView = {
  trials: [
    { id: 1, number: 1, cells: [cell(1, 70), cell(2, 20), cell(3, 7)] },
    { id: 2, number: 2, cells: [cell(1, 50), cell(2, 25)] },
    { id: 3, number: 3, cells: [cell(1, 60)] },
  ],
  recent: [],
};

const RESULTS: Results = {
  variables: [
    {
      variable_id: 1,
      count: 3,
      min: 50,
      max: 70,
      mean: 60,
      min_trials: [2],
      max_trials: [1],
    },
    {
      variable_id: 2,
      count: 2,
      min: 20,
      max: 25,
      mean: 22.5,
      min_trials: [1],
      max_trials: [2],
    },
    {
      variable_id: 3,
      count: 0,
      min: null,
      max: null,
      mean: null,
      min_trials: [],
      max_trials: [],
    },
  ],
};

const ok = <T,>(data: T) => ({ ok: true as const, data });

beforeEach(() => {
  navigation.query = "";
  navigation.replace.mockClear();
  experimentMock.mockResolvedValue(ok(sampleDetail));
  trialsMock.mockResolvedValue(ok(TRIALS));
  resultsMock.mockResolvedValue(ok(RESULTS));
});

describe("ResultsView (spec 0009)", () => {
  it("shows the chart, the summary, and the best trial from saved data", async () => {
    navigation.query = "best=1&dir=max";
    const { container } = renderWithQuery(<ResultsView rawId="7" />);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: sampleDetail.title,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Volver al cuaderno" }),
    ).toHaveAttribute("href", "/cuadernos/7");

    const chart = await screen.findByRole("img", {
      name: "Gráfica de Duración contra Temperatura, 2 ensayos",
    });
    expect(within(chart).getByTestId("plot")).toHaveAttribute(
      "data-points",
      "2",
    );
    expect(
      screen.getByText(
        "2 ensayos graficados · 1 ensayo sin Duración no aparece",
      ),
    ).toBeInTheDocument();

    const summary = screen.getByRole("region", {
      name: "Resumen por variable",
    });
    const rows = within(summary).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Temperatura350 °C · ensayo 270 °C · ensayo 160 °C",
      "Duración220 min · ensayo 125 min · ensayo 222,5 min",
      "pH0Sin valores",
    ]);

    const best = screen.getByRole("region", { name: "Mejor ensayo" });
    expect(within(best).getByText("Ensayo 1")).toBeInTheDocument();
    expect(within(best).getByText("7")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lists the plotted points in X order under Ver puntos", async () => {
    renderWithQuery(<ResultsView rawId="7" />);
    const chart = await screen.findByRole("figure");
    const rows = within(chart).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual(["25025", "17020"]);
  });

  it("says when no trial has both variables, and when a variable has no values", async () => {
    navigation.query = "x=3&y=2&best=3";
    trialsMock.mockResolvedValue(
      ok({
        ...TRIALS,
        trials: TRIALS.trials.map((t) => ({
          ...t,
          cells: t.cells.filter((c) => c.variable_id !== 3),
        })),
      }),
    );
    const { container } = renderWithQuery(<ResultsView rawId="7" />);
    expect(
      await screen.findByText("Aún no hay ensayos con pH y Duración"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Aún no hay valores de pH"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows skeletons while loading", async () => {
    trialsMock.mockReturnValue(new Promise(() => {}));
    resultsMock.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQuery(<ResultsView rawId="7" />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("refreshes when a save invalidates the notebooks (AC-8)", async () => {
    const { client } = renderWithQuery(<ResultsView rawId="7" />);
    await screen.findByRole("img");
    trialsMock.mockResolvedValue(
      ok({
        ...TRIALS,
        trials: [
          ...TRIALS.trials,
          { id: 4, number: 4, cells: [cell(1, 80), cell(2, 30)] },
        ],
      }),
    );
    await client.invalidateQueries({ queryKey: experimentKeys.all });
    await waitFor(() =>
      expect(
        screen.getByRole("img", {
          name: "Gráfica de Duración contra Temperatura, 3 ensayos",
        }),
      ).toBeInTheDocument(),
    );
    expect(resultsMock).toHaveBeenCalledTimes(2);
  });

  it("shows the notebook's not found state for a bad id", async () => {
    renderWithQuery(<ResultsView rawId="abc" />);
    expect(
      await screen.findByRole("heading", { name: "Este cuaderno no existe" }),
    ).toBeInTheDocument();
  });
});
