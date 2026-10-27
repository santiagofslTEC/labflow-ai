"use client";

import { useLayoutEffect, useRef } from "react";
import type * as React from "react";

// Pins the dock to the bottom of the screen and publishes its height as
// --dock-height, so AppShell's content reserves exactly that much room.
function DockSlot({ children }: { readonly children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty("--dock-height", `${node.offsetHeight}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--dock-height");
    };
  }, []);

  return (
    <div
      ref={ref}
      data-slot="dock"
      className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]"
    >
      {children}
    </div>
  );
}

export { DockSlot };
