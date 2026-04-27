import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { parseMahjongVariant } from "@/lib/games/mahjong-variant";
import { JIANG_COUNT_OPTIONS, parseJiangCountForm } from "@/lib/games/jiang-count";

function getString(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function getInt(formData: FormData, key: string): number | null {
  const raw = getString(formData, key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseDatetimeLocal(value: string): Date | null {
  // input[type=datetime-local] 會是 "YYYY-MM-DDTHH:mm"
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function createGameAction(formData: FormData) {
  "use server";

  const session = await getSessionUser();
  if (!session) {
    redirect(
      `/login?next=/games/new&error=${encodeURIComponent("請先重新登入，完成帳號初始化")}`,
    );
  }

  const title = getString(formData, "title");
  const county = getString(formData, "county");
  const district = getString(formData, "district");
  const venueType = getString(formData, "venue_type");
  const startsAtRaw = getString(formData, "starts_at");
  const seatsTotal = getInt(formData, "seats_total") ?? 4;
  const notes = getString(formData, "notes");
  const hostContact = getString(formData, "host_contact");
  const addressDetail = getString(formData, "address_detail");
  const next = safeNextPath(getString(formData, "next"));

  const base = getInt(formData, "base");
  const unit = getInt(formData, "unit");
  const tableType = getString(formData, "table_type") || null;
  const smokingPolicy = getString(formData, "smoking_policy") || null;
  const mahjongVariant = parseMahjongVariant(getString(formData, "mahjong_variant"));
  const jiang_count = parseJiangCountForm(getString(formData, "jiang_count"));

  const startsAt = parseDatetimeLocal(startsAtRaw);

  if (!title || !county || !venueType || !startsAt) {
    redirect(
      `/games/new?error=${encodeURIComponent("請填寫：標題、縣市、場地類型、開始時間")}`,
    );
  }

  if (seatsTotal < 2 || seatsTotal > 8) {
    redirect(
      `/games/new?error=${encodeURIComponent("座位數請填 2～8（預設 4）")}`,
    );
  }

  const supabase = createAdminClient();

  const insertGame = await supabase
    .from("games")
    .insert({
      host_id: session.profileId,
      title,
      county,
      district: district || null,
      venue_type: venueType,
      starts_at: startsAt.toISOString(),
      seats_total: seatsTotal,
      notes: notes || null,
      status: "recruiting",
      base,
      unit,
      table_type: tableType,
      smoking_policy: smokingPolicy,
      mahjong_variant: mahjongVariant,
      jiang_count,
    })
    .select("id")
    .single();

  if (insertGame.error) {
    redirect(
      `/games/new?error=${encodeURIComponent(`建立牌局失敗：${insertGame.error.message}`)}`,
    );
  }

  const gameId = insertGame.data.id as string;

  if (addressDetail || hostContact) {
    const secretRes = await supabase.from("game_secrets").insert({
      game_id: gameId,
      address_detail: addressDetail || null,
      host_contact: hostContact || null,
    });
    if (secretRes.error) {
      redirect(
        `/games/new?error=${encodeURIComponent(`寫入聯絡資訊失敗：${secretRes.error.message}`)}`,
      );
    }
  }

  const participantRes = await supabase.from("game_participants").insert({
    game_id: gameId,
    user_id: session.profileId,
    role: "host",
    status: "confirmed",
  });
  if (participantRes.error) {
    redirect(
      `/games/new?error=${encodeURIComponent(`建立主辦者參與紀錄失敗：${participantRes.error.message}`)}`,
    );
  }

  redirect(next || "/games");
}

export default async function NewGamePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const errorMessage = typeof params.error === "string" ? params.error : null;
  const nextPath = safeNextPath(typeof params.next === "string" ? params.next : "/games");
  const session = await getSessionUser();

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-[max(7.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:py-10">
        <Link
          href="/games"
          className="inline-flex min-h-10 items-center text-base text-zinc-500 transition active:text-zinc-800 dark:active:text-zinc-200"
        >
          ← 回牌局列表
        </Link>

        <h1 className="mt-4 text-xl font-semibold tracking-tight sm:mt-6 sm:text-2xl">
          建立新局
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          MVP 先收集最小欄位。地址與聯絡方式僅在主辦與已確認成員查看牌局時顯示。
        </p>

        {!session ? (
          <p
            className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
            role="status"
          >
            你尚未登入，請先{" "}
            <Link className="underline" href={`/login?next=/games/new`}>
              登入
            </Link>
            。
          </p>
        ) : null}

        {errorMessage ? (
          <p
            className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <form action={createGameAction} className="mt-8 space-y-6">
          <input type="hidden" name="next" value={nextPath} />

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-medium">基本資訊</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">標題</span>
                <input
                  name="title"
                  required
                  placeholder="例：新莊友善小底 100/20"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  用一句話讓人秒懂：地點 + 規則（底/台）+ 其他重點（禁菸/手搓等）。
                </p>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">縣市</span>
                <input
                  name="county"
                  required
                  placeholder="例：新北市"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">行政區（選填）</span>
                <input
                  name="district"
                  placeholder="例：新莊區"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">場地類型</span>
                <select
                  name="venue_type"
                  required
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  defaultValue=""
                >
                  <option value="" disabled>
                    請選擇
                  </option>
                  <option value="home">家裡</option>
                  <option value="club">麻將館</option>
                  <option value="rented">租借場地</option>
                  <option value="other">其他</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">開始時間</span>
                <input
                  name="starts_at"
                  required
                  type="datetime-local"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">座位數</span>
                <input
                  name="seats_total"
                  type="number"
                  min={2}
                  max={8}
                  defaultValue={4}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  常見 4 人；也可填 2～8（依你的局規則）。
                </p>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-medium">規則偏好（讓人更好配對）</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">底（選填）</span>
                <input
                  name="base"
                  type="number"
                  min={0}
                  step={10}
                  placeholder="例：100"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">台（選填）</span>
                <input
                  name="unit"
                  type="number"
                  min={0}
                  step={10}
                  placeholder="例：20"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">桌型</span>
                <select
                  name="table_type"
                  defaultValue=""
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
                  defaultValue=""
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
                  defaultValue=""
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="">不限</option>
                  <option value="zheng_hua_zheng_zi">正花正字</option>
                  <option value="jian_hua_jian_zi">見花見字</option>
                  <option value="american">美麻</option>
                  <option value="riichi">日麻</option>
                  <option value="hong_kong">港麻</option>
                </select>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  不確定就選「不限」，讓更多人看得到你的局。
                </p>
              </label>
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">將</span>
                <select
                  name="jiang_count"
                  defaultValue=""
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="">不限</option>
                  {JIANG_COUNT_OPTIONS.map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  手機點一下會出現系統滾輪；不確定就選「不限」。
                </p>
              </label>
            </div>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-medium">備註（選填）</span>
            <textarea
              name="notes"
              rows={4}
              placeholder="例：禁菸、電動桌、小底、希望準時"
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-medium">聯絡資訊（僅主辦/已確認成員可見）</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  地址（選填，僅主辦/已確認成員可見）
                </span>
                <input
                  name="address_detail"
                  placeholder="例：新北市新莊區 XX 路 XX 號（確認後才會顯示）"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  聯絡方式（選填）
                </span>
                <input
                  name="host_contact"
                  placeholder="例：LINE ID / 電話 / IG"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-emerald-400 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
            </div>
          </div>
        </form>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/75">
        <div className="mx-auto w-full max-w-xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              formAction={createGameAction}
              type="submit"
              disabled={!session}
              className="min-h-12 flex-1 rounded-xl bg-emerald-600 px-5 py-3 text-base font-medium text-white shadow-sm transition active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:text-sm"
            >
              送出建立
            </button>
            <Link
              href="/games"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-zinc-300 px-5 py-3 text-base font-medium text-zinc-800 transition active:bg-zinc-100 sm:min-h-0 sm:text-sm dark:border-zinc-700 dark:text-zinc-100 dark:active:bg-zinc-800"
            >
              取消
            </Link>
          </div>
          {!session ? (
            <p className="mt-2 text-xs text-amber-900 dark:text-amber-100">
              你尚未登入，請先登入後才能送出建立。
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

