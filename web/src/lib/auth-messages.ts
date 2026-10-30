// Supabase Auth errors in the words LabFlow uses (spec 0014, AC-1 to AC-3). Pure.
// Codes from Supabase's error reference; anything else gets the generic line.
export const AUTH_MESSAGES = {
  wrongCredentials: "Correo o contraseña incorrectos.",
  unconfirmed: "Confirma tu correo antes de entrar; te enviamos un enlace.",
  weakPassword: "Usa una contraseña de al menos 10 caracteres.",
  tooMany: "Demasiados intentos. Espera un momento y vuelve a intentar.",
  offline:
    "No pudimos conectar con LabFlow. Revisa tu conexión y vuelve a intentar.",
  google: "No pudimos entrar con Google. Intenta de nuevo.",
  link: "El enlace ya no sirve. Pide uno nuevo.",
  generic: "No pudimos completar eso. Intenta de nuevo.",
  checkEmail: (email: string) =>
    `Te enviamos un enlace a ${email}. Ábrelo para activar tu cuenta.`,
  resetSent: "Si hay una cuenta con ese correo, te enviamos un enlace.",
} as const;

export const authMessage = (
  error: { readonly code?: string; readonly status?: number } | null,
): string => {
  switch (error?.code) {
    case "invalid_credentials":
      return AUTH_MESSAGES.wrongCredentials;
    case "email_not_confirmed":
      return AUTH_MESSAGES.unconfirmed;
    case "weak_password":
      return AUTH_MESSAGES.weakPassword;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return AUTH_MESSAGES.tooMany;
    default:
      return error?.status === 429
        ? AUTH_MESSAGES.tooMany
        : AUTH_MESSAGES.generic;
  }
};

// The client side checks before anything is sent (AC-2, AC-3).
export const PASSWORD_MIN = 10;
export const NAME_MAX = 80;

export const emailProblem = (email: string): string | null =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? null
    : "Escribe un correo válido.";

export const passwordProblem = (password: string): string | null =>
  password.length >= PASSWORD_MIN ? null : AUTH_MESSAGES.weakPassword;
