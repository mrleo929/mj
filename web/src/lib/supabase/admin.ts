import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function createAdminClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase 尚未設定：缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceRole) {
    throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY（用於寫入 profiles）");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

