"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// The browser clock, rounded down to `intervalMs` and ticking at that pace, so
// "hace 5 minutos" stays current without a render on every millisecond.
export function useNow(intervalMs = 60_000): Date {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const timer = window.setInterval(onChange, intervalMs);
      return () => window.clearInterval(timer);
    },
    [intervalMs],
  );
  const snapshot = () => Math.floor(Date.now() / intervalMs) * intervalMs;
  const now = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(() => new Date(now), [now]);
}
