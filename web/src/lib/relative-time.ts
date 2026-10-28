// Activity times in the notebook list and dates on the notebook page (spec 0005).
const LOCALE = "es";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
const dayMonth = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
});
const dayMonthYear = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

// "28 oct", with the year when it is not `now`'s year. In the browser's time zone.
export const formatShortDate = (date: Date, now: Date): string =>
  (date.getFullYear() === now.getFullYear() ? dayMonth : dayMonthYear).format(
    date,
  );

// "ahora", "hace 5 minutos", "hace 3 horas", "ayer", "hace 4 días", then a date.
// A time in the future (clock skew) reads "ahora".
export function formatRelative(date: Date, now: Date): string {
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return "ahora";
  if (elapsed < HOUR) {
    return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  }
  if (elapsed < DAY)
    return relative.format(-Math.floor(elapsed / HOUR), "hour");
  const days = Math.floor(elapsed / DAY);
  return days < 7 ? relative.format(-days, "day") : formatShortDate(date, now);
}
