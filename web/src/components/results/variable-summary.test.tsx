import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { sampleDetail } from "@/test/experiments";

import { VariableSummary } from "./variable-summary";

const results = {
  variables: [
    {
      variable_id: 1,
      count: 3,
      min: 50,
      max: 70,
      mean: 60,
      min_trials: [2],
      max_trials: [1, 3],
    },
  ],
};

describe("VariableSummary on the phone (spec 0010, AC-6)", () => {
  it("repeats the table as one card per variable with the same values", async () => {
    const { container } = render(
      <VariableSummary variables={sampleDetail.variables} results={results} />,
    );
    const cards = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(cards).toHaveLength(sampleDetail.variables.length);
    const first = cards[0]!;
    expect(first).toHaveTextContent("Temperatura");
    expect(within(first).getByText("Mínimo").nextSibling).toHaveTextContent(
      "ensayo 2",
    );
    expect(within(first).getByText("Máximo").nextSibling).toHaveTextContent(
      "ensayos 1 y 3",
    );
    expect(cards[2]).toHaveTextContent("Sin valores");
    const cells = screen.getAllByRole("row")[1]!;
    expect(cells).toHaveTextContent("Temperatura");
    expect(await axe(container)).toHaveNoViolations();
  });
});
