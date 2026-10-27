import { vi } from "vitest";

// jsdom has no matchMedia. `matches` decides the answer for each media query.
export const stubMatchMedia = (matches: (query: string) => boolean): void => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }),
  });
};

// Motion asks "(prefers-reduced-motion)"; CSS style queries add ": reduce".
export const stubReducedMotion = (): void => {
  stubMatchMedia(
    (query) =>
      query.includes("prefers-reduced-motion") &&
      !query.includes("no-preference"),
  );
};
