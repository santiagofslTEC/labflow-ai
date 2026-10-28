import type { LucideIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

type PanelHeadingProps = {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly meta?: React.ReactNode;
  readonly className?: string;
};

// The small view label above a table or chart: an icon chip with the view's
// name on the left, quiet meta (a count, a caption) on the right.
function PanelHeading({
  id,
  icon: Icon,
  title,
  meta,
  className,
}: PanelHeadingProps) {
  return (
    <div
      className={cn(
        "flex min-h-10 items-center justify-between gap-3 border-b border-line pb-2",
        className,
      )}
    >
      <h2
        id={id}
        className="inline-flex items-center gap-1.5 rounded-md bg-sunken px-2 py-1 text-sm font-medium text-ink"
      >
        <Icon aria-hidden className="size-4 text-ink-muted" />
        {title}
      </h2>
      {meta ? <div className="text-sm text-ink-muted">{meta}</div> : null}
    </div>
  );
}

export { PanelHeading };
export type { PanelHeadingProps };
