"use client";

import { useEffect } from "react";

// Keeps the screen on while `active` (spec 0010, AC-9): a phone at the bench
// must not sleep while LabFlow listens. The browser drops the lock when the
// page is hidden, so it is taken again when the page is visible. Where the
// API is missing or refuses (older iOS, low battery), nothing changes.
export const useWakeLock = (active: boolean): void => {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let ended = false;

    const acquire = async () => {
      if (sentinel && !sentinel.released) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (ended) void next.release();
        else sentinel = next;
      } catch {
        // Refused (hidden page, battery saver): the screen just sleeps as usual.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      ended = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release();
    };
  }, [active]);
};
