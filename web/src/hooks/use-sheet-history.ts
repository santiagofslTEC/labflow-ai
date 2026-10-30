"use client";

import { useEffect, useRef } from "react";

const KEY = "labflowSheet";

// While a phone sheet is open it owns one history entry, so the back gesture
// closes the sheet instead of leaving the page (spec 0010, AC-3). Closing it
// any other way pops that entry again, unless something already navigated.
export const useSheetHistory = (active: boolean, close: () => void): void => {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!active) return;
    const id = crypto.randomUUID();
    const state: unknown = window.history.state;
    window.history.pushState(
      { ...(typeof state === "object" ? state : {}), [KEY]: id },
      "",
    );
    let popped = false;
    const onPop = () => {
      popped = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      const current: unknown = window.history.state;
      const ours =
        typeof current === "object" &&
        current !== null &&
        (current as Record<string, unknown>)[KEY] === id;
      if (!popped && ours) window.history.back();
    };
  }, [active]);
};
