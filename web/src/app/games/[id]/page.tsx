import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { GameResultsSection } from "@/app/games/[id]/game-results-section";
import { mahjongVariantLabel } from "@/lib/games/mahjong-variant";

type Game = {
  id: string;
  host_id: string;
  title: string;
  county: string;
  district: string | null;
  venue_type: string;
  starts_at: string;
  seats_total: number;
  status: string;
  notes: string | null;
  mahjong_variant: string | null;
  jiang_count: number | null;
};

type GameSecrets = {
  address_detail: string | null;
  host_contact: string | null;
};

type Participant = {
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  profiles: {
    display_name: string;
    avatar_url: string | null;
  } | null;
};

type ParticipantRow = Omit<Participant, "profiles"> & {
  profiles:
    | {
        display_name: string;
        avatar_url: string | null;
      }
    | {
        display_name: string;
        avatar_url: string | null;
      }[]
    | null;
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

function gameStatusZh(status: string) {
  const m: Record<string, string> = {
    recruiting: "招募中",
    full: "滿位（候補可排）",
    in_progress: "開打中",
    finished: "已結束",
    cancelled: "已取消",
  };
  return m[status] ?? status;
}

async function getConfirmedCount(gameId: string) {
  const supabase = createAdminClient();
  const countRes = await supabase
    .from("game_participants")
    .select("id", { count: "exact", head: true })
    .eq("game_id", gameId)
    .in("role", ["host", "player"])
    .eq("status", "confirmed");

  return countRes.count ?? 0;
}

async function promoteWaitlistIfPossible(gameId: string) {
  const supabase = createAdminClient();
  const gameRes = await supabase
    .from("games")
    .select("status,seats_total")
    .eq("id", gameId)
    .single();
  if (gameRes.error) return;

  const status = gameRes.data.status as string;
  if (["in_progress", "finished", "cancelled"].includes(status)) return;

  const seatsTotal = gameRes.data.seats_total as number;
  const confirmed = await getConfirmedCount(gameId);
  if (confirmed >= seatsTotal) return;

  // 只遞補一位（避免複雜鎖）；多個空位可透過多次觸發逐步補滿
  const nextWaitlist = await supabase
    .from("game_participants")
    .select("user_id")
    .eq("game_id", gameId)
    .eq("role", "waitlist")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const userId = nextWaitlist.data?.user_id as string | undefined;
  if (!userId) return;

  await supabase
    .from("game_participants")
    .update({ role: "player", status: "pending" })
    .eq("game_id", gameId)
    .eq("user_id", userId)
    .eq("role", "waitlist")
    .eq("status", "pending");
}

async function recomputeGameStatus(gameId: string) {
  const supabase = createAdminClient();
  const gameRes = await supabase
    .from("games")
    .select("status,seats_total")
    .eq("id", gameId)
    .single();
  if (gameRes.error) return;

  const currentStatus = gameRes.data.status as string;
  if (["in_progress", "finished", "cancelled"].includes(currentStatus)) return;

  const seatsTotal = gameRes.data.seats_total as number;
  const confirmed = await getConfirmedCount(gameId);
  const nextStatus = confirmed >= seatsTotal ? "full" : "recruiting";
  if (nextStatus !== currentStatus) {
    await supabase.from("games").update({ status: nextStatus }).eq("id", gameId);
  }
}

async function requestJoinAction(formData: FormData) {
  "use server";
  const session = await getSessionUser();
  const gameId = String(formData.get("game_id") ?? "");
  if (!session) redirect(`/login?next=/games/${encodeURIComponent(gameId)}`);
  if (!gameId) redirect("/games");

  const supabase = createAdminClient();
  const gameRes = await supabase
    .from("games")
    .select("id,host_id,status,seats_total")
    .eq("id", gameId)
    .single();
  if (gameRes.error) redirect(`/games?error=${encodeURIComponent(gameRes.error.message)}`);
  if (gameRes.data.host_id === session.profileId) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("你是主辦者，不需要加入")}`);
  }
  const status = gameRes.data.status as string;
  if (["cancelled", "finished", "in_progress"].includes(status)) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent("此局已開打、結束或取消，無法再加入")}`,
    );
  }

  const existing = await supabase
    .from("game_participants")
    .select("role,status")
    .eq("game_id", gameId)
    .eq("user_id", session.profileId)
    .maybeSingle();

  if (existing.data && !["declined", "removed"].includes(existing.data.status as string)) {
    redirect(`/games/${gameId}`);
  }

  const confirmed = await getConfirmedCount(gameId);
  const seatsTotal = gameRes.data.seats_total as number;
  const role = confirmed >= seatsTotal || status === "full" ? "waitlist" : "player";

  const upsertRes = await supabase.from("game_participants").upsert(
    {
      game_id: gameId,
      user_id: session.profileId,
      role,
      status: "pending",
    },
    { onConflict: "game_id,user_id" },
  );

  if (upsertRes.error) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent(`加入失敗：${upsertRes.error.message}`)}`,
    );
  }

  await recomputeGameStatus(gameId);
  redirect(`/games/${gameId}`);
}

async function leaveGameAction(formData: FormData) {
  "use server";
  const session = await getSessionUser();
  const gameId = String(formData.get("game_id") ?? "");
  if (!session) redirect(`/login?next=/games/${encodeURIComponent(gameId)}`);
  if (!gameId) redirect("/games");

  const supabase = createAdminClient();
  const gameRes = await supabase
    .from("games")
    .select("host_id")
    .eq("id", gameId)
    .single();
  if (!gameRes.error && gameRes.data.host_id === session.profileId) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("主辦者不可退出；請改為取消牌局")}`);
  }

  const delRes = await supabase
    .from("game_participants")
    .delete()
    .eq("game_id", gameId)
    .eq("user_id", session.profileId);

  if (delRes.error) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent(`退出失敗：${delRes.error.message}`)}`,
    );
  }

  await promoteWaitlistIfPossible(gameId);
  await recomputeGameStatus(gameId);
  redirect(`/games/${gameId}`);
}

async function hostConfirmAction(formData: FormData) {
  "use server";
  const session = await getSessionUser();
  const gameId = String(formData.get("game_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!session) redirect(`/login?next=/games/${encodeURIComponent(gameId)}`);
  if (!gameId || !userId) redirect("/games");

  const supabase = createAdminClient();
  const gameRes = await supabase
    .from("games")
    .select("host_id,status,seats_total")
    .eq("id", gameId)
    .single();
  if (gameRes.error) redirect(`/games/${gameId}?error=${encodeURIComponent(gameRes.error.message)}`);
  if (gameRes.data.host_id !== session.profileId) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("只有主辦者可以確認成員")}`);
  }

  const status = gameRes.data.status as string;
  if (["cancelled", "finished", "in_progress"].includes(status)) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent("此局已開打、結束或取消，無法再確認成員")}`,
    );
  }

  const seatsTotal = gameRes.data.seats_total as number;
  const confirmed = await getConfirmedCount(gameId);
  if (confirmed >= seatsTotal) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("已滿位，請先移除成員或調整座位數")}`);
  }

  const updRes = await supabase
    .from("game_participants")
    .update({ status: "confirmed" })
    .eq("game_id", gameId)
    .eq("user_id", userId)
    .eq("role", "player");

  if (updRes.error) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent(`確認失敗：${updRes.error.message}`)}`,
    );
  }

  await recomputeGameStatus(gameId);
  redirect(`/games/${gameId}`);
}

async function hostDeclineAction(formData: FormData) {
  "use server";
  const session = await getSessionUser();
  const gameId = String(formData.get("game_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!session) redirect(`/login?next=/games/${encodeURIComponent(gameId)}`);
  if (!gameId || !userId) redirect("/games");

  const supabase = createAdminClient();
  const gameRes = await supabase
    .from("games")
    .select("host_id,status")
    .eq("id", gameId)
    .single();
  if (gameRes.error) redirect(`/games/${gameId}?error=${encodeURIComponent(gameRes.error.message)}`);
  if (gameRes.data.host_id !== session.profileId) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("只有主辦者可以拒絕申請")}`);
  }
  const status = gameRes.data.status as string;
  if (["cancelled", "finished"].includes(status)) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("此局已結束或取消")}`);
  }

  const upd = await supabase
    .from("game_participants")
    .update({ status: "declined" })
    .eq("game_id", gameId)
    .eq("user_id", userId)
    .in("role", ["player", "waitlist"]);

  if (upd.error) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent(`拒絕失敗：${upd.error.message}`)}`,
    );
  }

  redirect(`/games/${gameId}`);
}

async function hostRemoveAction(formData: FormData) {
  "use server";
  const session = await getSessionUser();
  const gameId = String(formData.get("game_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!session) redirect(`/login?next=/games/${encodeURIComponent(gameId)}`);
  if (!gameId || !userId) redirect("/games");

  const supabase = createAdminClient();
  const gameRes = await supabase
    .from("games")
    .select("host_id,status")
    .eq("id", gameId)
    .single();
  if (gameRes.error) redirect(`/games/${gameId}?error=${encodeURIComponent(gameRes.error.message)}`);
  if (gameRes.data.host_id !== session.profileId) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("只有主辦者可以移除成員")}`);
  }
  if (userId === session.profileId) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("不可移除自己；請改為取消牌局")}`);
  }

  const status = gameRes.data.status as string;
  if (["cancelled", "finished"].includes(status)) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("此局已結束或取消")}`);
  }

  const upd = await supabase
    .from("game_participants")
    .update({ status: "removed" })
    .eq("game_id", gameId)
    .eq("user_id", userId);

  if (upd.error) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent(`移除失敗：${upd.error.message}`)}`,
    );
  }

  await promoteWaitlistIfPossible(gameId);
  await recomputeGameStatus(gameId);
  redirect(`/games/${gameId}`);
}

async function hostCancelGameAction(formData: FormData) {
  "use server";
  const session = await getSessionUser();
  const gameId = String(formData.get("game_id") ?? "");
  if (!session) redirect(`/login?next=/games/${encodeURIComponent(gameId)}`);
  if (!gameId) redirect("/games");

  const supabase = createAdminClient();
  const gameRes = await supabase
    .from("games")
    .select("host_id,status")
    .eq("id", gameId)
    .single();
  if (gameRes.error) {
    redirect(`/games/${gameId}?error=${encodeURIComponent(gameRes.error.message)}`);
  }
  if (gameRes.data.host_id !== session.profileId) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("只有主辦者可以取消牌局")}`);
  }

  const status = gameRes.data.status as string;
  if (["finished"].includes(status)) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("已結束的牌局不可取消")}`);
  }

  const upd = await supabase
    .from("games")
    .update({ status: "cancelled" })
    .eq("id", gameId);

  if (upd.error) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent(`取消失敗：${upd.error.message}`)}`,
    );
  }

  redirect(`/games/${gameId}`);
}

async function hostMarkInProgressAction(formData: FormData) {
  "use server";
  const session = await getSessionUser();
  const gameId = String(formData.get("game_id") ?? "");
  if (!session) redirect(`/login?next=/games/${encodeURIComponent(gameId)}`);
  if (!gameId) redirect("/games");

  const supabase = createAdminClient();
  const gameRes = await supabase
    .from("games")
    .select("host_id,status")
    .eq("id", gameId)
    .single();
  if (gameRes.error) {
    redirect(`/games/${gameId}?error=${encodeURIComponent(gameRes.error.message)}`);
  }
  if (gameRes.data.host_id !== session.profileId) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("只有主辦者可以標記開打")}`);
  }
  const st = gameRes.data.status as string;
  if (!["recruiting", "full"].includes(st)) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent("只有在招募中或滿位時才能開始打牌")}`,
    );
  }

  const upd = await supabase
    .from("games")
    .update({ status: "in_progress" })
    .eq("id", gameId);
  if (upd.error) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent(`更新失敗：${upd.error.message}`)}`,
    );
  }
  redirect(`/games/${gameId}`);
}

async function hostMarkFinishedAction(formData: FormData) {
  "use server";
  const session = await getSessionUser();
  const gameId = String(formData.get("game_id") ?? "");
  if (!session) redirect(`/login?next=/games/${encodeURIComponent(gameId)}`);
  if (!gameId) redirect("/games");

  const supabase = createAdminClient();
  const gameRes = await supabase
    .from("games")
    .select("host_id,status")
    .eq("id", gameId)
    .single();
  if (gameRes.error) {
    redirect(`/games/${gameId}?error=${encodeURIComponent(gameRes.error.message)}`);
  }
  if (gameRes.data.host_id !== session.profileId) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("只有主辦者可以標記結束")}`);
  }
  const st = gameRes.data.status as string;
  if (st !== "in_progress") {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent("只有在開打中才能標記結束牌局")}`,
    );
  }

  const upd = await supabase
    .from("games")
    .update({ status: "finished" })
    .eq("id", gameId);
  if (upd.error) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent(`更新失敗：${upd.error.message}`)}`,
    );
  }
  redirect(`/games/${gameId}`);
}

export default async function GameDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const errorMessage = typeof sp.error === "string" ? sp.error : null;

  const session = await getSessionUser();
  const supabase = createAdminClient();

  const gameRes = await supabase
    .from("games")
    .select(
      "id,host_id,title,county,district,venue_type,starts_at,seats_total,status,notes,mahjong_variant,jiang_count",
    )
    .eq("id", id)
    .single();
  if (gameRes.error) return notFound();
  const game = gameRes.data as Game;

  const partsRes = await supabase
    .from("game_participants")
    .select("user_id,role,status,created_at,profiles(display_name,avatar_url)")
    .eq("game_id", id)
    .order("created_at", { ascending: true });

  const participants = ((partsRes.data ?? []) as ParticipantRow[]).map((p) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles ?? null,
  })) as Participant[];

  const me = session?.profileId ?? null;
  const isHost = Boolean(me && me === game.host_id);
  const myRow = me ? participants.find((p) => p.user_id === me) : null;

  const confirmed = participants.filter(
    (p) => (p.role === "host" || p.role === "player") && p.status === "confirmed",
  );
  const pending = participants.filter((p) => p.role === "player" && p.status === "pending");
  const waitlist = participants.filter(
    (p) => p.role === "waitlist" && p.status === "pending",
  );

  const canSeeSecrets =
    isHost || Boolean(myRow && myRow.status === "confirmed" && myRow.role !== "waitlist");

  const secretsRes = canSeeSecrets
    ? await supabase
        .from("game_secrets")
        .select("address_detail,host_contact")
        .eq("game_id", id)
        .maybeSingle()
    : null;
  const secrets = (secretsRes?.data ?? null) as GameSecrets | null;

  const canRequestJoin = ["recruiting", "full"].includes(game.status);

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:max-w-3xl sm:px-5 sm:pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1">
            <Link
              href="/games"
              className="inline-flex min-h-10 items-center text-base text-zinc-500 transition active:text-zinc-800 dark:active:text-zinc-200"
            >
              ← 回牌局列表
            </Link>
            <h1 className="mt-3 break-words text-xl font-semibold tracking-tight sm:mt-4 sm:text-2xl">
              {game.title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {game.county}
              {game.district ? ` · ${game.district}` : ""} · {game.venue_type}
              {game.mahjong_variant
                ? ` · ${mahjongVariantLabel(game.mahjong_variant)}`
                : ""}
              {typeof game.jiang_count === "number"
                ? ` · ${game.jiang_count}將`
                : ""}{" "}
              · {formatStartsAt(game.starts_at)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400 sm:text-right">
            <p>
              座位：{confirmed.length}/{game.seats_total}
            </p>
            <p>狀態：{gameStatusZh(game.status)}</p>
          </div>
        </div>

        {errorMessage ? (
          <p
            className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          {!session ? (
            canRequestJoin ? (
              <Link
                href={`/login?next=/games/${encodeURIComponent(game.id)}`}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-base font-medium text-white shadow-sm transition active:bg-emerald-700 sm:min-h-0 sm:text-sm"
              >
                登入後加入
              </Link>
            ) : (
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                此局目前不開放加入申請
              </span>
            )
          ) : isHost ? (
            <>
              {["recruiting", "full"].includes(game.status) ? (
                <form action={hostMarkInProgressAction} className="w-full sm:w-auto">
                  <input type="hidden" name="game_id" value={game.id} />
                  <button
                    type="submit"
                    className="min-h-12 w-full rounded-xl bg-emerald-600 px-5 py-3 text-base font-medium text-white shadow-sm transition active:bg-emerald-700 sm:min-h-0 sm:w-auto sm:text-sm"
                  >
                    開始打牌
                  </button>
                </form>
              ) : null}
              {game.status === "in_progress" ? (
                <form action={hostMarkFinishedAction} className="w-full sm:w-auto">
                  <input type="hidden" name="game_id" value={game.id} />
                  <button
                    type="submit"
                    className="min-h-12 w-full rounded-xl bg-emerald-600 px-5 py-3 text-base font-medium text-white shadow-sm transition active:bg-emerald-700 sm:min-h-0 sm:w-auto sm:text-sm"
                  >
                    結束牌局
                  </button>
                </form>
              ) : null}
              {game.status !== "finished" && game.status !== "cancelled" ? (
                <form action={hostCancelGameAction} className="w-full sm:w-auto">
                  <input type="hidden" name="game_id" value={game.id} />
                  <button
                    type="submit"
                    className="min-h-12 w-full rounded-xl border border-zinc-300 px-5 py-3 text-base font-medium text-zinc-800 transition active:bg-zinc-100 sm:min-h-0 sm:w-auto sm:text-sm dark:border-zinc-700 dark:text-zinc-100 dark:active:bg-zinc-800"
                  >
                    取消牌局
                  </button>
                </form>
              ) : null}
            </>
          ) : myRow ? (
            <form action={leaveGameAction} className="w-full sm:w-auto">
              <input type="hidden" name="game_id" value={game.id} />
              <button
                type="submit"
                className="min-h-12 w-full rounded-xl border border-zinc-300 px-5 py-3 text-base font-medium text-zinc-800 transition active:bg-zinc-100 sm:min-h-0 sm:w-auto sm:text-sm dark:border-zinc-700 dark:text-zinc-100 dark:active:bg-zinc-800"
              >
                {myRow.role === "waitlist" ? "退出候補" : "退出牌局"}
              </button>
            </form>
          ) : canRequestJoin ? (
            <form action={requestJoinAction} className="w-full sm:w-auto">
              <input type="hidden" name="game_id" value={game.id} />
              <button
                type="submit"
                className="min-h-12 w-full rounded-xl bg-emerald-600 px-5 py-3 text-base font-medium text-white shadow-sm transition active:bg-emerald-700 sm:min-h-0 sm:w-auto sm:text-sm"
              >
                申請加入
              </button>
            </form>
          ) : (
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              此局目前不開放加入申請
            </span>
          )}

          {isHost ? (
            <span className="text-sm text-emerald-700 dark:text-emerald-400">
              你是主辦者
            </span>
          ) : myRow?.role === "waitlist" ? (
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              你目前在候補名單
            </span>
          ) : myRow?.status === "pending" ? (
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              等待主辦確認
            </span>
          ) : null}
        </div>

        {canSeeSecrets && (secrets?.host_contact || secrets?.address_detail) ? (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 sm:p-6">
            <p className="font-medium">聯絡與地址（僅限已確認成員）</p>
            <div className="mt-3 space-y-2">
              {secrets.host_contact ? (
                <p>
                  <span className="text-zinc-500 dark:text-zinc-400">聯絡：</span>
                  {secrets.host_contact}
                </p>
              ) : null}
              {secrets.address_detail ? (
                <p>
                  <span className="text-zinc-500 dark:text-zinc-400">地址：</span>
                  {secrets.address_detail}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {game.notes ? (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 sm:p-6">
            <p className="font-medium">備註</p>
            <p className="mt-2 whitespace-pre-wrap">{game.notes}</p>
          </div>
        ) : null}

        {game.status === "finished" ? (
          <GameResultsSection
            gameId={game.id}
            gameStatus={game.status}
            sessionUserId={me}
            confirmedPlayers={confirmed.map((p) => ({
              user_id: p.user_id,
              display_name: p.profiles?.display_name ?? p.user_id,
              role: p.role,
            }))}
          />
        ) : null}

        <div className="mt-8 grid gap-4 sm:mt-10 sm:gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
            <p className="text-sm font-medium">已確認成員</p>
            <ul className="mt-4 space-y-3 text-sm">
              {confirmed.length === 0 ? (
                <li className="text-zinc-600 dark:text-zinc-400">尚無</li>
              ) : (
                confirmed.map((p) => (
                  <li
                    key={p.user_id}
                    className="flex flex-col gap-2 border-b border-zinc-100 pb-3 last:border-0 last:pb-0 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:border-0 sm:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-9 w-9 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {p.profiles?.display_name ?? p.user_id}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {p.role === "host" ? "主辦" : "玩家"}
                        </p>
                      </div>
                    </div>
                    {isHost && p.role !== "host" ? (
                      <form action={hostRemoveAction} className="w-full sm:w-auto">
                        <input type="hidden" name="game_id" value={game.id} />
                        <input type="hidden" name="user_id" value={p.user_id} />
                        <button
                          type="submit"
                          className="min-h-11 w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 transition active:bg-zinc-100 sm:min-h-0 sm:w-auto sm:px-3 sm:py-1.5 sm:text-xs dark:border-zinc-700 dark:text-zinc-100 dark:active:bg-zinc-800"
                        >
                          移除
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
            <p className="text-sm font-medium">待主辦確認</p>
            <ul className="mt-4 space-y-3 text-sm">
              {pending.length === 0 ? (
                <li className="text-zinc-600 dark:text-zinc-400">目前沒有待確認</li>
              ) : (
                pending.map((p) => (
                  <li
                    key={p.user_id}
                    className="flex flex-col gap-3 border-b border-zinc-100 pb-3 last:border-0 last:pb-0 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:border-0 sm:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {p.profiles?.display_name ?? p.user_id}
                      </p>
                      <p className="text-xs text-zinc-500">申請中</p>
                    </div>
                    {isHost ? (
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                        <form action={hostConfirmAction} className="w-full sm:w-auto">
                          <input type="hidden" name="game_id" value={game.id} />
                          <input type="hidden" name="user_id" value={p.user_id} />
                          <button
                            type="submit"
                            className="min-h-11 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition active:bg-emerald-700 sm:min-h-0 sm:w-auto sm:py-2 sm:text-xs"
                          >
                            確認
                          </button>
                        </form>
                        <form action={hostDeclineAction} className="w-full sm:w-auto">
                          <input type="hidden" name="game_id" value={game.id} />
                          <input type="hidden" name="user_id" value={p.user_id} />
                          <button
                            type="submit"
                            className="min-h-11 w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 transition active:bg-zinc-100 sm:min-h-0 sm:w-auto sm:py-2 sm:text-xs dark:border-zinc-700 dark:text-zinc-100 dark:active:bg-zinc-800"
                          >
                            拒絕
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
            <p className="text-sm font-medium">候補名單</p>
            <ul className="mt-4 space-y-3 text-sm">
              {waitlist.length === 0 ? (
                <li className="text-zinc-600 dark:text-zinc-400">目前沒有候補</li>
              ) : (
                waitlist.map((p) => (
                  <li
                    key={p.user_id}
                    className="flex flex-col gap-2 border-b border-zinc-100 pb-3 last:border-0 last:pb-0 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:border-0 sm:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {p.profiles?.display_name ?? p.user_id}
                      </p>
                      <p className="text-xs text-zinc-500">候補中</p>
                    </div>
                    {isHost ? (
                      <form action={hostRemoveAction} className="w-full sm:w-auto">
                        <input type="hidden" name="game_id" value={game.id} />
                        <input type="hidden" name="user_id" value={p.user_id} />
                        <button
                          type="submit"
                          className="min-h-11 w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 transition active:bg-zinc-100 sm:min-h-0 sm:w-auto sm:py-2 sm:text-xs dark:border-zinc-700 dark:text-zinc-100 dark:active:bg-zinc-800"
                        >
                          移除
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

