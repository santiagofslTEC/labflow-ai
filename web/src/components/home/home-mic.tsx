"use client";

import Link from "next/link";

import { VoiceConversation } from "@/components/voice/voice-conversation";
import { useActiveNotebook } from "@/hooks/use-active-notebook";

// The home's big mic (spec 0004, spec 0007 AC-1): a hands free conversation
// with LabFlow that dictates into the active notebook.
function HomeMic() {
  const active = useActiveNotebook();

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <VoiceConversation experimentId={active?.id ?? null} variant="hero" />
      {active ? (
        <p className="text-sm text-ink-muted">
          Dictando en{" "}
          <Link
            href={`/cuadernos/${active.id}`}
            className="font-medium text-ink underline-offset-4 focus-ring hover:underline"
          >
            {active.title}
          </Link>
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          <Link
            href="/cuadernos/nuevo"
            className="font-medium text-ink underline-offset-4 focus-ring hover:underline"
          >
            Crea un cuaderno
          </Link>{" "}
          para empezar a dictar.
        </p>
      )}
    </div>
  );
}

export { HomeMic };
