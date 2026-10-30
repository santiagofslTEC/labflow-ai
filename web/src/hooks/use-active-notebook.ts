"use client";

import { useEffect, useState } from "react";

import type { ExperimentSummary } from "@/api/experiments";
import { useExperiments } from "@/hooks/use-experiments";
import { ACTIVE_NOTEBOOK_KEY, pickActive } from "@/lib/voice";

const readStored = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_NOTEBOOK_KEY);
  } catch {
    return null;
  }
};

// The notebook the home mic dictates into (spec 0004, AC-2): the one stored in
// this browser while it still exists, otherwise the most recent, written back
// so it stays pinned. Storage that throws falls back the same way.
export function useActiveNotebook(): ExperimentSummary | null {
  const notebooks = useExperiments().data;
  // Read once; the list loads on the client, so the first render matches the
  // server's either way.
  const [stored] = useState<string | null>(readStored);

  const active = notebooks ? pickActive(notebooks, stored) : null;

  useEffect(() => {
    if (active === null || String(active.id) === stored) return;
    try {
      window.localStorage.setItem(ACTIVE_NOTEBOOK_KEY, String(active.id));
    } catch {
      // Blocked storage: the fallback holds for this visit.
    }
  }, [active, stored]);

  return active;
}
