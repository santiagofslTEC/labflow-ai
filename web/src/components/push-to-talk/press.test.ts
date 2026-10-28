import { describe, expect, it } from "vitest";

import { HOLD_MS, releaseOutcome } from "./press";

describe("releaseOutcome", () => {
  it("treats a short press as a tap that keeps listening", () => {
    expect(releaseOutcome(0)).toBe("keep_listening");
    expect(releaseOutcome(HOLD_MS - 1)).toBe("keep_listening");
  });

  it("treats a long press as a hold that stops on release", () => {
    expect(releaseOutcome(HOLD_MS)).toBe("stop");
    expect(releaseOutcome(4000)).toBe("stop");
  });
});
