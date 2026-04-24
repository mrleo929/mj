import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase 尚未設定：請在 web/ 建立 .env.local 並填入 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY。",
    );
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
