import { CircleAlertIcon } from "lucide-react";

// A validation message under its field, tied to it with aria-describedby.
// Red only on the small icon (design.md: no loud color).
function FieldMessage({
  id,
  message,
}: {
  readonly id: string;
  readonly message: string | undefined;
}) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-xs text-ink">
      <CircleAlertIcon
        aria-hidden
        className="mt-px size-3.5 shrink-0 text-danger"
      />
      {message}
    </p>
  );
}

const errorId = (fieldId: string) => `${fieldId}-error`;

export { FieldMessage, errorId };
