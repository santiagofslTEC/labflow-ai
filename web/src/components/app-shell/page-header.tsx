import type * as React from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  readonly title: string;
  readonly eyebrow?: string;
  readonly description?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly className?: string;
  // The phone hides parts of a long header (spec 0010, AC-2).
  readonly titleClassName?: string;
  readonly descriptionClassName?: string;
  readonly actionsClassName?: string;
};

// The page's one <h1>.
function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
  titleClassName,
  descriptionClassName,
  actionsClassName,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow ? <p className="text-sm text-ink-muted">{eyebrow}</p> : null}
        <h1
          className={cn(
            "text-display font-semibold text-balance text-ink lg:text-display-lg",
            titleClassName,
          )}
        >
          {title}
        </h1>
        {description ? (
          <div
            className={cn(
              "max-w-2xl text-sm text-ink-muted",
              descriptionClassName,
            )}
          >
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className={cn("flex shrink-0 flex-wrap gap-3", actionsClassName)}>
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export { PageHeader };
export type { PageHeaderProps };
