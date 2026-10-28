import type * as React from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  readonly title: string;
  readonly eyebrow?: string;
  readonly description?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly className?: string;
};

// The page's one <h1>.
function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
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
        <h1 className="text-display font-semibold text-balance text-ink lg:text-display-lg">
          {title}
        </h1>
        {description ? (
          <div className="max-w-2xl text-sm text-ink-muted">{description}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>
      ) : null}
    </header>
  );
}

export { PageHeader };
export type { PageHeaderProps };
