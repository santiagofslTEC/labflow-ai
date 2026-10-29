import { HomeMic } from "@/components/home/home-mic";
import { RecentNotebooks } from "@/components/home/recent-notebooks";

import { ApiStatus } from "./api-status";

// The voice first home (spec 0004): one question, the big mic, and the recent
// notebooks under it (Notion AI, ChatGPT).
export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-10 pt-4 lg:pt-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-display font-semibold text-balance text-ink lg:text-display-lg">
          ¿Qué mediste?
        </h1>
        <p className="max-w-md text-sm text-ink-muted">
          Dicta una medición, confirma lo que LabFlow entendió y obtén la tabla
          y el gráfico al momento.
        </p>
      </div>

      <HomeMic />

      <RecentNotebooks />

      <div className="mt-auto">
        <ApiStatus />
      </div>
    </div>
  );
}
