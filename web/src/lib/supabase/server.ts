import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase 尚未設定：請在 web/ 目錄建立 .env.local，填入 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY。",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; ignore if middleware already refreshed session.
          }
        },
      },
    },
  );
}
