"use client";

import { toast } from "sonner";

import type { MicDockState } from "@/components/mic-dock/types";
import { PushToTalk } from "@/components/push-to-talk/push-to-talk";

const IDLE: MicDockState = { kind: "idle" };

const SOON = "El dictado por voz llega pronto. Por ahora, abre un cuaderno.";

// The home's big mic (spec 0004). Voice capture is feature 8, so until it lands
// the button stays idle and says so instead of pretending to record.
function HomeMic() {
  const soon = () => {
    toast(SOON, { id: "voice-soon" });
  };

  return (
    <PushToTalk
      state={IDLE}
      onStart={soon}
      onStop={() => undefined}
      onCancel={() => undefined}
      onKeyboard={soon}
    />
  );
}

export { HomeMic };
