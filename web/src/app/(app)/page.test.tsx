import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/test/query";

import Home from "./page";

vi.mock("./api-status", () => ({ ApiStatus: () => null }));
vi.mock("@/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/experiments")>()),
  listExperiments: () => new Promise(() => undefined),
}));

describe("Home (spec 0005, AC-13)", () => {
  it("points at notebooks and never says experimento", () => {
    const { container } = renderWithQuery(<Home />);
    expect(
      screen.getByRole("link", { name: "Nuevo cuaderno" }),
    ).toHaveAttribute("href", "/cuadernos/nuevo");
    expect(screen.getByRole("link", { name: "Mis cuadernos" })).toHaveAttribute(
      "href",
      "/cuadernos",
    );
    expect(container.textContent).not.toMatch(/experimento/i);
  });
});
