// Motion tokens (spec 0003). Constants only; components pick a fade instead of
// movement when useReducedMotion() (hooks/use-reduced-motion.ts) is true.
export const spring = {
  // State changes and the dock morph.
  snappy: { type: "spring", stiffness: 420, damping: 34 },
  // The card entering and the card to table flight.
  gentle: { type: "spring", stiffness: 220, damping: 26 },
} as const;

export const duration = {
  // Every reduced motion fallback: an opacity fade of 150ms or less.
  fade: 0.15,
} as const;

// The saved card: show the check, let the values fly into the table, then collapse.
// onSettled fires when the collapse ends.
export const savedExit = {
  delay: 0.85,
  collapse: 0.35,
} as const;

export const settleMs = (reduced: boolean): number =>
  Math.round(
    (reduced ? duration.fade : savedExit.delay + savedExit.collapse) * 1000,
  );
