// Every number shown to a user goes through formatQuantity (spec 0003, AC-13).
const LOCALE = "es";

const numberFormat = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 3,
});

export const formatNumber = (value: number): string =>
  numberFormat.format(value);

export const formatQuantity = (value: number, unit: string | null): string =>
  unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);

export type ParsedDecimal =
  { readonly ok: true; readonly value: number } | { readonly ok: false };

// One optional sign, digits, and at most one separator: comma or dot, both decimal.
const DECIMAL = /^-?\d+([.,]\d+)?$/;

export const parseDecimal = (text: string): ParsedDecimal => {
  const trimmed = text.trim();
  return DECIMAL.test(trimmed)
    ? { ok: true, value: Number(trimmed.replace(",", ".")) }
    : { ok: false };
};

// A variable's expected range on the notebook page (spec 0005, AC-10).
export const formatRange = (min: number | null, max: number | null): string => {
  if (min !== null && max !== null) {
    return `${formatQuantity(min, null)} a ${formatQuantity(max, null)}`;
  }
  if (min !== null) return `≥ ${formatQuantity(min, null)}`;
  if (max !== null) return `≤ ${formatQuantity(max, null)}`;
  return "—";
};
