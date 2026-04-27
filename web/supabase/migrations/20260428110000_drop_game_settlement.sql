-- 移除牌局現金結算（game_settlement_lines 與相關 trigger／函式）
-- 若從未套用過 20260428100000_game_settlement，此檔仍安全（皆為 IF EXISTS）。

drop trigger if exists trg_game_result_proposal_accepted on public.game_result_proposals;

drop table if exists public.game_settlement_lines cascade;

drop function if exists public.refresh_game_settlement(uuid);
drop function if exists public.trg_game_result_proposal_accepted_fn();
