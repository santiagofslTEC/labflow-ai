import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

// Variants from spec 0003: text / background / border.
const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 text-label font-semibold whitespace-nowrap uppercase [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        neutral: "border-transparent bg-sunken text-ink-muted",
        saved: "border-saved bg-surface text-saved",
        unsaved: "border-unsaved-border bg-unsaved text-warning-ink",
        warning: "border-unsaved-border bg-unsaved text-warning-ink",
        danger: "border-danger bg-surface text-danger",
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
