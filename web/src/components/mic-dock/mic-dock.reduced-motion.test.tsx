import { render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { stubReducedMotion } from "@/test/media";

import { MicDock } from "./mic-dock";

// Its own file: Motion reads the reduced motion preference once per module.
beforeEach(() => {
  stubReducedMotion();
});

it("marks the dock reduced and stops the bars from easing (AC-15)", () => {
  const { container } = render(
    <MicDock
      state={{ kind: "listening", elapsedMs: 1000, level: 0.5 }}
      text=""
      onTextChange={vi.fn()}
      onSubmitText={vi.fn()}
      onStart={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  expect(container.querySelector("[data-slot=mic-dock]")).toHaveAttribute(
    "data-motion",
    "reduced",
  );
  for (const bar of container.querySelectorAll("[data-bar]")) {
    expect(bar).not.toHaveClass("transition-transform");
  }
});
