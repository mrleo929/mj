"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

async function assertConfirmedPlayer(gameId: string, profileId: string) {
  const supabase = createAdminClient();
  const row = await supabase
    .from("game_participants")
    .select("role,status")
    .eq("game_id", gameId)
    .eq("user_id", profileId)
    .maybeSingle();

  if (row.error || !row.data) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("你不是此局成員")}`);
  }
  const role = row.data.role as string;
  const status = row.data.status as string;
  if (status !== "confirmed" || !["host", "player"].includes(role)) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent("僅已確認玩家可操作戰績")}`,
    );
  }
}

export async function submitGameResultProposal(formData: FormData) {
  const session = await getSessionUser();
  const gameId = String(formData.get("game_id") ?? "");
  if (!session) redirect(`/login?next=/games/${encodeURIComponent(gameId)}`);
  if (!gameId) redirect("/games");

  const supabase = createAdminClient();
  const gameRes = await supabase
    .from("games")
    .select("status")
    .eq("id", gameId)
    .single();
  if (gameRes.error) {
    redirect(`/games/${gameId}?error=${encodeURIComponent(gameRes.error.message)}`);
  }
  if ((gameRes.data.status as string) === "cancelled") {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent("已取消的牌局無法登錄戰績")}`,
    );
  }

  await assertConfirmedPlayer(gameId, session.profileId);

  const partsRes = await supabase
    .from("game_participants")
    .select("user_id,role,status")
    .eq("game_id", gameId);

  const confirmedIds = (partsRes.data ?? [])
    .filter(
      (p: { role: string; status: string }) =>
        ["host", "player"].includes(p.role) && p.status === "confirmed",
    )
    .map((p: { user_id: string }) => p.user_id);

  if (confirmedIds.length < 2) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent("至少需要兩位已確認成員才能提案戰績")}`,
    );
  }

  const lines: { player_id: string; final_score: number }[] = [];
  for (const uid of confirmedIds) {
    const raw = formData.get(`score_${uid}`);
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s === "" || !Number.isFinite(Number(s))) {
      redirect(
        `/games/${gameId}?error=${encodeURIComponent(
          "請為每位已確認成員填寫分數（整數）",
        )}`,
      );
    }
    lines.push({ player_id: uid, final_score: Math.trunc(Number(s)) });
  }

  const prop = await supabase
    .from("game_result_proposals")
    .insert({
      game_id: gameId,
      submitted_by: session.profileId,
      status: "pending",
    })
    .select("id")
    .single();

  if (prop.error || !prop.data?.id) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent(
        `建立提案失敗：${prop.error?.message ?? "unknown"}`,
      )}`,
    );
  }

  const proposalId = prop.data.id as string;
  const insLines = await supabase.from("game_result_lines").insert(
    lines.map((l) => ({
      proposal_id: proposalId,
      player_id: l.player_id,
      final_score: l.final_score,
    })),
  );

  if (insLines.error) {
    await supabase.from("game_result_proposals").delete().eq("id", proposalId);
    redirect(
      `/games/${gameId}?error=${encodeURIComponent(
        `寫入分數失敗：${insLines.error.message}`,
      )}`,
    );
  }

  redirect(`/games/${gameId}`);
}

export async function voteOnGameResult(formData: FormData) {
  const session = await getSessionUser();
  const gameId = String(formData.get("game_id") ?? "");
  const proposalId = String(formData.get("proposal_id") ?? "");
  const voteRaw = String(formData.get("vote") ?? "");

  if (!session) redirect(`/login?next=/games/${encodeURIComponent(gameId)}`);
  if (!gameId || !proposalId || !["confirm", "dispute"].includes(voteRaw)) {
    redirect(`/games/${gameId}`);
  }

  await assertConfirmedPlayer(gameId, session.profileId);

  const supabase = createAdminClient();
  const prop = await supabase
    .from("game_result_proposals")
    .select("id,status,game_id")
    .eq("id", proposalId)
    .single();

  if (prop.error || !prop.data || prop.data.game_id !== gameId) {
    redirect(`/games/${gameId}?error=${encodeURIComponent("找不到此提案")}`);
  }
  if ((prop.data.status as string) !== "pending") {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent("此提案已結案，無法投票")}`,
    );
  }

  const ins = await supabase.from("game_result_votes").upsert(
    {
      proposal_id: proposalId,
      voter_id: session.profileId,
      vote: voteRaw,
    },
    { onConflict: "proposal_id,voter_id" },
  );

  if (ins.error) {
    redirect(
      `/games/${gameId}?error=${encodeURIComponent(`投票失敗：${ins.error.message}`)}`,
    );
  }

  await supabase.rpc("try_finalize_game_result", {
    p_proposal_id: proposalId,
  });

  redirect(`/games/${gameId}`);
}
