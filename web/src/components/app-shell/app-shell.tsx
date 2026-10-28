import type * as React from "react";

import { BrandMark } from "./brand-mark";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";

type AppShellProps = {
  readonly children: React.ReactNode;
  readonly showDevLinks: boolean;
};

// Sidebar on the canvas, content on a surface sheet inset from the window
// (Linear, Plane). Below 1024px a slim top bar opens the sidebar as a sheet.
// DockSlot sets --dock-height while a dock is mounted; the content pads by it.
function AppShell({ children, showDevLinks }: AppShellProps) {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-control bg-ink px-4 py-2 text-on-ink focus-ring focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 lg:block">
        <Sidebar showDevLinks={showDevLinks} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-1 border-b border-line bg-canvas/85 px-2 backdrop-blur-md lg:hidden">
          <MobileNav showDevLinks={showDevLinks} />
          <BrandMark />
        </header>
        <div className="flex flex-1 flex-col bg-surface lg:rounded-card lg:border lg:border-line lg:shadow-control">
          <main
            id="contenido"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-[calc(var(--dock-height,0px)+1.5rem)] outline-none lg:px-10 lg:pt-10"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export { AppShell };
export type { AppShellProps };
