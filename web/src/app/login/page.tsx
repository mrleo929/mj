import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getSessionUser } from "@/lib/auth/session";
import { LineLoginForm } from "./line-login-form";
import { LoggedInPanel } from "./logged-in-panel";

export const metadata: Metadata = {
  title: "登入 — Mj",
  description: "使用 LINE 登入以約局與累積牌品",
};

type SearchParams = Promise<{ error?: string; next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const nextPath = safeNextPath(
    typeof params.next === "string" ? params.next : null,
  );
  const errorMessage =
    typeof params.error === "string" ? params.error : null;

  const user = await getSessionUser();
  const supabaseReady = isSupabaseConfigured();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
        <Link
          href="/"
          className="mb-8 text-sm text-zinc-500 transition hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← 返回首頁
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">登入 Mj</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          台灣使用者建議使用 LINE 一鍵登入。請先在 Supabase 與 LINE Developers
          完成設定（見專案 README）。
        </p>

        <div className="mt-10 space-y-6">
          {!supabaseReady ? (
            <p
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100"
              role="status"
            >
              尚未偵測到 Supabase 設定。請在{" "}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">web/</code>{" "}
              建立{" "}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">.env.local</code>
              ，填入{" "}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                NEXT_PUBLIC_SUPABASE_URL
              </code>{" "}
              與{" "}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>
              後重新部署。
            </p>
          ) : null}
          {user ? (
            <LoggedInPanel
              user={{
                id: user.profileId,
                app_metadata: {},
                user_metadata: {
                  display_name: user.displayName,
                  avatar_url: user.avatarUrl ?? undefined,
                },
                aud: "authenticated",
                created_at: new Date().toISOString(),
              }}
            />
          ) : (
            <LineLoginForm
              nextPath={nextPath}
              errorMessage={errorMessage}
              disabled={!supabaseReady}
            />
          )}
        </div>
      </main>
    </div>
  );
}
