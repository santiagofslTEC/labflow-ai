import type * as React from "react";

import { BrandMark } from "./brand-mark";

// Header (64px, wordmark), the content area, and room for the dock: DockSlot
// sets --dock-height while a dock is mounted, and the content pads by it.
function AppShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-control bg-ink px-4 py-2 text-on-ink focus-ring focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-40 h-16 border-b border-line bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4 lg:px-8">
          <BrandMark />
        </div>
      </header>
      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pt-6 pb-[calc(var(--dock-height,0px)+1.5rem)] outline-none lg:px-8 lg:pt-10"
      >
        {children}
      </main>
    </div>
  );
}

export { AppShell };
