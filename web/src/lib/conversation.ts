import { formatShortDate } from "./relative-time";

// A value a line saved, with the words it came from.
export type ThreadReading = {
  readonly variable: string;
  readonly said_text: string | null;
  readonly value: number;
  readonly unit: string | null;
  readonly trial_number: number;
};

export type ThreadLine = {
  readonly id: number;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly source: "voice" | "text" | null;
  readonly created_at: string;
  readonly readings: readonly ThreadReading[];
};

// What LabFlow understood from your line, shown with its reply: the readings
// of the user line right before it.
export const understoodBefore = (
  lines: readonly ThreadLine[],
  index: number,
): readonly ThreadReading[] => {
  const previous = lines[index - 1];
  return previous?.role === "user" ? previous.readings : [];
};

// The notebook's thread: lines grouped under a day divider, oldest first.
export type ThreadDay = {
  readonly key: string;
  readonly label: string;
  readonly lines: readonly ThreadLine[];
};

const time = new Intl.DateTimeFormat("es", {
  hour: "2-digit",
  minute: "2-digit",
});

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

// "Hoy", "Ayer", then "28 oct". In the browser's time zone.
export const dayLabel = (date: Date, now: Date): string => {
  if (dayKey(date) === dayKey(now)) return "Hoy";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return "Ayer";
  return formatShortDate(date, now);
};

// "10:42".
export const formatTime = (date: Date): string => time.format(date);

export const groupByDay = (
  lines: readonly ThreadLine[],
  now: Date,
): readonly ThreadDay[] =>
  lines.reduce<readonly ThreadDay[]>((days, line) => {
    const date = new Date(line.created_at);
    const key = dayKey(date);
    const last = days.at(-1);
    return last?.key === key
      ? [...days.slice(0, -1), { ...last, lines: [...last.lines, line] }]
      : [...days, { key, label: dayLabel(date, now), lines: [line] }];
  }, []);
