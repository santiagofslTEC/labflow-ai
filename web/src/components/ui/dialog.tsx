"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { createContext, useContext, useState } from "react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { useSheetHistory } from "@/hooks/use-sheet-history";
import { cn } from "@/lib/utils";

// Lets a sheet know it is open and close itself when the phone's back gesture
// pops its history entry.
type SheetState = { readonly open: boolean; readonly close: () => void };
const SheetContext = createContext<SheetState | null>(null);

// Radix's root, holding the open state itself when the caller does not, so a
// sheet can close on the back gesture either way (spec 0010, AC-3).
function Dialog({
  open,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [inner, setInner] = useState(defaultOpen);
  const controlled = open !== undefined;
  const value = controlled ? open : inner;
  const change = (next: boolean) => {
    if (!controlled) setInner(next);
    onOpenChange?.(next);
  };
  return (
    <SheetContext.Provider value={{ open: value, close: () => change(false) }}>
      <DialogPrimitive.Root
        data-slot="dialog"
        open={value}
        onOpenChange={change}
        {...props}
      />
    </SheetContext.Provider>
  );
}

function DialogTrigger(
  props: React.ComponentProps<typeof DialogPrimitive.Trigger>,
) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(
  props: React.ComponentProps<typeof DialogPrimitive.Portal>,
) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(
  props: React.ComponentProps<typeof DialogPrimitive.Close>,
) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-ink/30 duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 supports-backdrop-filter:backdrop-blur-xs motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

const noop = () => {};

// The centered dialog, at 1024px and up for every dialog and on every width
// for an alert (a short question that needs no room).
const CENTERED =
  "top-1/2 left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-card border border-line p-6 shadow-card data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:max-w-md";

// Below 1024px a sheet fills the screen and slides up, clearing the notch and
// the home indicator; reduced motion keeps only the fade (spec 0010, AC-3).
const SHEET =
  "inset-0 h-dvh px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] motion-safe:max-lg:data-[state=closed]:slide-out-to-bottom motion-safe:max-lg:data-[state=open]:slide-in-from-bottom lg:inset-auto lg:top-1/2 lg:left-1/2 lg:h-auto lg:max-w-md lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-card lg:border lg:border-line lg:p-6 lg:shadow-card lg:data-[state=closed]:zoom-out-95 lg:data-[state=open]:zoom-in-95";

function DialogContent({
  className,
  children,
  showCloseButton = true,
  variant = "sheet",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  readonly showCloseButton?: boolean;
  readonly variant?: "sheet" | "alert";
}) {
  const state = useContext(SheetContext);
  const desktop = useIsDesktop();
  const sheet = variant === "sheet";
  useSheetHistory(
    sheet && !desktop && (state?.open ?? false),
    state?.close ?? noop,
  );

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-variant={variant}
        className={cn(
          "fixed z-50 grid w-full gap-5 bg-surface text-ink duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:duration-150",
          sheet ? SHEET : CENTERED,
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "absolute right-3",
                sheet
                  ? "top-[calc(env(safe-area-inset-top)+0.5rem)] max-lg:size-12 lg:top-3"
                  : "top-3",
              )}
              aria-label="Cerrar"
            >
              <XIcon aria-hidden />
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 pr-10", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-3 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-title font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-ink-muted", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
