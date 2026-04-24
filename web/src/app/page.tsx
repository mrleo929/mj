import Link from "next/link";

export default function Home() {
  const hasSupabase =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Mj 網頁版（Next.js + Supabase）
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          全台約麻將，從這裡開始
        </h1>
        <p className="mt-4 leading-relaxed text-zinc-600 dark:text-zinc-400">
          專案已初始化：Supabase 客戶端、Session middleware、資料庫 migration
          草稿。接下來可實作登入、牌局列表與開局表單。
        </p>
        <div
          className={`mt-8 rounded-xl border px-4 py-3 text-sm ${
            hasSupabase
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          }`}
        >
          {hasSupabase ? (
            <span>已偵測到 Supabase 環境變數，可執行 `npm run dev` 開始開發。</span>
          ) : (
            <span>
              請複製 <code className="rounded bg-black/5 px-1 dark:bg-white/10">.env.example</code>{" "}
              為 <code className="rounded bg-black/5 px-1 dark:bg-white/10">.env.local</code>{" "}
              並填入 Supabase URL 與 anon key。
            </span>
          )}
        </div>
        <p className="mt-8">
          <Link
            href="/login"
            className="inline-flex rounded-full px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
            style={{ backgroundColor: "#06C755" }}
          >
            LINE 登入
          </Link>
        </p>
        <ul className="mt-8 list-inside list-disc space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            資料庫：將{" "}
            <code className="rounded bg-black/5 px-1 dark:bg-white/10">
              supabase/migrations/20260125000000_initial_schema.sql
            </code>{" "}
            貼到 Supabase SQL Editor 執行（建議新專案、執行一次）。
          </li>
          <li>原始碼目錄：<code className="rounded bg-black/5 px-1 dark:bg-white/10">web/</code></li>
        </ul>
      </main>
    </div>
  );
}
