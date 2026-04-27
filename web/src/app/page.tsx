import Link from "next/link";

export default function Home() {
  const hasSupabase =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 sm:max-w-xl sm:px-6 sm:py-16">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          麻上有局
        </h1>
        <p className="mt-2 text-base font-medium text-emerald-700 dark:text-emerald-400">
          全台約麻將，從這裡開始
        </p>
        <p className="mt-4 leading-relaxed text-zinc-600 dark:text-zinc-400">
          已可使用 LINE 登入、瀏覽招募中的牌局、開局與加入流程；列表支援篩選與關鍵字（含備註）。
        </p>
        <div
          className={`mt-8 rounded-xl border px-4 py-3 text-sm ${
            hasSupabase
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          }`}
        >
          {hasSupabase ? (
            <span>
              已偵測到 Supabase 公開環境變數；本機開發可執行{" "}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                npm run dev
              </code>
              。
            </span>
          ) : (
            <span>
              請複製 <code className="rounded bg-black/5 px-1 dark:bg-white/10">.env.example</code>{" "}
              為 <code className="rounded bg-black/5 px-1 dark:bg-white/10">.env.local</code>{" "}
              並填入 Supabase URL 與 anon key。
            </span>
          )}
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Link
            href="/games"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-zinc-300 bg-white px-5 py-3 text-base font-medium text-zinc-900 transition active:bg-zinc-100 sm:w-auto dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:active:bg-zinc-800"
          >
            瀏覽牌局
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 py-3 text-base font-medium text-white transition active:brightness-95 sm:w-auto"
            style={{ backgroundColor: "#06C755" }}
          >
            LINE 登入
          </Link>
        </div>
        <ul className="mt-8 list-inside list-disc space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            資料庫：依序執行{" "}
            <code className="rounded bg-black/5 px-1 dark:bg-white/10">
              web/supabase/migrations/
            </code>{" "}
            內 SQL（新專案由時間序從早到晚；已上線者只補尚未套用的檔案）。
          </li>
          <li>原始碼目錄：<code className="rounded bg-black/5 px-1 dark:bg-white/10">web/</code></li>
        </ul>
      </main>
    </div>
  );
}
