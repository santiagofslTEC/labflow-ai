// Experiment instructions in the browser (spec 0005, AC-19 to AC-24): the
// limits, the checks before any request, and the chip text. Pure.

// Mirrored by api/app/services/instructions.py; a test on each side pins the
// same numbers, so a change must touch both.
export const INSTRUCTION_LIMITS = {
  pdfBytes: 10_485_760,
  pages: 80,
  readChars: 100_000,
  minTextChars: 50,
} as const;

// What the panel sends to the read route.
export type InstructionsInput =
  | { readonly kind: "pdf"; readonly file: File }
  | { readonly kind: "text"; readonly text: string };

export type PageRange = { readonly from: number; readonly to: number };

// What the form keeps attached. The page numbers are null after a failed read.
export type AttachedInstructions =
  | {
      readonly kind: "pdf";
      readonly file: File;
      readonly pageCount: number | null;
      readonly readFromPage: number | null;
      readonly readToPage: number | null;
    }
  | { readonly kind: "text"; readonly text: string };

export const INSTRUCTION_MESSAGES = {
  notPdf: "Elige un archivo PDF.",
  tooLarge: "El PDF pesa más de 10 MB.",
  tooShort: "Pega un poco más de las instrucciones.",
  tooLong: "Pega solo la parte de tu práctica (máximo 100 000 caracteres).",
  pageRange: (pageCount: number) => `Elige páginas entre 1 y ${pageCount}.`,
  readFailed:
    "No pudimos leer las instrucciones. Llena el formulario o intenta de nuevo.",
  inProgress: "Ya estamos leyendo unas instrucciones. Espera a que termine.",
} as const;

const isPdf = (file: File): boolean =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

// The message to show in the panel, or null when the input can be sent (AC-20).
export const checkInstructionsInput = (
  input: InstructionsInput,
): string | null => {
  if (input.kind === "pdf") {
    if (!isPdf(input.file)) return INSTRUCTION_MESSAGES.notPdf;
    return input.file.size > INSTRUCTION_LIMITS.pdfBytes
      ? INSTRUCTION_MESSAGES.tooLarge
      : null;
  }
  const length = input.text.trim().length;
  if (length < INSTRUCTION_LIMITS.minTextChars) {
    return INSTRUCTION_MESSAGES.tooShort;
  }
  return length > INSTRUCTION_LIMITS.readChars
    ? INSTRUCTION_MESSAGES.tooLong
    : null;
};

const wholePage = (text: string): number | null =>
  /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;

// Desde and Hasta as typed: whole numbers, 1 to pageCount, Desde ≤ Hasta (AC-22).
export const checkPageRange = (
  from: string,
  to: string,
  pageCount: number,
): PageRange | { readonly error: string } => {
  const first = wholePage(from);
  const last = wholePage(to);
  if (first === null || last === null || first < 1 || first > last) {
    return { error: INSTRUCTION_MESSAGES.pageRange(pageCount) };
  }
  return last > pageCount
    ? { error: INSTRUCTION_MESSAGES.pageRange(pageCount) }
    : { from: first, to: last };
};

const pages = (count: number): string =>
  count === 1 ? "1 pág" : `${count} págs`;

// "{filename} · {n} págs", just the name before a successful read, or
// "Texto pegado · {n} caracteres" (AC-23).
export const chipLabel = (attached: AttachedInstructions): string => {
  if (attached.kind === "text") {
    return `Texto pegado · ${attached.text.trim().length} caracteres`;
  }
  return attached.pageCount === null
    ? attached.file.name
    : `${attached.file.name} · ${pages(attached.pageCount)}`;
};

// The notebook page's meta line (AC-31).
export const protocolLabel = (protocol: {
  readonly source: "pdf" | "text";
  readonly filename: string | null;
  readonly page_count: number;
}): string =>
  protocol.source === "text"
    ? "Instrucciones: texto pegado"
    : `Instrucciones: ${protocol.filename ?? "instrucciones.pdf"} (${pages(protocol.page_count)})`;

// Codes from the create route that belong to the attached instructions, shown
// next to the chip instead of above the buttons (AC-29).
export const INSTRUCTION_ERROR_CODES: ReadonlySet<string> = new Set([
  "instructions_missing",
  "file_too_large",
  "pdf_unreadable",
  "too_many_pages",
  "no_text_in_pdf",
  "instructions_too_short",
  "text_too_long",
  "invalid_page_range",
]);
