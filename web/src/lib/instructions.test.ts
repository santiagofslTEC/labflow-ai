import { describe, expect, it } from "vitest";

import {
  INSTRUCTION_LIMITS,
  INSTRUCTION_MESSAGES,
  checkInstructionsInput,
  checkPageRange,
  chipLabel,
  protocolLabel,
} from "./instructions";

const pdf = (name: string, size: number, type = "application/pdf"): File => {
  const file = new File(["%PDF-"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

describe("limits (shared with the API)", () => {
  it("match api/app/services/instructions.py", () => {
    expect(INSTRUCTION_LIMITS).toEqual({
      pdfBytes: 10_485_760,
      pages: 80,
      readChars: 100_000,
      minTextChars: 50,
    });
  });
});

describe("checkInstructionsInput (AC-20)", () => {
  it("takes a PDF by type or by name", () => {
    expect(
      checkInstructionsInput({ kind: "pdf", file: pdf("a.pdf", 10) }),
    ).toBe(null);
    expect(
      checkInstructionsInput({ kind: "pdf", file: pdf("A.PDF", 10, "") }),
    ).toBe(null);
    expect(
      checkInstructionsInput({
        kind: "pdf",
        file: pdf("a.png", 10, "image/png"),
      }),
    ).toBe(INSTRUCTION_MESSAGES.notPdf);
  });

  it("refuses a PDF over 10 MB", () => {
    const at = { kind: "pdf", file: pdf("a.pdf", 10_485_760) } as const;
    const over = { kind: "pdf", file: pdf("a.pdf", 10_485_761) } as const;
    expect(checkInstructionsInput(at)).toBe(null);
    expect(checkInstructionsInput(over)).toBe(INSTRUCTION_MESSAGES.tooLarge);
  });

  it("checks pasted text after trimming", () => {
    const text = (value: string) =>
      checkInstructionsInput({ kind: "text", text: value });
    expect(text(`  ${"x".repeat(49)}  `)).toBe(INSTRUCTION_MESSAGES.tooShort);
    expect(text("x".repeat(50))).toBe(null);
    expect(text("x".repeat(100_001))).toBe(INSTRUCTION_MESSAGES.tooLong);
  });
});

describe("checkPageRange (AC-22)", () => {
  it("takes whole pages from 1 to the count, Desde before Hasta", () => {
    expect(checkPageRange("12", "18", 70)).toEqual({ from: 12, to: 18 });
    expect(checkPageRange("5", "5", 70)).toEqual({ from: 5, to: 5 });
  });

  it.each([
    ["0", "3"],
    ["4", "3"],
    ["1", "71"],
    ["1,5", "3"],
    ["", "3"],
  ])("refuses %s to %s", (from, to) => {
    expect(checkPageRange(from, to, 70)).toEqual({
      error: "Elige páginas entre 1 y 70.",
    });
  });
});

describe("labels (AC-23, AC-31)", () => {
  it("names what is attached", () => {
    const file = pdf("practica.pdf", 10);
    expect(
      chipLabel({
        kind: "pdf",
        file,
        pageCount: 1,
        readFromPage: null,
        readToPage: null,
      }),
    ).toBe("practica.pdf · 1 pág");
    expect(
      chipLabel({
        kind: "pdf",
        file,
        pageCount: null,
        readFromPage: null,
        readToPage: null,
      }),
    ).toBe("practica.pdf");
    expect(chipLabel({ kind: "text", text: "  abc  " })).toBe(
      "Texto pegado · 3 caracteres",
    );
  });

  it("names the stored instructions on the notebook page", () => {
    expect(
      protocolLabel({ source: "pdf", filename: "guia.pdf", page_count: 12 }),
    ).toBe("Instrucciones: guia.pdf (12 págs)");
    expect(
      protocolLabel({ source: "text", filename: null, page_count: 1 }),
    ).toBe("Instrucciones: texto pegado");
  });
});
