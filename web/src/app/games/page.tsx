import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";

type GameRow = {
  id: string;
  title: string;
  county: string;
  district: string | null;
  venue_type: string;
  starts_at: string;
  seats_total: number;
  status: string;
};

function formatStartsAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function GamesPage() {
  const session = await getSessionUser();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("games")
    .select(
      "id,title,county,district,venue_type,starts_at,seats_total,status",
    )
    .order("starts_at", { ascending: true })
    .limit(50);

  const games = (data ?? []) as GameRow[];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              牌局列表
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              招募中的局
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              目前先做 MVP：建立一局並在列表顯示。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              回首頁
            </Link>
            {session ? (
              <Link
                href="/games/new"
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500"
              >
                建立新局
              </Link>
            ) : (
              <Link
                href="/login?next=/games/new"
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500"
              >
                登入後建局
              </Link>
            )}
          </div>
        </div>

        {error ? (
          <p
            className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            讀取牌局失敗：{error.message}
          </p>
        ) : null}

        <div className="mt-8 divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {games.length === 0 ? (
            <div className="p-6 text-sm text-zinc-600 dark:text-zinc-300">
              目前還沒有牌局。{session ? "你可以先建立第一局。" : "請先登入後建局。"}
            </div>
          ) : (
            games.map((g) => (
              <div key={g.id} className="p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-base font-semibold">{g.title}</p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {g.county}
                      {g.district ? ` · ${g.district}` : ""} · {g.venue_type}
                    </p>
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                      開始時間：{formatStartsAt(g.starts_at)}
                    </p>
                  </div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">
                    <p>座位：{g.seats_total}</p>
                    <p>狀態：{g.status}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

