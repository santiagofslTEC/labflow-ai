import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { listExperiments } from "@/api/experiments";
import { summary } from "@/test/experiments";
import { renderWithQuery } from "@/test/query";

import { ContinueCard } from "./continue-card";

vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  listExperiments: vi.fn(),
}));

const listMock = vi.mocked(listExperiments);

beforeEach(() => {
  listMock.mockReset();
  window.localStorage.clear();
});

describe("ContinueCard (lab dashboard)", () => {
  it("leads back to the latest notebook's mic", async () => {
    listMock.mockResolvedValue({
      ok: true,
      data: [summary(4, { title: "Análisis de Temperatura", trial_count: 4 })],
    });
    const { container } = renderWithQuery(<ContinueCard />);

    expect(
      await screen.findByRole("heading", { name: "Análisis de Temperatura" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/4 ensayos/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Seguir dictando" }),
    ).toHaveAttribute("href", "/cuadernos/4");
    expect(screen.getByRole("link", { name: "Resultados" })).toHaveAttribute(
      "href",
      "/cuadernos/4/resultados",
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("offers no mic for a closed notebook", async () => {
    listMock.mockResolvedValue({
      ok: true,
      data: [summary(4, { status: "closed", trial_count: 1 })],
    });
    renderWithQuery(<ContinueCard />);
    expect(await screen.findByText(/1 ensayo/)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Seguir dictando" }),
    ).not.toBeInTheDocument();
  });

  it("invites the first notebook when there is none", async () => {
    listMock.mockResolvedValue({ ok: true, data: [] });
    renderWithQuery(<ContinueCard />);
    expect(
      await screen.findByRole("link", { name: "Crear cuaderno" }),
    ).toHaveAttribute("href", "/cuadernos/nuevo");
  });
});
