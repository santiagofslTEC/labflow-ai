import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseConfig } from "./config";

// The browser's client: @supabase/ssr keeps one per page and stores the session in
// cookies, so the proxy can read and refresh it (AC-4). Null when accounts are off.
export const browserClient = (): SupabaseClient | null => {
  const config = supabaseConfig();
  return config ? createBrowserClient(config.url, config.key) : null;
};
