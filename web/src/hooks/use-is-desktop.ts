"use client";

import { useSyncExternalStore } from "react";

// Spec 0003's breakpoint (Tailwind `lg`): the phone layout is everything below it.
const QUERY = "(min-width: 1024px)";

const subscribe = (onChange: () => void): (() => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

// For the few things CSS cannot do (spec 0010: the focus return, the chart's
// drag). Layout stays CSS only. The server and the hydrating render see
// `false`, then React re-renders with the real value.
export const useIsDesktop = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
