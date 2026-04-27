import { createAdminClient } from "@/lib/supabase/admin";
import { submitGameResultProposal, voteOnGameResult } from "./game-result-actions";

type ConfirmedPlayer = {
  user_id: string;
  display_name: string;
  role: string;
};

type ProposalRow = {
  id: string;
  submitted_by: string;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
};

function proposalStatusLabel(s: string) {
  if (s === "pending") return "待投票確認";
  if (s === "accepted") return "已接受";
  if (s === "disputed") return "爭議中";
  if (s === "rejected") return "已退回";
  return s;
}

function voteLabel(v: string) {
  if (v === "confirm") return "確認";
  if (v === "dispute") return "異議";
  return v;
}

export async function GameResultsSection({
  gameId,
  gameStatus,
  sessionUserId,
  confirmedPlayers,
}: {
  gameId: string;
  gameStatus: string;
  sessionUserId: string | null;
  confirmedPlayers: ConfirmedPlayer[];
}) {
  if (gameStatus === "cancelled") return null;

  const supabase = createAdminClient();
  const proposalsRes = await supabase
    .from("game_result_proposals")
    .select(
      "id,submitted_by,status,created_at,expires_at,accepted_at,accepted_by",
    )
    .eq("game_id", gameId)
    .order("created_at", { ascending: false });

  const proposals = (proposalsRes.data ?? []) as ProposalRow[];

  for (const p of proposals.filter((x) => x.status === "pending")) {
    await supabase.rpc("try_finalize_game_result", { p_proposal_id: p.id });
  }

  const proposalsRes2 = await supabase
    .from("game_result_proposals")
    .select(
      "id,submitted_by,status,created_at,expires_at,accepted_at,accepted_by",
    )
    .eq("game_id", gameId)
    .order("created_at", { ascending: false });

  const proposalsFresh = (proposalsRes2.data ?? []) as ProposalRow[];
  const proposalIds = proposalsFresh.map((p) => p.id);

  const linesRes =
    proposalIds.length > 0
      ? await supabase
          .from("game_result_lines")
          .select("proposal_id,player_id,final_score")
          .in("proposal_id", proposalIds)
      : { data: [] as { proposal_id: string; player_id: string; final_score: number }[] };

  const votesRes =
    proposalIds.length > 0
      ? await supabase
          .from("game_result_votes")
          .select("proposal_id,voter_id,vote")
          .in("proposal_id", proposalIds)
      : { data: [] as { proposal_id: string; voter_id: string; vote: string }[] };

  const linesByProposal = new Map<
    string,
    { player_id: string; final_score: number }[]
  >();
  for (const row of linesRes.data ?? []) {
    const list = linesByProposal.get(row.proposal_id) ?? [];
    list.push({
      player_id: row.player_id,
      final_score: row.final_score,
    });
    linesByProposal.set(row.proposal_id, list);
  }

  const votesByProposal = new Map<
    string,
    { voter_id: string; vote: string }[]
  >();
  for (const row of votesRes.data ?? []) {
    const list = votesByProposal.get(row.proposal_id) ?? [];
    list.push({ voter_id: row.voter_id, vote: row.vote });
    votesByProposal.set(row.proposal_id, list);
  }

  const nameByUserId = new Map(
    confirmedPlayers.map((p) => [p.user_id, p.display_name] as const),
  );

  const canAct = Boolean(
    sessionUserId &&
      confirmedPlayers.some((p) => p.user_id === sessionUserId),
  );

  return (
    <div className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm font-medium">戰績（MVP）</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        已確認玩家可提案每位成員的「最終分數」，其他人可確認或提出異議；達 3
        票確認或逾時無異議則接受（規則見資料庫 trigger）。
      </p>

      {canAct && confirmedPlayers.length >= 2 ? (
        <form action={submitGameResultProposal} className="mt-6 space-y-4">
          <input type="hidden" name="game_id" value={gameId} />
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            新增戰績提案
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {confirmedPlayers.map((p) => (
              <label key={p.user_id} className="space-y-1">
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {p.display_name}
                  {p.role === "host" ? "（主辦）" : ""} — 分數
                </span>
                <input
                  name={`score_${p.user_id}`}
                  type="number"
                  required
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  placeholder="整數，可為負"
                />
              </label>
            ))}
          </div>
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            送出提案
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          {sessionUserId
            ? "需為已確認玩家且至少兩人，才能提案戰績。"
            : "登入且成為已確認玩家後，可提案與投票。"}
        </p>
      )}

      <div className="mt-8 space-y-6">
        {proposalsFresh.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            尚無戰績提案。
          </p>
        ) : (
          proposalsFresh.map((pr) => {
            const lines = linesByProposal.get(pr.id) ?? [];
            const votes = votesByProposal.get(pr.id) ?? [];
            const myVote = sessionUserId
              ? votes.find((v) => v.voter_id === sessionUserId)?.vote
              : undefined;
            const submitterName =
              nameByUserId.get(pr.submitted_by) ?? pr.submitted_by;

            return (
              <div
                key={pr.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">
                    提案 · {proposalStatusLabel(pr.status)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    提出：{submitterName}
                  </p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  建立：{new Date(pr.created_at).toLocaleString("zh-TW")}
                  {pr.status === "accepted" && pr.accepted_at
                    ? ` · 結案：${new Date(pr.accepted_at).toLocaleString("zh-TW")}（${pr.accepted_by ?? ""}）`
                    : null}
                </p>

                {lines.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm">
                    {lines.map((l) => (
                      <li key={l.player_id}>
                        {nameByUserId.get(l.player_id) ?? l.player_id}：
                        <span className="font-medium tabular-nums">
                          {l.final_score}
                        </span>{" "}
                        分
                      </li>
                    ))}
                  </ul>
                ) : null}

                {votes.length > 0 ? (
                  <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
                    投票：
                    {votes
                      .map(
                        (v) =>
                          `${nameByUserId.get(v.voter_id) ?? v.voter_id}：${voteLabel(v.vote)}`,
                      )
                      .join(" · ")}
                  </p>
                ) : null}

                {pr.status === "pending" && canAct ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={voteOnGameResult}>
                      <input type="hidden" name="game_id" value={gameId} />
                      <input type="hidden" name="proposal_id" value={pr.id} />
                      <input type="hidden" name="vote" value="confirm" />
                      <button
                        type="submit"
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-500"
                      >
                        確認戰績
                      </button>
                    </form>
                    <form action={voteOnGameResult}>
                      <input type="hidden" name="game_id" value={gameId} />
                      <input type="hidden" name="proposal_id" value={pr.id} />
                      <input type="hidden" name="vote" value="dispute" />
                      <button
                        type="submit"
                        className="rounded-xl border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        異議
                      </button>
                    </form>
                    {myVote ? (
                      <span className="self-center text-xs text-zinc-500">
                        你已投：{voteLabel(myVote)}（可再投覆寫）
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
