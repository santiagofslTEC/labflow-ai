import Link from "next/link";

import { cn } from "@/lib/utils";

// Text wordmark until web/public/brand/logo.svg exists; then swap the <span> for
// <Image src="/brand/logo.svg" alt="LabFlow" ... /> (spec 0003, AC-18).
function BrandMark({ className }: { readonly className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex h-10 items-center rounded-control px-1 font-serif text-[1.375rem] text-ink focus-ring",
        className,
      )}
    >
      <span>LabFlow</span>
    </Link>
  );
}

export { BrandMark };
