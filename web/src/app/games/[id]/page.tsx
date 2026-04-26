import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { GameResultsSection } from "@/app/games/[id]/game-results-section";

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
  if (["cancelled", "finished"].includes(status)) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("此局已結束或取消")}`);
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
  if (["cancelled", "finished"].includes(status)) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("此局已結束或取消")}`);
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
    .select("id,host_id,title,county,district,venue_type,starts_at,seats_total,status,notes")
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

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              href="/games"
              className="text-sm text-zinc-500 transition hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              ← 回牌局列表
            </Link>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">
              {game.title}
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {game.county}
              {game.district ? ` · ${game.district}` : ""} · {game.venue_type} ·{" "}
              {formatStartsAt(game.starts_at)}
            </p>
          </div>
          <div className="text-right text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              座位：{confirmed.length}/{game.seats_total}
            </p>
            <p>狀態：{game.status}</p>
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

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {!session ? (
            <Link
              href={`/login?next=/games/${encodeURIComponent(game.id)}`}
              className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500"
            >
              登入後加入
            </Link>
          ) : isHost ? (
            <form action={hostCancelGameAction}>
              <input type="hidden" name="game_id" value={game.id} />
              <button
                type="submit"
                className="rounded-xl border border-zinc-300 px-5 py-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                取消牌局
              </button>
            </form>
          ) : myRow ? (
            <form action={leaveGameAction}>
              <input type="hidden" name="game_id" value={game.id} />
              <button
                type="submit"
                className="rounded-xl border border-zinc-300 px-5 py-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {myRow.role === "waitlist" ? "退出候補" : "退出牌局"}
              </button>
            </form>
          ) : (
            <form action={requestJoinAction}>
              <input type="hidden" name="game_id" value={game.id} />
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500"
              >
                申請加入
              </button>
            </form>
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
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
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
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            <p className="font-medium">備註</p>
            <p className="mt-2 whitespace-pre-wrap">{game.notes}</p>
          </div>
        ) : null}

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

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-medium">已確認成員</p>
            <ul className="mt-4 space-y-3 text-sm">
              {confirmed.length === 0 ? (
                <li className="text-zinc-600 dark:text-zinc-400">尚無</li>
              ) : (
                confirmed.map((p) => (
                  <li
                    key={p.user_id}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />
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
                      <form action={hostRemoveAction}>
                        <input type="hidden" name="game_id" value={game.id} />
                        <input type="hidden" name="user_id" value={p.user_id} />
                        <button
                          type="submit"
                          className="rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
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

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-medium">待主辦確認</p>
            <ul className="mt-4 space-y-3 text-sm">
              {pending.length === 0 ? (
                <li className="text-zinc-600 dark:text-zinc-400">目前沒有待確認</li>
              ) : (
                pending.map((p) => (
                  <li key={p.user_id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {p.profiles?.display_name ?? p.user_id}
                      </p>
                      <p className="text-xs text-zinc-500">申請中</p>
                    </div>
                    {isHost ? (
                      <div className="flex items-center gap-2">
                        <form action={hostConfirmAction}>
                          <input type="hidden" name="game_id" value={game.id} />
                          <input type="hidden" name="user_id" value={p.user_id} />
                          <button
                            type="submit"
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-500"
                          >
                            確認
                          </button>
                        </form>
                        <form action={hostDeclineAction}>
                          <input type="hidden" name="game_id" value={game.id} />
                          <input type="hidden" name="user_id" value={p.user_id} />
                          <button
                            type="submit"
                            className="rounded-xl border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
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

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-medium">候補名單</p>
            <ul className="mt-4 space-y-3 text-sm">
              {waitlist.length === 0 ? (
                <li className="text-zinc-600 dark:text-zinc-400">目前沒有候補</li>
              ) : (
                waitlist.map((p) => (
                  <li key={p.user_id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {p.profiles?.display_name ?? p.user_id}
                      </p>
                      <p className="text-xs text-zinc-500">候補中</p>
                    </div>
                    {isHost ? (
                      <form action={hostRemoveAction}>
                        <input type="hidden" name="game_id" value={game.id} />
                        <input type="hidden" name="user_id" value={p.user_id} />
                        <button
                          type="submit"
                          className="rounded-xl border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
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

