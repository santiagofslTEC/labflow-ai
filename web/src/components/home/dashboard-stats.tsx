"use client";

import {
  BookOpenIcon,
  FlaskConicalIcon,
  FolderIcon,
  TableIcon,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";

import { useExperiments, useFolders } from "@/hooks/use-experiments";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Stat = {
  readonly label: string;
  readonly value: number | undefined;
  readonly caption: string;
  readonly icon: LucideIcon;
  readonly tone: string;
};

// Full class names per hue, so Tailwind sees them.
const TONES = {
  rose: "border-tint-rose-line bg-tint-rose",
  amber: "border-tint-amber-line bg-tint-amber",
  green: "border-tint-green-line bg-tint-green",
  blue: "border-tint-blue-line bg-tint-blue",
} as const;

// Four colored counts across the top of the dashboard (the hilos reference).
// Every number is counted from the notebook and folder lists, never guessed.
function DashboardStats() {
  const notebooks = useExperiments().data;
  const folders = useFolders().data;
  const stats: readonly Stat[] = [
    {
      label: "Cuadernos",
      value: notebooks?.length,
      caption: "en tu laboratorio",
      icon: BookOpenIcon,
      tone: TONES.rose,
    },
    {
      label: "Abiertos",
      value: notebooks?.filter((n) => n.status === "open").length,
      caption: "listos para dictar",
      icon: FlaskConicalIcon,
      tone: TONES.amber,
    },
    {
      label: "Ensayos guardados",
      value: notebooks?.reduce((sum, n) => sum + n.trial_count, 0),
      caption: "en todos tus cuadernos",
      icon: TableIcon,
      tone: TONES.green,
    },
    {
      label: "Carpetas",
      value: folders?.length,
      caption: "una por clase",
      icon: FolderIcon,
      tone: TONES.blue,
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.gentle, delay: index * 0.05 }}
          className={cn(
            "flex flex-col gap-3 rounded-[18px] border p-4 text-ink shadow-control transition-transform duration-200 hover:-translate-y-0.5 lg:p-5",
            stat.tone,
          )}
        >
          <dt className="flex items-center justify-between gap-2 text-sm font-medium">
            <stat.icon aria-hidden className="size-5" />
            <span className="text-right">{stat.label}</span>
          </dt>
          <dd className="flex flex-col gap-0.5">
            <span className="font-mono text-4xl font-semibold tracking-tight tabular-nums">
              {stat.value ?? "–"}
            </span>
            <span className="text-sm">{stat.caption}</span>
          </dd>
        </motion.div>
      ))}
    </dl>
  );
}

export { DashboardStats };
