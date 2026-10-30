import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-control border border-control bg-surface px-3 py-2.5 text-base text-ink shadow-control focus-ring transition-colors placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger lg:text-[0.9375rem]",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
