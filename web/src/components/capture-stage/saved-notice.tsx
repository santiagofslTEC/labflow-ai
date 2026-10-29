"use client";

import { CircleCheckIcon, Undo2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { SavedTrial } from "@/lib/capture";

import { copy, savedNotice } from "./copy";

type SavedNoticeProps = {
  readonly saved: SavedTrial;
  readonly undoing: boolean;
  readonly onUndo: () => void;
};

// Shown in the card's place after an auto save (spec 0006, AC-28): what was
// saved, and Deshacer until the next sentence. Announced once, politely.
function SavedNotice({ saved, undoing, onUndo }: SavedNoticeProps) {
  const text = savedNotice(saved);
  return (
    <section
      aria-label={text}
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-solid border-saved bg-surface p-4 text-ink shadow-card sm:p-5"
    >
      <p role="status" className="flex items-center gap-2 text-sm">
        <CircleCheckIcon aria-hidden className="size-4 shrink-0" />
        {text}
      </p>
      <Button
        variant="secondary"
        size="lg"
        onClick={onUndo}
        aria-disabled={undoing || undefined}
      >
        {undoing ? <Spinner /> : <Undo2Icon aria-hidden />}
        {undoing ? copy.undoing : copy.undo}
      </Button>
    </section>
  );
}

export { SavedNotice };
