import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_MESSAGES } from "@/lib/auth-messages";
import { browserClient } from "@/lib/supabase/browser";

import { sendPasswordReset, signInWithPassword, signUp } from "./auth";

vi.mock("@/lib/supabase/browser", () => ({ browserClient: vi.fn() }));
const clientMock = vi.mocked(browserClient);

const withAuth = (auth: Record<string, unknown>) =>
  clientMock.mockReturnValue({ auth } as never);

afterEach(() => {
  clientMock.mockReset();
});

describe("account actions (spec 0014)", () => {
  it("says wrong credentials in Spanish", async () => {
    withAuth({
      signInWithPassword: vi.fn().mockResolvedValue({
        error: { code: "invalid_credentials", status: 400 },
      }),
    });
    expect(await signInWithPassword("ana@example.com", "x")).toEqual({
      ok: false,
      message: AUTH_MESSAGES.wrongCredentials,
    });
  });

  it("answers an existing email like a new one, but not a real failure (AC-2)", async () => {
    const signUpCall = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "user_already_exists" } })
      .mockResolvedValueOnce({
        error: { code: "unexpected_failure", status: 500 },
      });
    withAuth({ signUp: signUpCall });
    expect(await signUp("", "ana@example.com", "1234567890")).toEqual({
      ok: true,
    });
    expect(await signUp("", "ana@example.com", "1234567890")).toEqual({
      ok: false,
      message: AUTH_MESSAGES.generic,
    });
  });

  it("answers a reset for an unknown email as sent (AC-3), and offline as offline", async () => {
    withAuth({
      resetPasswordForEmail: vi
        .fn()
        .mockResolvedValueOnce({ error: { code: "user_not_found" } })
        .mockRejectedValueOnce(new TypeError("Failed to fetch")),
    });
    expect(await sendPasswordReset("nadie@example.com")).toEqual({ ok: true });
    expect(await sendPasswordReset("nadie@example.com")).toEqual({
      ok: false,
      message: AUTH_MESSAGES.offline,
    });
  });

  it("fails cleanly when accounts are off (AC-10)", async () => {
    clientMock.mockReturnValue(null);
    expect((await signInWithPassword("a@b.co", "x")).ok).toBe(false);
  });
});
