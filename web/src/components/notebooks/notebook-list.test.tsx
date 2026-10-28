import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { experimentKeys, listExperiments } from "@/api/experiments";
import { summary } from "@/test/experiments";
import { renderWithQuery } from "@/test/query";

import { NotebookList, trialCountText } from "./notebook-list";

vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  listExperiments: vi.fn(),
}));

const listMock = vi.mocked(listExperiments);

// A fixed clock on a minute boundary: useNow rounds down to the minute.
const NOW = new Date(2026, 9, 28, 12, 0, 0);

beforeEach(() => {
  listMock.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000).toISOString();

describe("trialCountText", () => {
  it.each([
    [0, "sin ensayos"],
    [1, "1 ensayo"],
    [12, "12 ensayos"],
    [1500, "1500 ensayos"],
  ])("%i → %s", (count, expected) => {
    expect(trialCountText(count)).toBe(expected);
  });
});

describe("NotebookList (spec 0005, AC-1, AC-2)", () => {
  it("lists notebooks in API order, each row a link with its meta", async () => {
    listMock.mockResolvedValue({
      ok: true,
      data: [
        summary(9, {
          title: "Cinética",
          trial_count: 3,
          last_activity_at: minutesAgo(5),
        }),
        summary(4, {
          title: "Titulación",
          status: "closed",
          trial_count: 1,
          last_activity_at: minutesAgo(0),
        }),
      ],
    });
    const { container } = renderWithQuery(<NotebookList />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Mis cuadernos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Nuevo cuaderno" }),
    ).toHaveAttribute("href", "/cuadernos/nuevo");

    const list = await screen.findByRole("list", { name: "Cuadernos" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/cuadernos/9",
      "/cuadernos/4",
    ]);
    expect(links[0]).toHaveTextContent("Cinéticahace 5 minutos · 3 ensayos");
    expect(links[1]).toHaveTextContent("Titulaciónahora · 1 ensayoCerrado");
    expect(within(links[0] as HTMLElement).queryByText("Cerrado")).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows three skeleton rows while loading", () => {
    listMock.mockReturnValue(new Promise(() => {}));
    renderWithQuery(<NotebookList />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando cuadernos");
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(3);
  });

  it("invites you to create the first notebook when there are none", async () => {
    listMock.mockResolvedValue({ ok: true, data: [] });
    renderWithQuery(<NotebookList />);
    expect(
      await screen.findByRole("heading", { name: "Crea tu primer cuaderno" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Nuevo cuaderno" }),
    ).toHaveLength(2);
  });

  it("offers Reintentar on a failed load and never shows the empty state", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "unavailable" } });
    const user = userEvent.setup();
    renderWithQuery(<NotebookList />);

    const retry = await screen.findByRole("button", { name: "Reintentar" });
    expect(screen.getByText("No pudimos cargar tus cuadernos")).toBeVisible();
    expect(screen.queryByText("Crea tu primer cuaderno")).toBeNull();

    listMock.mockResolvedValue({ ok: true, data: [summary(1)] });
    await user.click(retry);
    expect(await screen.findByText("Cuaderno 1")).toBeInTheDocument();
  });

  it("keeps the shown list when a background refetch fails", async () => {
    listMock.mockResolvedValue({ ok: true, data: [summary(1)] });
    const { client } = renderWithQuery(<NotebookList />);
    expect(await screen.findByText("Cuaderno 1")).toBeInTheDocument();

    listMock.mockResolvedValue({ ok: false, error: { kind: "unavailable" } });
    await client.refetchQueries({ queryKey: experimentKeys.all });
    await waitFor(() =>
      expect(client.getQueryState(experimentKeys.all)?.status).toBe("error"),
    );
    expect(screen.getByText("Cuaderno 1")).toBeInTheDocument();
    expect(screen.queryByText("No pudimos cargar tus cuadernos")).toBeNull();
  });
});
