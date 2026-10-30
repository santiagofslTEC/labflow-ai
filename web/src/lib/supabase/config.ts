// Supabase Auth (spec 0014). Both values are public by design: the publishable key
// reaches no LabFlow table (row level security with no policies, AC-8). Without
// them the app offers access codes only (AC-10). Read literally so Next inlines them.
export type SupabaseConfig = { readonly url: string; readonly key: string };

export const supabaseConfig = (): SupabaseConfig | null => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
};
