import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { Field, FieldLabel } from "./field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

const Sample = ({
  onValueChange,
}: {
  readonly onValueChange?: (value: string) => void;
}) => (
  <Field>
    <FieldLabel htmlFor="unit">Unidad</FieldLabel>
    <Select onValueChange={onValueChange}>
      <SelectTrigger id="unit">
        <SelectValue placeholder="Elige una unidad" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="°C">°C</SelectItem>
          <SelectItem value="min">min</SelectItem>
          <SelectItem value="%">%</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
);

describe("Select", () => {
  it("opens and picks an option with the keyboard alone", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Sample onValueChange={onValueChange} />);

    await user.tab();
    const trigger = screen.getByRole("combobox", { name: "Unidad" });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveClass("focus-ring", "h-10");

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onValueChange).toHaveBeenCalledWith("min");
    expect(trigger).toHaveFocus();
  });

  it("has no axe violations", async () => {
    const { container } = render(<Sample />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
