import type * as React from "react";

import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { TopBar } from "./top-bar";

type AppShellProps = {
  readonly children: React.ReactNode;
  readonly showDevLinks: boolean;
};

// Sidebar on the canvas, content on a surface sheet inset from the window
// (Linear, Plane). Below 1024px a slim top bar and a bottom tab bar take the
// sidebar's place (spec 0010, AC-1). DockSlot sets --dock-height while a dock
// is mounted; the content pads by it and by --tabbar-height. The minimum
// height is svh, not dvh: dvh grows as the phone's browser bar hides mid
// scroll, which resized the page under the finger (spec 0010, AC-11).
function AppShell({ children, showDevLinks }: AppShellProps) {
  return (
    <div className="flex min-h-svh">
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
        <TopBar />
        <div className="flex flex-1 flex-col bg-surface lg:rounded-card lg:border lg:border-line lg:shadow-control">
          <main
            id="contenido"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-[calc(var(--dock-height,0px)+var(--tabbar-height)+1.5rem)] outline-none lg:px-10 lg:pt-10"
          >
            {children}
          </main>
        </div>
      </div>
      <TabBar />
    </div>
  );
}

export { AppShell };
export type { AppShellProps };
