import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { currentTab, TabBar } from "./tab-bar";
import { backFor, TopBar } from "./top-bar";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

beforeEach(() => {
  navigation.pathname = "/";
});

describe("TabBar (spec 0010, AC-1)", () => {
  it("links the four destinations and marks the current one", async () => {
    navigation.pathname = "/cuadernos/7";
    const { container } = render(<TabBar />);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    const links = within(nav).getAllByRole("link");
    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Inicio", "/"],
      ["Cuadernos", "/cuadernos"],
      ["Nuevo", "/cuadernos/nuevo"],
      ["Ajustes", "/configuracion"],
    ]);
    expect(
      within(nav).getByRole("link", { name: "Cuadernos" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(nav).getByRole("link", { name: "Inicio" }),
    ).not.toHaveAttribute("aria-current");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("puts each page under its tab", () => {
    expect(currentTab("/")).toBe("/");
    expect(currentTab("/cuadernos")).toBe("/cuadernos");
    expect(currentTab("/cuadernos/7")).toBe("/cuadernos");
    expect(currentTab("/cuadernos/7/resultados")).toBe("/cuadernos");
    expect(currentTab("/cuadernos/nuevo")).toBe("/cuadernos/nuevo");
    expect(currentTab("/configuracion")).toBe("/configuracion");
    expect(currentTab("/dev/ui")).toBeNull();
  });
});

describe("TopBar (spec 0010, AC-1)", () => {
  it("goes back from a notebook's results to the notebook, and from a notebook to Cuadernos", () => {
    expect(backFor("/cuadernos/7/resultados")).toEqual({
      href: "/cuadernos/7",
      label: "Volver al cuaderno",
    });
    expect(backFor("/cuadernos/7")).toEqual({
      href: "/cuadernos",
      label: "Volver a Cuadernos",
    });
    expect(backFor("/cuadernos")).toBeNull();
    expect(backFor("/")).toBeNull();
  });

  it("shows the back arrow only below a notebook", () => {
    navigation.pathname = "/cuadernos/7/resultados";
    const { unmount } = render(<TopBar />);
    expect(
      screen.getByRole("link", { name: "Volver al cuaderno" }),
    ).toHaveAttribute("href", "/cuadernos/7");
    unmount();
    navigation.pathname = "/cuadernos";
    render(<TopBar />);
    expect(screen.queryByRole("link", { name: /Volver/ })).toBeNull();
    expect(screen.getByRole("link", { name: "LabFlow" })).toBeInTheDocument();
  });
});
