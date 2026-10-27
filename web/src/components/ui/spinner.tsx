import { Loader2Icon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

// Decorative: the surrounding text ("Guardando…") or a live region says what is loading.
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      aria-hidden
      className={cn(
        "size-4 animate-spin motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Spinner };
