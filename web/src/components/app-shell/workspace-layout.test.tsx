import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { WorkspaceLayout } from "./workspace-layout";

const slots = (card: boolean) => ({
  conversation: <p data-testid="conversation">Mensajes</p>,
  card: card ? <p data-testid="card">Propuesta</p> : undefined,
  table: <p data-testid="table">Tabla de ensayos</p>,
  chart: <p data-testid="chart">Curva</p>,
  dock: (
    <label>
      Medición <input data-testid="dock" />
    </label>
  ),
});

describe("WorkspaceLayout (AC-14)", () => {
  it("renders every slot exactly once, whichever tab is active", async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout {...slots(true)} />);

    const once = () => {
      for (const id of ["conversation", "card", "table", "chart", "dock"]) {
        expect(screen.getAllByTestId(id)).toHaveLength(1);
      }
    };
    once();
    await user.click(screen.getByRole("tab", { name: "Tabla" }));
    once();
  });

  it("keeps every panel mounted and hides inactive ones with CSS only", async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout {...slots(false)} />);
    await user.click(screen.getByRole("tab", { name: "Gráfico" }));

    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    expect(panels).toHaveLength(3);
    for (const panel of panels) expect(panel).not.toHaveAttribute("hidden");
    const inactive = panels.filter(
      (panel) => panel.dataset.state === "inactive",
    );
    expect(inactive).toHaveLength(2);
    for (const panel of inactive) {
      expect(panel).toHaveClass("data-[state=inactive]:hidden");
    }
  });

  it("puts the card in the Conversación panel", () => {
    render(<WorkspaceLayout {...slots(true)} />);
    const conversation = screen.getByRole("tabpanel", { name: "Conversación" });
    expect(within(conversation).getByTestId("card")).toBeInTheDocument();
  });

  it("marks Conversación with Propuesta pendiente only while another tab hides the card", async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout {...slots(true)} />);
    const conversationTab = () =>
      screen.getByRole("tab", { name: /^Conversación/ });

    expect(conversationTab()).toHaveAccessibleName("Conversación");
    await user.click(screen.getByRole("tab", { name: "Tabla" }));
    expect(conversationTab()).toHaveAccessibleName(
      "Conversación Propuesta pendiente",
    );
  });

  it("shows no dot when there is no card", async () => {
    const user = userEvent.setup();
    render(<WorkspaceLayout {...slots(false)} />);
    await user.click(screen.getByRole("tab", { name: "Tabla" }));
    expect(
      screen.getByRole("tab", { name: /^Conversación/ }),
    ).toHaveAccessibleName("Conversación");
  });

  it("pins the dock in a fixed slot and has no axe violations", async () => {
    const { container } = render(<WorkspaceLayout {...slots(true)} />);
    expect(screen.getByTestId("dock").closest("[data-slot=dock]")).toHaveClass(
      "fixed",
      "bottom-0",
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
