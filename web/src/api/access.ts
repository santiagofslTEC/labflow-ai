import { api } from "./client";

export type AccessResult =
  | { readonly ok: true; readonly holder: string }
  | { readonly ok: false; readonly message: string };

const OFFLINE_MESSAGE =
  "No pudimos conectar con LabFlow. Revisa tu conexión y vuelve a intentar.";

// POST /api/access. On success the API sets the labflow_session cookie.
export async function submitAccessCode(code: string): Promise<AccessResult> {
  try {
    const { data, error } = await api.POST("/api/access", { body: { code } });
    if (data) return { ok: true, holder: data.holder };
    return { ok: false, message: error?.message ?? OFFLINE_MESSAGE };
  } catch {
    // fetch rejects only when the network or the rewrite is down.
    return { ok: false, message: OFFLINE_MESSAGE };
  }
}
