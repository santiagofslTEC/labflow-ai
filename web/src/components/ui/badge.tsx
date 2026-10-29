import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

// Variants from spec 0003: a soft fill with a status dot, no outline.
const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full px-2.5 text-xs font-medium whitespace-nowrap before:size-1.5 before:shrink-0 before:rounded-full before:content-[''] has-[>svg]:before:hidden [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        neutral: "bg-sunken text-ink-muted before:bg-control",
        saved: "bg-brand-soft text-brand before:bg-brand [&>svg]:text-brand",
        unsaved: "bg-unsaved text-warning-ink before:bg-unsaved-border",
        warning: "bg-unsaved text-warning-ink before:bg-unsaved-border",
        danger: "bg-sunken text-ink before:bg-danger [&>svg]:text-danger",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

function Badge({
  className,
  variant = "neutral",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { readonly asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
