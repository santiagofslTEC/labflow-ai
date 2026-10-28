// Hold to talk with a tap fallback: a press held this long is a hold (release
// sends); a shorter press is a tap (recording keeps going until the next tap).
export const HOLD_MS = 350;

export type ReleaseOutcome = "stop" | "keep_listening";

export const releaseOutcome = (heldMs: number): ReleaseOutcome =>
  heldMs >= HOLD_MS ? "stop" : "keep_listening";
