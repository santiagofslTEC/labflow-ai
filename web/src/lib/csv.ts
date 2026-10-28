// CSV for "Exportar datos" (RFC 4180): pure, so the download handler only
// wraps the text in a Blob.

type CsvVariable = { readonly name: string; readonly unit: string | null };

// Quote a field only when it holds a comma, a quote, or a line break.
export const csvField = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export const csvText = (rows: readonly (readonly string[])[]): string =>
  rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";

export const variableHeader = ({ name, unit }: CsvVariable): string =>
  unit ? `${name} (${unit})` : name;

// One column per variable, in the notebook's order, then one row per trial.
export const trialsCsv = (
  variables: readonly CsvVariable[],
  trials: readonly (readonly string[])[],
): string => csvText([["Ensayo", ...variables.map(variableHeader)], ...trials]);

// "Análisis de temperatura" -> "analisis-de-temperatura.csv".
export const csvFileName = (title: string): string => {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "cuaderno"}.csv`;
};
