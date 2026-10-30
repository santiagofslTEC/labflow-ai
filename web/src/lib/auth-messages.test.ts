import { describe, expect, it } from "vitest";

import {
  AUTH_MESSAGES,
  authMessage,
  emailProblem,
  passwordProblem,
} from "./auth-messages";

describe("Supabase errors in Spanish (spec 0014, AC-1 to AC-3)", () => {
  it("names the cases a person can act on, and is generic otherwise", () => {
    expect(authMessage({ code: "invalid_credentials" })).toBe(
      "Correo o contraseña incorrectos.",
    );
    expect(authMessage({ code: "email_not_confirmed" })).toBe(
      AUTH_MESSAGES.unconfirmed,
    );
    expect(authMessage({ code: "weak_password" })).toBe(
      AUTH_MESSAGES.weakPassword,
    );
    expect(authMessage({ code: "over_email_send_rate_limit" })).toBe(
      AUTH_MESSAGES.tooMany,
    );
    expect(authMessage({ status: 429 })).toBe(AUTH_MESSAGES.tooMany);
    expect(authMessage({ code: "unexpected_failure" })).toBe(
      AUTH_MESSAGES.generic,
    );
  });

  it("checks the email and the password length before sending", () => {
    expect(emailProblem(" ana@example.com ")).toBeNull();
    expect(emailProblem("ana@")).toBe("Escribe un correo válido.");
    expect(passwordProblem("123456789")).toBe(AUTH_MESSAGES.weakPassword);
    expect(passwordProblem("1234567890")).toBeNull();
  });
});
