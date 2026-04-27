import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { GamesLocationPrefill } from "@/app/games/games-location-prefill";
import { mahjongVariantLabel } from "@/lib/games/mahjong-variant";
import { JIANG_COUNT_OPTIONS } from "@/lib/games/jiang-count";

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
  mahjong_variant: string | null;
  jiang_count: number | null;
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
  mahjong_variant?: string;
  jiang_count?: string;
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
  mahjongVariant: string;
  jiangCount: number | null;
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
  if (parts.mahjongVariant) p.set("mahjong_variant", parts.mahjongVariant);
  if (typeof parts.jiangCount === "number")
    p.set("jiang_count", String(parts.jiangCount));
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

/** 列表僅含 recruiting / full，仍給使用者可讀標籤 */
function recruitListStatusLabel(status: string) {
  if (status === "recruiting") return "招募中";
  if (status === "full") return "滿位（可候補）";
  return status;
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
  const mahjongVariant = cleanString(sp.mahjong_variant);
  const jiangCount = parseOptionalInt(sp.jiang_count);

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
    if (mahjongVariant) x = x.eq("mahjong_variant", mahjongVariant);
    if (typeof jiangCount === "number") x = x.eq("jiang_count", jiangCount);

    // 只顯示仍「在約人」的局；主辦按「開打」後為 in_progress，即不會出現在列表
    x = x
      .gte("starts_at", now.toISOString())
      .lt("starts_at", until.toISOString());
    x = x.in("status", ["recruiting", "full"]);
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
      "id,title,county,district,venue_type,starts_at,seats_total,status,base,unit,table_type,smoking_policy,mahjong_variant,jiang_count",
    )
    .order("starts_at", { ascending: true });
  query = applyListFilters(query, q) as typeof query;
  const { data, error } = await query.range(from, to);

  const games = (data ?? []) as GameRow[];
  const listError = error ?? countError;

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <GamesLocationPrefill hasCounty={Boolean(county)} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:max-w-3xl sm:px-5 sm:pt-6">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              牌局列表
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
              招募中的局
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              僅列出仍在約人的局（招募中或滿位候補）。主辦按下「開打」後，該局會從此列表消失；已參與者可從連結或紀錄進入詳情。
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-800 transition active:bg-zinc-100 sm:min-h-0 sm:py-2.5 sm:text-sm dark:border-zinc-700 dark:text-zinc-100 dark:active:bg-zinc-800"
            >
              回首頁
            </Link>
            {session ? (
              <Link
                href="/games/new"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-base font-medium text-white shadow-sm transition active:bg-emerald-700 sm:flex-initial sm:min-h-0 sm:py-2.5 sm:text-sm"
              >
                建立新局
              </Link>
            ) : (
              <Link
                href="/login?next=/games/new"
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-base font-medium text-white shadow-sm transition active:bg-emerald-700 sm:flex-initial sm:min-h-0 sm:py-2.5 sm:text-sm"
              >
                登入後建局
              </Link>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:mt-8 sm:p-5">
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
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">桌型</span>
              <select
                name="table_type"
                defaultValue={tableType}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">不限</option>
                <option value="no_smoking">禁菸</option>
                <option value="table_smoke">桌煙</option>
                <option value="cigar_smoke">雀煙</option>
                <option value="vape">電子煙</option>
              </select>
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">類型</span>
              <select
                name="mahjong_variant"
                defaultValue={mahjongVariant}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">不限</option>
                <option value="zheng_hua_zheng_zi">正花正字</option>
                <option value="jian_hua_jian_zi">見花見字</option>
                <option value="american">美麻</option>
                <option value="riichi">日麻</option>
                <option value="hong_kong">港麻</option>
              </select>
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">將</span>
              <select
                name="jiang_count"
                defaultValue={jiangCount === null ? "" : String(jiangCount)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">不限</option>
                {JIANG_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2 flex items-center gap-3">
              <button
                type="submit"
                className="min-h-11 rounded-xl bg-emerald-600 px-5 py-3 text-base font-medium text-white shadow-sm transition active:bg-emerald-700 sm:min-h-0 sm:text-sm"
              >
                套用篩選
              </button>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                僅未來 7 天內、狀態為招募中或滿位候補；每頁 {PAGE_SIZE} 筆，可翻頁。
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

        <div className="mt-6 divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 sm:mt-8">
          {games.length === 0 ? (
            <div className="p-5 text-sm text-zinc-600 dark:text-zinc-300 sm:p-6">
              目前還沒有牌局。{session ? "你可以先建立第一局。" : "請先登入後建局。"}
            </div>
          ) : (
            games.map((g) => (
              <div key={g.id} className="p-4 active:bg-zinc-50 sm:p-6 dark:active:bg-zinc-800/50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/games/${g.id}`}
                      className="text-base font-semibold underline-offset-2 active:text-emerald-700 sm:hover:underline dark:active:text-emerald-400"
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
                      {g.mahjong_variant
                        ? ` · ${mahjongVariantLabel(g.mahjong_variant)}`
                        : ""}
                      {typeof g.jiang_count === "number"
                        ? ` · ${g.jiang_count}將`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                    <p>座位：{g.seats_total}</p>
                    <p>狀態：{recruitListStatusLabel(g.status)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 ? (
          <div className="mt-6 flex flex-col items-stretch gap-3 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between dark:text-zinc-400">
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
                  mahjongVariant,
                  jiangCount,
                  page: safePage - 1,
                })}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 font-medium text-zinc-800 transition active:bg-zinc-100 sm:min-h-0 sm:py-2 dark:border-zinc-700 dark:text-zinc-100 dark:active:bg-zinc-800"
              >
                上一頁
              </Link>
            ) : (
              <span className="hidden min-h-11 sm:block sm:min-h-0" aria-hidden />
            )}
            <span className="order-first text-center tabular-nums sm:order-none">
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
                  mahjongVariant,
                  jiangCount,
                  page: safePage + 1,
                })}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 px-4 font-medium text-zinc-800 transition active:bg-zinc-100 sm:min-h-0 sm:py-2 dark:border-zinc-700 dark:text-zinc-100 dark:active:bg-zinc-800"
              >
                下一頁
              </Link>
            ) : (
              <span className="hidden min-h-11 sm:block sm:min-h-0" aria-hidden />
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

