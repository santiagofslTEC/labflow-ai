import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWakeLock } from "./use-wake-lock";

type Sentinel = { released: boolean; release: ReturnType<typeof vi.fn> };

const stubWakeLock = () => {
  const sentinels: Sentinel[] = [];
  const request = vi.fn(() => {
    const sentinel: Sentinel = {
      released: false,
      release: vi.fn(() => {
        sentinel.released = true;
        return Promise.resolve();
      }),
    };
    sentinels.push(sentinel);
    return Promise.resolve(sentinel);
  });
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request },
  });
  return { request, sentinels };
};

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
};

afterEach(() => {
  Reflect.deleteProperty(navigator, "wakeLock");
  setVisibility("visible");
});

describe("useWakeLock (spec 0010, AC-9)", () => {
  it("holds the screen while active and lets go when it ends", async () => {
    const { request, sentinels } = stubWakeLock();
    const { rerender } = renderHook(({ on }) => useWakeLock(on), {
      initialProps: { on: false },
    });
    expect(request).not.toHaveBeenCalled();
    await act(async () => rerender({ on: true }));
    expect(request).toHaveBeenCalledWith("screen");
    await act(async () => rerender({ on: false }));
    expect(sentinels[0]?.release).toHaveBeenCalled();
  });

  it("takes it again when the page comes back", async () => {
    const { request, sentinels } = stubWakeLock();
    renderHook(() => useWakeLock(true));
    await act(async () => {});
    // The browser drops the lock on a hidden page.
    sentinels[0]!.released = true;
    setVisibility("hidden");
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => setVisibility("visible"));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does nothing where the API is missing or refuses", async () => {
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request: vi.fn(() => Promise.reject(new Error("NotAllowed"))) },
    });
    renderHook(() => useWakeLock(true));
    await act(async () => {});
  });
});
