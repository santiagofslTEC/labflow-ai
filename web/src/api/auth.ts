import { AUTH_MESSAGES, authMessage } from "@/lib/auth-messages";
import { browserClient } from "@/lib/supabase/browser";

// Supabase Auth from the browser (spec 0014). Every action answers a result with
// the Spanish message to show; none throws.
export type AuthResult =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

const OK: AuthResult = { ok: true };
const fail = (message: string): AuthResult => ({ ok: false, message });

// `quiet` error codes count as success, where telling them apart would reveal
// whether an email has an account (AC-2, AC-3).
const run = async (
  action: (
    client: NonNullable<ReturnType<typeof browserClient>>,
  ) => Promise<{ readonly error: { code?: string; status?: number } | null }>,
  quiet: readonly string[] = [],
): Promise<AuthResult> => {
  const client = browserClient();
  if (!client) return fail(AUTH_MESSAGES.generic);
  try {
    const { error } = await action(client);
    if (!error || (error.code !== undefined && quiet.includes(error.code)))
      return OK;
    return fail(authMessage(error));
  } catch {
    return fail(AUTH_MESSAGES.offline);
  }
};

// Back through /auth/callback, which trades the code for a session.
const callback = (next: string) =>
  `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

export const signInWithGoogle = (next: string): Promise<AuthResult> =>
  run((client) =>
    client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback(next) },
    }),
  );

export const signInWithPassword = (
  email: string,
  password: string,
): Promise<AuthResult> =>
  run((client) =>
    client.auth.signInWithPassword({ email: email.trim(), password }),
  );

// An email that already has an account gets the same answer, so the form never
// says whether one exists (AC-2).
export const signUp = (
  name: string,
  email: string,
  password: string,
): Promise<AuthResult> =>
  run(
    (client) =>
      client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: callback("/"),
          data: name.trim() ? { full_name: name.trim() } : {},
        },
      }),
    ["user_already_exists", "email_exists"],
  );

// "Sent" for an unknown email too, for the same reason (AC-3).
export const sendPasswordReset = (email: string): Promise<AuthResult> =>
  run(
    (client) =>
      client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: callback("/access/nueva-contrasena"),
      }),
    ["user_not_found"],
  );

export const setNewPassword = (password: string): Promise<AuthResult> =>
  run((client) => client.auth.updateUser({ password }));

export const signOutAccount = (): Promise<AuthResult> =>
  run((client) => client.auth.signOut({ scope: "local" }));
