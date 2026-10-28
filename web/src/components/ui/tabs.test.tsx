import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const Sample = () => (
  <Tabs defaultValue="conversation">
    <TabsList aria-label="Vistas del experimento">
      <TabsTrigger value="conversation">Conversación</TabsTrigger>
      <TabsTrigger value="table">Tabla</TabsTrigger>
      <TabsTrigger value="chart">Gráfico</TabsTrigger>
    </TabsList>
    <TabsContent value="conversation">Mensajes</TabsContent>
    <TabsContent value="table">Ensayos</TabsContent>
    <TabsContent value="chart">Curva</TabsContent>
  </Tabs>
);

describe("Tabs", () => {
  it("moves between tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Sample />);

    await user.tab();
    expect(screen.getByRole("tab", { name: "Conversación" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    const table = screen.getByRole("tab", { name: "Tabla" });
    expect(table).toHaveFocus();
    expect(table).toHaveAttribute("aria-selected", "true");
    expect(table).toHaveClass("focus-ring", "h-10");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Ensayos");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Sample />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
