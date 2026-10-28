import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { listExperiments } from "@/api/experiments";
import { summary } from "@/test/experiments";
import { renderWithQuery } from "@/test/query";

import { Sidebar } from "./sidebar";

const navigation = vi.hoisted(() => ({
  pathname: "/",
  params: {} as Record<string, string>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useParams: () => navigation.params,
}));

vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  listExperiments: vi.fn(),
}));

const listMock = vi.mocked(listExperiments);

const at = (pathname: string, params: Record<string, string> = {}) => {
  navigation.pathname = pathname;
  navigation.params = params;
};

const section = () => screen.getByRole("region", { name: "Cuadernos" });

beforeEach(() => {
  listMock.mockReset();
  at("/");
});

describe("Sidebar notebooks (spec 0005, AC-12)", () => {
  it("lists the 5 newest and highlights the open one", async () => {
    listMock.mockResolvedValue({
      ok: true,
      data: [1, 2, 3, 4, 5, 6].map((id) => summary(id)),
    });
    at("/cuadernos/3", { id: "3" });
    const { container } = renderWithQuery(<Sidebar showDevLinks={false} />);

    const list = await within(section()).findByRole("list");
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Cuaderno 1",
      "Cuaderno 2",
      "Cuaderno 3",
      "Cuaderno 4",
      "Cuaderno 5",
    ]);
    expect(links[2]).toHaveAttribute("aria-current", "page");
    expect(
      links.filter((link) => link.hasAttribute("aria-current")),
    ).toHaveLength(1);
    expect(
      within(section()).getByRole("link", { name: "Ver todos" }),
    ).toHaveAttribute("href", "/cuadernos");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("highlights nothing when the open notebook is not among the 5", async () => {
    listMock.mockResolvedValue({
      ok: true,
      data: [1, 2, 3, 4, 5, 6].map((id) => summary(id)),
    });
    at("/cuadernos/6", { id: "6" });
    renderWithQuery(<Sidebar showDevLinks={false} />);
    const list = await within(section()).findByRole("list");
    expect(within(list).getAllByRole("link")).toHaveLength(5);
    expect(list.querySelector("[aria-current]")).toBeNull();
  });

  it("invites a first notebook when there are none", async () => {
    listMock.mockResolvedValue({ ok: true, data: [] });
    renderWithQuery(<Sidebar showDevLinks={false} />);
    expect(
      await within(section()).findByText("Aún no hay cuadernos"),
    ).toBeInTheDocument();
    expect(
      within(section()).getByRole("link", { name: "Nuevo cuaderno" }),
    ).toHaveAttribute("href", "/cuadernos/nuevo");
  });

  it("shows two skeleton lines while loading", () => {
    listMock.mockReturnValue(new Promise(() => {}));
    renderWithQuery(<Sidebar showDevLinks={false} />);
    expect(screen.getAllByTestId("sidebar-skeleton")).toHaveLength(2);
  });

  it("shows only Ver todos when the list fails", async () => {
    listMock.mockResolvedValue({ ok: false, error: { kind: "unavailable" } });
    renderWithQuery(<Sidebar showDevLinks={false} />);
    await vi.waitFor(() =>
      expect(screen.queryAllByTestId("sidebar-skeleton")).toHaveLength(0),
    );
    expect(within(section()).getAllByRole("link")).toHaveLength(1);
    expect(within(section()).getByRole("link")).toHaveTextContent("Ver todos");
  });
});
