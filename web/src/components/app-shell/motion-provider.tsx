"use client";

import { MotionConfig } from "motion/react";
import type * as React from "react";

// Motion follows the system's reduced motion setting everywhere (spec 0003).
function MotionProvider({ children }: { readonly children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export { MotionProvider };
