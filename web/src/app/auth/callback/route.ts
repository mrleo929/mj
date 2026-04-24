import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent("請先設定 Supabase 環境變數")}`,
        origin,
      ),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent("缺少授權碼")}`, origin),
    );
  }

  const response = NextResponse.redirect(new URL(next, origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(error.message)}`,
        origin,
      ),
    );
  }

  return response;
}
