import type * as React from "react";

import { BrandMark } from "@/components/app-shell/brand-mark";

// The sign in pages sit outside the app shell: one centered column on the canvas,
// the same on a phone.
function AccessShell({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas px-4 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[calc(env(safe-area-inset-bottom)+3rem)]">
      <div className="flex w-full max-w-[380px] flex-col gap-8">
        <BrandMark className="self-center" />
        <header className="flex flex-col gap-2 text-center">
          <h1 className="text-display font-semibold text-ink">{title}</h1>
          {description ? <p className="text-ink-muted">{description}</p> : null}
        </header>
        {children}
      </div>
    </main>
  );
}

export { AccessShell };
