"use client";

import { MenuIcon, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { Sidebar } from "./sidebar";

// Below 1024px the sidebar opens as a sheet from the left.
function MobileNav({ showDevLinks }: { readonly showDevLinks: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir el menú">
          <MenuIcon aria-hidden />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/30 duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-line bg-canvas shadow-card duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left motion-reduce:animate-none">
          <DialogPrimitive.Title className="sr-only">
            Menú
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Navegación de LabFlow
          </DialogPrimitive.Description>
          <Sidebar
            showDevLinks={showDevLinks}
            onNavigate={() => setOpen(false)}
          />
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cerrar el menú"
              className="absolute top-2 right-2"
            >
              <XIcon aria-hidden />
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { MobileNav };
