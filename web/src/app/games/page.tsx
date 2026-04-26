import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { GamesLocationPrefill } from "@/app/games/games-location-prefill";

type GameRow = {
  id: string;
  title: string;
  county: string;
  district: string | null;
  venue_type: string;
  starts_at: string;
  seats_total: number;
  status: string;
  base: number | null;
  unit: number | null;
  table_type: string | null;
  smoking_policy: string | null;
};

type Search = {
  county?: string;
  district?: string;
  q?: string;
  page?: string;
  base?: string;
  unit?: string;
  table_type?: string;
  smoking_policy?: string;
  status?: string;
  error?: string;
};

const PAGE_SIZE = 50;

function sanitizeIlikeTerm(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, "")
    .replace(/%/g, "")
    .replace(/_/g, "")
    .replace(/,/g, "");
}

function gamesListHref(parts: {
  county: string;
  district: string;
  q: string;
  base: number | null;
  unit: number | null;
  tableType: string;
  smokingPolicy: string;
  status: string;
  page: number;
}) {
  const p = new URLSearchParams();
  if (parts.county) p.set("county", parts.county);
  if (parts.district) p.set("district", parts.district);
  if (parts.q) p.set("q", parts.q);
  if (typeof parts.base === "number") p.set("base", String(parts.base));
  if (typeof parts.unit === "number") p.set("unit", String(parts.unit));
  if (parts.tableType) p.set("table_type", parts.tableType);
  if (parts.smokingPolicy) p.set("smoking_policy", parts.smokingPolicy);
  if (parts.status && parts.status !== "open") p.set("status", parts.status);
  if (parts.page > 1) p.set("page", String(parts.page));
  const qs = p.toString();
  return qs ? `/games?${qs}` : "/games";
}

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

function cleanString(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function parseOptionalInt(raw: unknown): number | null {
  const s = cleanString(raw);
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function smokingPolicyLabel(value: string) {
  if (value === "no_smoking") return "禁菸";
  if (value === "table_smoke") return "桌煙";
  if (value === "cigar_smoke") return "雀煙";
  if (value === "vape") return "電子煙";
  return value;
}

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await getSessionUser();
  const supabase = createAdminClient();

  const sp = await searchParams;
  const county = cleanString(sp.county);
  const district = cleanString(sp.district);
  const q = cleanString(sp.q);
  const pageRaw = parseOptionalInt(sp.page);
  const page =
    typeof pageRaw === "number" && pageRaw >= 1 ? pageRaw : 1;
  const base = parseOptionalInt(sp.base);
  const unit = parseOptionalInt(sp.unit);
  const tableType = cleanString(sp.table_type);
  const smokingPolicy = cleanString(sp.smoking_policy);
  const rawListFilter = cleanString(sp.status) || "open";
  const listFilter = ["open", "live", "past", "all"].includes(rawListFilter)
    ? rawListFilter
    : "open";

  const optionsRes = await supabase
    .from("games")
    .select("county,district")
    .order("county", { ascending: true })
    .limit(1000);

  const optionRows = (optionsRes.data ?? []) as Array<{
    county: string;
    district: string | null;
  }>;

  const counties = Array.from(
    new Set(optionRows.map((r) => r.county).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "zh-Hant"));

  const districtsForSelectedCounty = Array.from(
    new Set(
      optionRows
        .filter((r) => r.county === county)
        .map((r) => (r.district ?? "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "zh-Hant"));

  const now = new Date();
  const until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // 專案 database types 可能尚未含 v2 欄位；篩選鏈用 any 承接。
  function applyListFilters(q: unknown, keyword: string) {
    let x: any = q;
    if (county) x = x.eq("county", county);
    if (district) x = x.eq("district", district);
    const iq = sanitizeIlikeTerm(keyword);
    if (iq) {
      x = x.or(`title.ilike.%${iq}%,notes.ilike.%${iq}%`);
    }
    if (typeof base === "number") x = x.eq("base", base);
    if (typeof unit === "number") x = x.eq("unit", unit);
    if (tableType) x = x.eq("table_type", tableType);
    if (smokingPolicy) x = x.eq("smoking_policy", smokingPolicy);

    if (listFilter === "open") {
      x = x
        .gte("starts_at", now.toISOString())
        .lt("starts_at", until.toISOString());
      x = x.in("status", ["recruiting", "full"]);
    } else if (listFilter === "live") {
      x = x.eq("status", "in_progress");
      const liveSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      x = x.gte("starts_at", liveSince.toISOString());
    } else if (listFilter === "past") {
      x = x.eq("status", "finished");
      const pastSince = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      x = x
        .gte("starts_at", pastSince.toISOString())
        .lte("starts_at", now.toISOString());
    } else if (listFilter === "all") {
      const winStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      x = x
        .gte("starts_at", winStart.toISOString())
        .lt("starts_at", until.toISOString());
      x = x.neq("status", "cancelled");
    }
    return x;
  }

  let countQuery = supabase
    .from("games")
    .select("*", { count: "exact", head: true });
  countQuery = applyListFilters(countQuery, q) as typeof countQuery;
  const { count: totalCountRaw, error: countError } = await countQuery;
  const totalCount = totalCountRaw ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("games")
    .select(
      "id,title,county,district,venue_type,starts_at,seats_total,status,base,unit,table_type,smoking_policy",
    )
    .order("starts_at", { ascending: listFilter !== "past" });
  query = applyListFilters(query, q) as typeof query;
  const { data, error } = await query.range(from, to);

  const games = (data ?? []) as GameRow[];
  const listError = error ?? countError;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <GamesLocationPrefill hasCounty={Boolean(county)} />
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

        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium">篩選</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                直接改篩選條件後送出，URL 會同步更新，方便分享。
                未選縣市時若允許定位，會嘗試依你目前位置預填縣市與行政區。
              </p>
            </div>
            <Link
              href="/games"
              className="text-sm text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300"
            >
              清除篩選
            </Link>
          </div>
          <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" method="get">
            <input type="hidden" name="page" value="1" />
            <label className="space-y-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">縣市</span>
              <select
                name="county"
                defaultValue={county}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">不限</option>
                {counties.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">行政區</span>
              <select
                name="district"
                defaultValue={district}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-950"
                disabled={!county}
              >
                <option value="">
                  {county ? "不限" : "請先選縣市"}
                </option>
                {county
                  ? districtsForSelectedCounty.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))
                  : null}
              </select>
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">關鍵字</span>
              <input
                name="q"
                defaultValue={q}
                placeholder="搜尋標題或備註（例：新莊 / 100/20 / 禁菸）"
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">底（精準）</span>
              <input
                name="base"
                type="number"
                step={10}
                min={0}
                defaultValue={typeof base === "number" ? String(base) : ""}
                placeholder="例：100"
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">台（精準）</span>
              <input
                name="unit"
                type="number"
                step={10}
                min={0}
                defaultValue={typeof unit === "number" ? String(unit) : ""}
                placeholder="例：20"
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">桌型</span>
              <select
                name="table_type"
                defaultValue={tableType}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">不限</option>
                <option value="manual">手搓</option>
                <option value="electric">電動</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">抽菸</span>
              <select
                name="smoking_policy"
                defaultValue={smokingPolicy}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">不限</option>
                <option value="no_smoking">禁菸</option>
                <option value="table_smoke">桌煙</option>
                <option value="cigar_smoke">雀煙</option>
                <option value="vape">電子煙</option>
              </select>
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">顯示範圍</span>
              <select
                name="status"
                defaultValue={listFilter}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="open">招募中（含滿位候補，未來 7 天）</option>
                <option value="live">開打中（近 30 天內開局）</option>
                <option value="past">已結束（近一年內）</option>
                <option value="all">全部（近 90 天～未來 7 天，不含已取消）</option>
              </select>
            </label>
            <div className="sm:col-span-2 flex items-center gap-3">
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500"
              >
                套用篩選
              </button>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                每頁 {PAGE_SIZE} 筆，依開始時間排序；超過可翻頁。
              </p>
            </div>
          </form>
        </div>

        {listError ? (
          <p
            className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            讀取牌局失敗：{listError.message}
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
                    <Link
                      href={`/games/${g.id}`}
                      className="text-base font-semibold underline-offset-2 hover:underline"
                    >
                      {g.title}
                    </Link>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {g.county}
                      {g.district ? ` · ${g.district}` : ""} · {g.venue_type}
                    </p>
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                      開始時間：{formatStartsAt(g.starts_at)}
                    </p>
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                      規則：
                      {typeof g.base === "number" ? ` 底 ${g.base}` : " 底 -"}
                      {typeof g.unit === "number" ? ` / 台 ${g.unit}` : " / 台 -"}
                      {g.table_type ? ` · ${g.table_type}` : ""}
                      {g.smoking_policy ? ` · ${smokingPolicyLabel(g.smoking_policy)}` : ""}
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

        {totalPages > 1 ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-400">
            {safePage > 1 ? (
              <Link
                href={gamesListHref({
                  county,
                  district,
                  q,
                  base,
                  unit,
                  tableType,
                  smokingPolicy,
                  status: listFilter,
                  page: safePage - 1,
                })}
                className="rounded-xl border border-zinc-300 px-4 py-2 font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                上一頁
              </Link>
            ) : (
              <span className="invisible w-[1px] sm:w-auto" aria-hidden />
            )}
            <span className="tabular-nums">
              第 {safePage} / {totalPages} 頁（共 {totalCount} 筆）
            </span>
            {safePage < totalPages ? (
              <Link
                href={gamesListHref({
                  county,
                  district,
                  q,
                  base,
                  unit,
                  tableType,
                  smokingPolicy,
                  status: listFilter,
                  page: safePage + 1,
                })}
                className="rounded-xl border border-zinc-300 px-4 py-2 font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                下一頁
              </Link>
            ) : (
              <span className="invisible w-[1px] sm:w-auto" aria-hidden />
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

