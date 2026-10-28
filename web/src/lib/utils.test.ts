import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("keeps a custom text size next to a text color", () => {
    expect(cn("text-readout", "text-ink")).toBe("text-readout text-ink");
    expect(cn("text-label", "text-muted-foreground")).toBe(
      "text-label text-muted-foreground",
    );
  });

  it("lets a later custom size, radius or shadow win", () => {
    expect(cn("text-sm", "text-cell")).toBe("text-cell");
    expect(cn("rounded-control", "rounded-card")).toBe("rounded-card");
    expect(cn("shadow-card", "shadow-dock")).toBe("shadow-dock");
  });
});
