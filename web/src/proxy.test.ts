// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "./proxy";

const supabase = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  token: null as string | null,
  refresh: [] as { name: string; value: string }[],
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    {
      cookies,
    }: { cookies: { setAll: (c: { name: string; value: string }[]) => void } },
  ) => ({
    auth: {
      getClaims: () => {
        if (supabase.refresh.length) cookies.setAll(supabase.refresh);
        return Promise.resolve({
          data: supabase.claims ? { claims: supabase.claims } : null,
        });
      },
      getSession: () =>
        Promise.resolve({
          data: {
            session: supabase.token ? { access_token: supabase.token } : null,
          },
        }),
    },
  }),
}));

const request = (
  path: string,
  init: { cookie?: string; authorization?: string } = {},
) =>
  new NextRequest(new URL(path, "https://labflow.test"), {
    headers: {
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.authorization ? { authorization: init.authorization } : {}),
    },
  });

const forwarded = (response: Response, name: string) =>
  response.headers.get(`x-middleware-request-${name}`);

const accountsOn = () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
};

afterEach(() => {
  vi.unstubAllEnvs();
  supabase.claims = null;
  supabase.token = null;
  supabase.refresh = [];
});

describe("proxy (spec 0014, AC-4)", () => {
  it("sends a page with no session to /access and lets the sign in pages through", async () => {
    const page = await proxy(request("/cuadernos/7?vista=ensayos"));
    expect(page.headers.get("location")).toBe(
      "https://labflow.test/access?next=%2Fcuadernos%2F7%3Fvista%3Densayos",
    );
    for (const path of ["/access", "/access/crear", "/auth/callback"])
      expect((await proxy(request(path))).headers.get("location")).toBeNull();
  });

  it("lets a code cookie through, as before", async () => {
    const page = await proxy(request("/", { cookie: "labflow_session=x" }));
    expect(page.headers.get("location")).toBeNull();
  });

  it("lets a Supabase session through and writes refreshed cookies back", async () => {
    accountsOn();
    supabase.claims = { sub: "u1" };
    supabase.refresh = [{ name: "sb-proyecto-auth-token", value: "nuevo" }];
    const page = await proxy(request("/cuadernos"));
    expect(page.headers.get("location")).toBeNull();
    expect(page.cookies.get("sb-proyecto-auth-token")?.value).toBe("nuevo");
  });

  it("forwards the account's token to the API and drops the browser's", async () => {
    accountsOn();
    supabase.claims = { sub: "u1" };
    supabase.token = "token-de-supabase";
    const api = await proxy(
      request("/api/experiments", { authorization: "Bearer falso" }),
    );
    expect(forwarded(api, "authorization")).toBe("Bearer token-de-supabase");
    supabase.claims = null;
    const anonymous = await proxy(
      request("/api/experiments", { authorization: "Bearer falso" }),
    );
    expect(anonymous.headers.get("location")).toBeNull();
    expect(forwarded(anonymous, "authorization")).toBeNull();
  });
});
