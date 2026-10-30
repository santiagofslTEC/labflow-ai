import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Input } from "./input";
import { Textarea } from "./textarea";

// iOS Safari zooms into any field under 16px (spec 0010, AC-8); desktop keeps 15px.
describe("text fields on the phone", () => {
  it("are 16px below 1024px and 15px at 1024px and up", () => {
    render(
      <>
        <Input aria-label="campo" />
        <Textarea aria-label="area" />
      </>,
    );
    for (const name of ["campo", "area"]) {
      const field = screen.getByRole("textbox", { name });
      expect(field).toHaveClass("text-base", "lg:text-[0.9375rem]");
    }
  });
});
