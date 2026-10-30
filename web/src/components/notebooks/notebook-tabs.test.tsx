import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotebookTabs, parseVista, vistaQuery } from "./notebook-tabs";

describe("notebook views (spec 0010, AC-2)", () => {
  it("reads any other value as Capturar", () => {
    expect(parseVista(null)).toBe("capturar");
    expect(parseVista("ensayos")).toBe("ensayos");
    expect(parseVista("variables")).toBe("variables");
    expect(parseVista("tabla")).toBe("capturar");
  });

  it("keeps other params and drops vista for Capturar", () => {
    const params = new URLSearchParams("x=1&vista=ensayos");
    expect(vistaQuery(params, "variables")).toBe("?x=1&vista=variables");
    expect(vistaQuery(params, "capturar")).toBe("?x=1");
    expect(vistaQuery(new URLSearchParams(), "capturar")).toBe("");
  });

  it("shows the pending dot on Capturar only while another view is open", () => {
    const { rerender } = render(
      <NotebookTabs vista="ensayos" onChange={vi.fn()} pending />,
    );
    expect(
      screen.getByRole("button", { name: "Capturar Propuesta pendiente" }),
    ).toBeInTheDocument();
    rerender(<NotebookTabs vista="capturar" onChange={vi.fn()} pending />);
    expect(
      screen.getByRole("button", { name: "Capturar" }),
    ).toBeInTheDocument();
  });
});
