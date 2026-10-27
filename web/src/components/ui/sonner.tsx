"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// No theme toggle: sonner follows prefers-color-scheme, like the tokens.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      position="top-center"
      icons={{
        success: <CircleCheckIcon className="size-4 text-saved" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4 text-warning-ink" />,
        error: <OctagonXIcon className="size-4 text-danger" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--color-surface)",
          "--normal-text": "var(--color-ink)",
          "--normal-border": "var(--color-line)",
          "--border-radius": "var(--radius-control)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
