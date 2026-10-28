// Access code gate (spec 0001). The web app only checks that the cookie exists;
// FastAPI checks its signature, age, and holder.
export const SESSION_COOKIE = "labflow_session";
export const ACCESS_PATH = "/access";

// Where to send someone after they enter a valid code: only a same origin path,
// never another site ("//evil.example") or the access page itself.
export function safeNextPath(raw: string | null | undefined): string {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.startsWith("/\\") ||
    raw === ACCESS_PATH ||
    raw.startsWith(`${ACCESS_PATH}?`) ||
    raw.startsWith(`${ACCESS_PATH}/`)
  ) {
    return "/";
  }
  return raw;
}

// The access page URL that returns to `from` once the code is accepted.
export function accessPathFor(from: string): string {
  const next = safeNextPath(from);
  return next === "/"
    ? ACCESS_PATH
    : `${ACCESS_PATH}?next=${encodeURIComponent(next)}`;
}
