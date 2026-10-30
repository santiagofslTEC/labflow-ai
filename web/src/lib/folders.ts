import type { ApiFailure } from "@/api/experiments";

// "1 cuaderno", "3 cuadernos", "sin cuadernos".
export const notebooksLabel = (count: number): string =>
  count === 0
    ? "sin cuadernos"
    : count === 1
      ? "1 cuaderno"
      : `${count} cuadernos`;

// What a failed folder change says; the API's Spanish message when it sent one.
export const folderFailure = (error: ApiFailure | null): string | null => {
  if (error === null) return null;
  switch (error.kind) {
    case "invalid":
      return error.message || "Revisa el nombre.";
    case "not_found":
      return "Esa carpeta ya no existe.";
    case "unauthorized":
      return "Tu sesión terminó. Vuelve a entrar.";
    case "unavailable":
      return "No pudimos guardar. Revisa tu conexión y vuelve a intentar.";
  }
};

// A `?carpeta=` value that can name a folder; anything else is none.
export const parseFolderId = (
  raw: string | string[] | undefined,
): number | null => {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
