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
        "flex flex-col items-center gap-3 rounded-card border border-dashed border-line px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-sunken text-ink-muted">
        <Icon className="size-6" aria-hidden />
      </span>
      <Heading className="font-serif text-title font-normal text-ink">
        {title}
      </Heading>
      <p className="max-w-sm text-sm text-ink-muted">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
