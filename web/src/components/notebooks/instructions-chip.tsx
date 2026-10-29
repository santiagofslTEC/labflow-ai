import { FileTextIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { FieldMessage } from "./field-error";

export const CHIP_ERROR_ID = "instrucciones-error";

// What is attached to the new notebook (AC-23), with Quitar, and any error the
// create route found in the instructions (AC-29).
function InstructionsChip({
  label,
  error,
  onRemove,
}: {
  readonly label: string;
  readonly error: string | null;
  readonly onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-fit max-w-full items-center gap-2 rounded-full bg-sunken py-1 pr-1 pl-3 text-sm text-ink">
        <FileTextIcon aria-hidden className="size-4 shrink-0 text-ink-muted" />
        <span className="min-w-0 truncate">{label}</span>
        <Button
          variant="ghost"
          onClick={onRemove}
          aria-describedby={error ? CHIP_ERROR_ID : undefined}
          className="rounded-full"
        >
          <XIcon aria-hidden />
          Quitar
        </Button>
      </div>
      <FieldMessage id={CHIP_ERROR_ID} message={error ?? undefined} />
    </div>
  );
}

export { InstructionsChip };
