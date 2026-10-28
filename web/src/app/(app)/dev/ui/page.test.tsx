import { afterEach, describe, expect, it, vi } from "vitest";

const notFound = vi.fn(() => {
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
});
vi.mock("next/navigation", () => ({ notFound }));

const { default: DevUiPage } = await import("./page");

afterEach(() => {
  vi.unstubAllEnvs();
  notFound.mockClear();
});

describe("/dev/ui gate (AC-16)", () => {
  it("calls notFound in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => DevUiPage()).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it.each(["preview", undefined])("renders for %s", (env) => {
    vi.stubEnv("VERCEL_ENV", env);
    expect(DevUiPage()).toBeTruthy();
    expect(notFound).not.toHaveBeenCalled();
  });
});
