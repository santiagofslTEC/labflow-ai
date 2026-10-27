import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { type ApiHealth, ApiStatusBadge } from "./api-status";

describe("ApiStatusBadge (AC-17)", () => {
  it.each([
    [{ state: "loading" }, "Conectando con la API…", "neutral"],
    [{ state: "ok", env: "dev" }, "API conectada (dev)", "saved"],
    [{ state: "down" }, "La API no responde", "danger"],
  ] as const satisfies readonly (readonly [ApiHealth, string, string])[])(
    "shows %o as %s in the %s badge",
    async (status, text, variant) => {
      const { container } = render(<ApiStatusBadge status={status} />);
      const region = screen.getByRole("status");
      expect(region).toHaveTextContent(text);
      expect(region.querySelector("[data-slot=badge]")).toHaveAttribute(
        "data-variant",
        variant,
      );
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});
