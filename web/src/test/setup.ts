import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import * as axeMatchers from "vitest-axe/matchers";

import { stubMatchMedia } from "./media";

expect.extend(axeMatchers);

// Node environment tests (tokens, raw colors) share this file and have no DOM.
if (typeof window !== "undefined") {
  // Every test starts with motion allowed; a test opts in with stubReducedMotion().
  beforeEach(() => {
    stubMatchMedia(() => false);
  });

  afterEach(() => {
    cleanup();
  });

  // jsdom lacks these browser APIs; Radix and Motion call them.
  class ResizeObserverStub implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;

  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
}
