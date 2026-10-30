import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { listExperiments, listFolders } from "@/api/experiments";
import { summary } from "@/test/experiments";
import { renderWithQuery } from "@/test/query";

import { DashboardStats } from "./dashboard-stats";

vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  listExperiments: vi.fn(),
  listFolders: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(listExperiments).mockResolvedValue({
    ok: true,
    data: [
      summary(4, { trial_count: 4 }),
      summary(5, { trial_count: 1, status: "closed" }),
    ],
  });
  vi.mocked(listFolders).mockResolvedValue({
    ok: true,
    data: [
      {
        id: 3,
        name: "Química",
        notebook_count: 0,
        created_at: "2026-10-30T12:00:00Z",
      },
    ],
  });
});

const valueOf = (label: string) =>
  screen.getByText(label).closest("dt")?.nextElementSibling;

describe("DashboardStats", () => {
  it("counts notebooks, open ones, saved trials, and folders", async () => {
    const { container } = renderWithQuery(<DashboardStats />);
    expect(await screen.findByText("Cuadernos")).toBeInTheDocument();
    await waitFor(() => expect(valueOf("Carpetas")).toHaveTextContent("1"));
    expect(valueOf("Cuadernos")).toHaveTextContent("2");
    expect(valueOf("Abiertos")).toHaveTextContent("1");
    expect(valueOf("Ensayos guardados")).toHaveTextContent("5");
    expect(await axe(container)).toHaveNoViolations();
  });
});
