import { describe, expect, it } from "vitest";

import { isDevUiEnabled } from "./dev-ui";

describe("isDevUiEnabled", () => {
  it("hides /dev/ui in production", () => {
    expect(isDevUiEnabled("production")).toBe(false);
  });

  it.each(["preview", "development", undefined])("shows it for %s", (env) => {
    expect(isDevUiEnabled(env)).toBe(true);
  });
});
