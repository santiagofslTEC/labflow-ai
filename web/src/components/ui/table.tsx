import type * as React from "react";

import { cn } from "@/lib/utils";

// A borderless document table (Notion): hairline rows, quiet sentence case
// headers. containerClassName: the card to table flight needs
// `overflow-visible` while a value flies in, or the scroll container clips it.
function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { readonly containerClassName?: string }) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:hover:bg-transparent", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t font-medium", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-line transition-colors hover:bg-sunken/60",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 px-3 text-left align-middle text-[0.8125rem] font-normal whitespace-nowrap text-ink-muted first:pl-1 last:pr-1",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-10 px-3 align-middle whitespace-nowrap first:pl-1 last:pr-1",
        className,
      )}
      {...props}
    />
  );
}

// Numeric cells: Geist Mono, tabular figures, right aligned (spec 0003 type scale).
function TableNumberCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <TableCell
      data-numeric
      className={cn("text-right font-mono text-cell tabular-nums", className)}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("py-3 text-left text-xs text-ink-muted", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableNumberCell,
  TableRow,
};
