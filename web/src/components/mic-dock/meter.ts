// Pure helpers for the listening pill (spec 0003, AC-12).
const ENVELOPE = [0.5, 0.8, 1, 0.8, 0.5] as const;
const FLOOR = 0.15;
const MAX_SECONDS = 99 * 60 + 59;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

// Five bar heights (0 to 1): a fixed envelope times the level, never below the floor.
export const levelBars = (level: number): readonly number[] => {
  const safe = Number.isFinite(level) ? clamp(level, 0, 1) : 0;
  return ENVELOPE.map((shape) => Math.max(FLOOR, shape * safe));
};

// mm:ss from elapsed milliseconds, clamped to 00:00..99:59.
export const formatElapsed = (elapsedMs: number): string => {
  const seconds = Number.isFinite(elapsedMs)
    ? clamp(Math.floor(elapsedMs / 1000), 0, MAX_SECONDS)
    : 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
};
