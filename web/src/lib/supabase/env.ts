/** 是否已填入可用的 Supabase 專案 URL 與 anon key（非占位字）。 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return false;
  if (url.includes("YOUR_PROJECT_REF") || key === "your_anon_key") {
    return false;
  }
  return true;
}
