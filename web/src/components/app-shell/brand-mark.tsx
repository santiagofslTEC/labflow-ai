import { FlaskConicalIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

// A flask on a brand square plus the wordmark, until web/public/brand/logo.svg
// exists; then swap both for <Image src="/brand/logo.svg" alt="LabFlow" ... />
// (spec 0003, AC-18).
function BrandMark({ className }: { readonly className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex h-10 items-center gap-2.5 rounded-control px-1 text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink focus-ring",
        className,
      )}
    >
      <span
        aria-hidden
        className="flex size-6 items-center justify-center rounded-[7px] bg-brand text-on-brand"
      >
        <FlaskConicalIcon className="size-3.5" strokeWidth={2} />
      </span>
      <span>LabFlow</span>
    </Link>
  );
}

export { BrandMark };
