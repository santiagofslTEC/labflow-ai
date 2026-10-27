import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-control border border-control bg-sunken px-3 text-base text-ink focus-ring transition-colors placeholder:text-ink-muted focus-visible:bg-surface disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
