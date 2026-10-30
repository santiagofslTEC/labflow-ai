"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFolders } from "@/hooks/use-experiments";

const NONE = "none";

type FolderPickerProps = {
  readonly id?: string;
  readonly label: string;
  readonly value: number | null;
  readonly onChange: (folderId: number | null) => void;
  readonly disabled?: boolean;
  readonly className?: string;
};

// Which class folder a notebook sits in, "Sin carpeta" for none (2026-10-30).
function FolderPicker({
  id,
  label,
  value,
  onChange,
  disabled,
  className,
}: FolderPickerProps) {
  const folders = useFolders().data ?? [];
  return (
    <Select
      value={value === null ? NONE : String(value)}
      onValueChange={(next) => onChange(next === NONE ? null : Number(next))}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sin carpeta</SelectItem>
        {folders.map((folder) => (
          <SelectItem key={folder.id} value={String(folder.id)}>
            {folder.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { FolderPicker };
