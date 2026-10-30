"use client";

import { useEffect, useRef } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const MIN_PX = 3;
const MAX_PX = 26;
// Taller in the middle, like a voice meter (the LabFlow site's demo).
const WEIGHTS = [0.45, 0.7, 0.9, 1, 0.9, 0.7, 0.45] as const;

type LevelMeterProps = {
  readonly active: boolean;
  readonly level: () => number;
  readonly tone: "brand" | "muted";
  readonly className?: string;
};

// Bars that move with the voice while a session is live, drawn on animation
// frames through refs so nothing re-renders. Idle, they rest as small dots.
// Decorative: the state line says the same in words.
function LevelMeter({ active, level, tone, className }: LevelMeterProps) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const reduced = useReducedMotion();
  // The newest reader, without restarting the frame loop on every render.
  const read = useRef(level);
  useEffect(() => {
    read.current = level;
  }, [level]);

  useEffect(() => {
    const set = (heights: readonly number[]) =>
      bars.current.forEach((bar, i) => {
        if (bar) bar.style.height = `${heights[i] ?? MIN_PX}px`;
      });
    if (!active) {
      set(WEIGHTS.map(() => MIN_PX));
      return;
    }
    if (reduced) {
      set(WEIGHTS.map((w) => MIN_PX + w * (MAX_PX - MIN_PX) * 0.4));
      return;
    }
    let frame = 0;
    const draw = (t: number) => {
      // A floor keeps the bars breathing while the room is quiet.
      const value = Math.max(0.12, Math.min(1, read.current() * 1.8));
      set(
        WEIGHTS.map((w, i) => {
          const wobble = 0.65 + 0.35 * Math.sin(t / 140 + i * 1.3);
          return MIN_PX + (MAX_PX - MIN_PX) * value * w * wobble;
        }),
      );
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [active, reduced]);

  return (
    <span
      aria-hidden
      className={cn("flex h-7 items-center gap-[3px]", className)}
    >
      {WEIGHTS.map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          className={cn(
            "w-[3px] rounded-full transition-[height] duration-75",
            tone === "brand" ? "bg-brand" : "bg-control",
          )}
          style={{ height: MIN_PX }}
        />
      ))}
    </span>
  );
}

export { LevelMeter };
