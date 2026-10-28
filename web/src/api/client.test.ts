import { afterEach, describe, expect, it, vi } from "vitest";

import { redirectOnUnauthorized } from "./client";

type OnResponse = NonNullable<typeof redirectOnUnauthorized.onResponse>;

const respond = (url: string, status: number) =>
  redirectOnUnauthorized.onResponse?.({
    request: new Request(new URL(url, window.location.origin)),
    response: new Response(null, { status }),
  } as Parameters<OnResponse>[0]);

describe("redirectOnUnauthorized (spec 0004 AC-20)", () => {
  const assign = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    assign.mockClear();
  });

  const stubLocation = (path: string) =>
    vi.stubGlobal("location", {
      origin: "http://localhost:3000",
      pathname: path.split("?")[0],
      search: path.includes("?") ? `?${path.split("?")[1]}` : "",
      assign,
    });

  it("sends a 401 to /access with the current page as next", async () => {
    stubLocation("/experimentos/3");
    await respond("/api/experiments/3/summary", 401);
    expect(assign).toHaveBeenCalledWith("/access?next=%2Fexperimentos%2F3");
  });

  it("leaves a wrong code on /api/access to the form", async () => {
    stubLocation("/access");
    await respond("/api/access", 401);
    expect(assign).not.toHaveBeenCalled();
  });

  it("ignores other statuses", async () => {
    stubLocation("/");
    await respond("/api/health", 200);
    await respond("/api/experiments/3/summary", 404);
    expect(assign).not.toHaveBeenCalled();
  });
});
