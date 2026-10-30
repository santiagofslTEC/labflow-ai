"use client";

import { FlaskConicalIcon, KeyboardIcon, MicIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useTurns } from "@/hooks/use-experiments";
import { useNow } from "@/hooks/use-now";
import {
  formatTime,
  groupByDay,
  understoodBefore,
  type ThreadLine,
  type ThreadReading,
} from "@/lib/conversation";
import { formatQuantity } from "@/lib/format";
import { spring } from "@/lib/motion";

// The notebook's conversation (2026-10-30 restructure): every line you said or
// typed, and LabFlow's replies, under a day divider. Your lines are ink
// bubbles on the right marked dictado or escrito; LabFlow's sit on the left
// with what it understood as small cards, words on the left and the value on
// the right (the LabFlow site's demo).
function ConversationThread({
  experimentId,
}: {
  readonly experimentId: number;
}) {
  const query = useTurns(experimentId);
  const now = useNow();
  const end = useRef<HTMLDivElement>(null);
  const count = query.data?.length ?? 0;
  // Lines already there on the first load appear at once; later ones rise in.
  // Set during render from the first data (React's "previous render" pattern).
  const [baseline, setBaseline] = useState<number | null>(null);
  if (baseline === null && query.data) {
    setBaseline(query.data.at(-1)?.id ?? 0);
  }
  const isNew = (id: number) => baseline !== null && id > baseline;

  // A new line keeps the newest one in view, next to the text field.
  useEffect(() => {
    if (count > 0) end.current?.scrollIntoView?.({ block: "nearest" });
  }, [count]);

  if (query.isPending) {
    return (
      <div aria-busy className="flex flex-col gap-4 py-2">
        <Skeleton className="ml-auto h-12 w-2/3 max-w-sm rounded-2xl" />
        <Skeleton className="h-10 w-3/4 max-w-md" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="py-2 text-sm text-ink-muted">
        No pudimos cargar la conversación.
      </p>
    );
  }
  if (count === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <p className="font-medium text-ink">Tu primer ensayo empieza aquí</p>
        <p className="max-w-sm text-sm text-balance text-ink-muted">
          Toca el micrófono y dicta, o escribe abajo. Por ejemplo: «ensayo 1: 50
          grados, 15 minutos, rendimiento 73 %».
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Conversación" className="flex flex-col gap-6 py-2">
      {groupByDay(query.data, now).map((day) => (
        <div key={day.key} className="flex flex-col gap-6">
          <div className="flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            <span className="rounded-full bg-sunken px-2.5 py-0.5 text-xs text-ink-muted">
              {day.label}
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <ol className="flex flex-col gap-6">
            {day.lines.map((line, index) => (
              <motion.li
                key={line.id}
                initial={isNew(line.id) ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={spring.gentle}
              >
                {line.role === "user" ? (
                  <UserLine line={line} />
                ) : (
                  <AssistantLine
                    line={line}
                    understood={understoodBefore(day.lines, index)}
                    fresh={isNew(line.id)}
                  />
                )}
              </motion.li>
            ))}
          </ol>
        </div>
      ))}
      {/* The scroll margin keeps the newest line clear of the text field
          that sticks over the bottom of the chat box. */}
      <div ref={end} className="scroll-mb-28" />
    </section>
  );
}

function UserLine({ line }: { readonly line: ThreadLine }) {
  const date = new Date(line.created_at);
  const voice = line.source === "voice";
  const Icon = voice ? MicIcon : KeyboardIcon;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[0.9375rem] whitespace-pre-line text-on-ink shadow-control sm:max-w-[75%]">
        {line.text}
      </p>
      <p className="flex items-center gap-1.5 text-xs text-ink-muted">
        <Icon aria-hidden className="size-3.5" />
        <span>{voice ? "Dictado" : "Escrito"}</span>
        <span aria-hidden>·</span>
        <time dateTime={line.created_at} className="tabular-nums">
          {formatTime(date)}
        </time>
      </p>
    </div>
  );
}

function AssistantLine({
  line,
  understood,
  fresh,
}: {
  readonly line: ThreadLine;
  readonly understood: readonly ThreadReading[];
  readonly fresh: boolean;
}) {
  const date = new Date(line.created_at);
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-brand text-on-brand shadow-control"
      >
        <FlaskConicalIcon className="size-4" strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="flex items-baseline gap-2 text-sm">
          <span className="font-medium text-ink">LabFlow</span>
          <time
            dateTime={line.created_at}
            className="text-xs text-ink-muted tabular-nums"
          >
            {formatTime(date)}
          </time>
        </p>
        {understood.length > 0 ? (
          <Understood readings={understood} fresh={fresh} />
        ) : null}
        <p className="text-[0.9375rem] whitespace-pre-line text-ink">
          {line.text}
        </p>
      </div>
    </div>
  );
}

// "LabFlow entendió": each value next to the words it came from. The value is
// what the table holds; the words are what was heard.
function Understood({
  readings,
  fresh,
}: {
  readonly readings: readonly ThreadReading[];
  readonly fresh: boolean;
}) {
  return (
    <div className="flex max-w-md flex-col gap-1.5">
      <p className="text-xs text-ink-muted">LabFlow entendió</p>
      <ul className="flex flex-col gap-1.5">
        {readings.map((reading, index) => (
          <motion.li
            key={`${reading.trial_number}-${reading.variable}`}
            initial={fresh ? { opacity: 0, x: -8 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring.gentle, delay: fresh ? index * 0.08 : 0 }}
            className="flex items-center justify-between gap-4 rounded-control border border-line bg-surface px-3.5 py-2 text-sm shadow-control"
          >
            <span className="min-w-0 truncate text-ink-muted">
              <span className="sr-only">{reading.variable}: </span>
              {reading.said_text ?? reading.variable}
            </span>
            <span className="shrink-0 font-mono font-medium text-brand tabular-nums">
              {formatQuantity(reading.value, reading.unit)}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export { ConversationThread };
