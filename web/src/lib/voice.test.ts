import { describe, expect, it } from "vitest";

import { tentativeText, withoutFiller } from "./voice";

describe("withoutFiller (spec 0007, AC-22)", () => {
  it("drops the leading filler, glued to the reply or alone", () => {
    expect(withoutFiller("A ver. Guardado ensayo 3: 65 °C.")).toBe(
      "Guardado ensayo 3: 65 °C.",
    );
    expect(withoutFiller("A ver.")).toBe("");
    expect(withoutFiller("  A ver.  ")).toBe("");
  });

  it("leaves any other reply alone", () => {
    expect(withoutFiller("Guardado ensayo 3: 65 °C.")).toBe(
      "Guardado ensayo 3: 65 °C.",
    );
    expect(withoutFiller("¿A ver cuál ensayo?")).toBe("¿A ver cuál ensayo?");
  });
});

describe("tentativeText (spec 0007, AC-26)", () => {
  it("reads the words of a tentative transcript event", () => {
    expect(
      tentativeText({
        type: "tentative_user_transcript",
        tentative_user_transcription_event: {
          user_transcript: "ensayo 3, tempera",
          event_id: 2,
        },
      }),
    ).toBe("ensayo 3, tempera");
  });

  it("is null for other or malformed events", () => {
    expect(tentativeText({ type: "audio" })).toBeNull();
    expect(tentativeText({ type: "tentative_user_transcript" })).toBeNull();
    expect(tentativeText(null)).toBeNull();
    expect(tentativeText("x")).toBeNull();
  });
});
