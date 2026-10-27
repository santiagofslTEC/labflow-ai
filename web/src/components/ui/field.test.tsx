import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "./field";
import { Input } from "./input";
import { Textarea } from "./textarea";

const Form = ({ invalid = false }: { readonly invalid?: boolean }) => (
  <FieldGroup>
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor="value">Rendimiento</FieldLabel>
      <Input
        id="value"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "value-error" : undefined}
      />
      {invalid ? (
        <FieldError id="value-error">
          Escribe un número, por ejemplo 73,5
        </FieldError>
      ) : (
        <FieldDescription>En porcentaje.</FieldDescription>
      )}
    </Field>
    <Field>
      <FieldLabel htmlFor="notes">Notas</FieldLabel>
      <Textarea id="notes" />
    </Field>
  </FieldGroup>
);

describe("Input and Textarea in a Field", () => {
  it("are reached in order with Tab and accept typing", async () => {
    const user = userEvent.setup();
    render(<Form />);

    await user.tab();
    const input = screen.getByLabelText("Rendimiento");
    expect(input).toHaveFocus();
    expect(input).toHaveClass("focus-ring", "h-10");
    await user.keyboard("73,5");
    expect(input).toHaveValue("73,5");

    await user.tab();
    expect(screen.getByLabelText("Notas")).toHaveFocus();
  });

  it("ties the error to the control", () => {
    render(<Form invalid />);
    const input = screen.getByLabelText("Rendimiento");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "Escribe un número, por ejemplo 73,5",
    );
  });

  it("has no axe violations, valid or invalid", async () => {
    const valid = render(<Form />);
    expect(await axe(valid.container)).toHaveNoViolations();
    valid.unmount();
    const invalid = render(<Form invalid />);
    expect(await axe(invalid.container)).toHaveNoViolations();
  });
});
