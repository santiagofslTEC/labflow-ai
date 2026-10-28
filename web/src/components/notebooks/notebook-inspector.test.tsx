import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { sampleDetail } from "@/test/experiments";

import { NotebookInspector } from "./notebook-inspector";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NotebookInspector", () => {
  it("summarizes the notebook from API data only", async () => {
    const { container } = render(
      <NotebookInspector experiment={sampleDetail} trialCount={4} />,
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
      <NotebookInspector experiment={sampleDetail} trialCount={undefined} />,
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

    render(<NotebookInspector experiment={sampleDetail} trialCount={0} />);

    expect(
      screen.getByRole("link", { name: "Tabla completa" }),
    ).toHaveAttribute("href", "#tabla");
    expect(
      screen.getByRole("link", { name: "Revisar variables" }),
    ).toHaveAttribute("href", "#lista-variables");

    await userEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(createUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledWith("blob:csv");
    vi.unstubAllGlobals();
  });
});
