import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-control border border-transparent font-medium tracking-[-0.005em] whitespace-nowrap focus-ring transition-colors select-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-brand text-on-brand shadow-control hover:bg-brand/90",
        secondary:
          "border-line bg-surface text-ink shadow-control hover:bg-sunken",
        ghost: "text-ink-muted hover:bg-sunken hover:text-ink",
        // Destructive actions look like secondary; only the icon carries the red.
        danger:
          "border-line bg-surface text-ink shadow-control hover:bg-sunken [&_svg]:text-danger",
      },
      size: {
        md: "h-10 px-4 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        lg: "h-12 px-5 text-[0.9375rem] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-10",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    readonly asChild?: boolean;
  };

function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  type = "button",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
