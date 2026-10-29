import type { LucideIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
  readonly headingLevel?: "h1" | "h2" | "h3";
  readonly className?: string;
};

// Small outline icon, a short title, one line, one action (Linear, Obvious).
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  headingLevel: Heading = "h2",
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      <Icon
        className="mb-1 size-8 text-ink-muted"
        strokeWidth={1.5}
        aria-hidden
      />
      <Heading className="text-lg font-semibold tracking-[-0.01em] text-ink">
        {title}
      </Heading>
      <p className="max-w-sm text-sm text-ink-muted">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
