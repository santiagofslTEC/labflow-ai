import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { supabaseConfig } from "./config";

// A client for route handlers (the /auth links): it reads and writes the session
// cookies of this request.
export const serverClient = async (): Promise<SupabaseClient | null> => {
  const config = supabaseConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet)
          store.set(name, value, options);
      },
    },
  });
};
