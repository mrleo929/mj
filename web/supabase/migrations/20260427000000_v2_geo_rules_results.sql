-- Mj：約麻將 — v2：位置(區域+經緯度)、規則(常用欄位+JSONB)、戰績(3/4 多數決 + 逾時預設同意)
-- 設計重點：
-- 1) 列表/地圖用「模糊座標」：games.public_lat/public_lng
-- 2) 精確位置只給已確認成員：game_secrets.exact_lat/exact_lng + address_detail
-- 3) 規則：base/unit/table_type/smoking 拆欄位；其餘放 extra_rules(jsonb)
-- 4) 戰績：先「提案」(proposal) 再「投票」(vote)。達 3 確認即接受；過期且無申訴視同接受。

-- ---- profiles: 信用/屬性/偏好/（可選）最後位置 ----
do $$ begin
  create type public.skill_level as enum ('beginner', 'intermediate', 'pro');
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists rating_score int not null default 100,
  add column if not exists skill_level public.skill_level,
  add column if not exists preferences jsonb not null default '{}'::jsonb,
  add column if not exists last_lat numeric(9, 6),
  add column if not exists last_lng numeric(9, 6);

create index if not exists profiles_rating_score_idx on public.profiles (rating_score);

-- ---- games: 區域標籤 + 公開模糊座標 + 常用規則欄位 + extra_rules ----
do $$ begin
  create type public.table_type as enum ('manual', 'electric');
exception
  when duplicate_object then null;
end $$;

alter table public.games
  -- 顯示用區域標籤（現有 county/district 可用；這裡補 city 以對齊 UI 文案）
  add column if not exists city text,
  -- 地圖/排序用：模糊後座標（不要放精確座標在 games）
  add column if not exists public_lat numeric(9, 6),
  add column if not exists public_lng numeric(9, 6),
  -- 常用規則拆欄位（可 index）
  add column if not exists base int,
  add column if not exists unit int,
  add column if not exists table_type public.table_type,
  add column if not exists smoking_allowed boolean,
  -- 其餘規則 JSONB
  add column if not exists extra_rules jsonb not null default '{}'::jsonb;

create index if not exists games_city_district_idx on public.games (city, district);
create index if not exists games_base_unit_idx on public.games (base, unit);
create index if not exists games_table_type_idx on public.games (table_type);
create index if not exists games_smoking_allowed_idx on public.games (smoking_allowed);

-- ---- game_secrets: 精確位置僅限主辦/已確認成員 ----
alter table public.game_secrets
  add column if not exists exact_lat numeric(9, 6),
  add column if not exists exact_lng numeric(9, 6);

-- ---- 戰績：提案 / 明細 / 投票 ----
do $$ begin
  create type public.game_result_status as enum ('pending', 'accepted', 'disputed', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.game_result_vote as enum ('confirm', 'dispute');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.game_result_proposals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  submitted_by uuid not null references public.profiles (id) on delete cascade,
  status public.game_result_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  accepted_at timestamptz,
  accepted_by text
);

create index if not exists game_result_proposals_game_idx on public.game_result_proposals (game_id);
create index if not exists game_result_proposals_status_idx on public.game_result_proposals (status);

-- 每個提案：每位玩家一筆分數（通常 4 筆）。final_score 為輸贏台/分數（正負皆可）。
create table if not exists public.game_result_lines (
  proposal_id uuid not null references public.game_result_proposals (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  final_score int not null,
  primary key (proposal_id, player_id)
);

create index if not exists game_result_lines_player_idx on public.game_result_lines (player_id);

-- 投票：同一位玩家對同一提案只能投一次；可用 dispute 觸發爭議
create table if not exists public.game_result_votes (
  proposal_id uuid not null references public.game_result_proposals (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  vote public.game_result_vote not null,
  created_at timestamptz not null default now(),
  primary key (proposal_id, voter_id)
);

create index if not exists game_result_votes_vote_idx on public.game_result_votes (vote);

-- ---- 驗證規則：3/4 多數決 + dispute 立即標記 + 逾時且無 dispute 視同接受 ----
create or replace function public.try_finalize_game_result(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game_id uuid;
  v_confirm_count int;
  v_dispute_count int;
begin
  select game_id into v_game_id
  from public.game_result_proposals
  where id = p_proposal_id;

  if v_game_id is null then
    return;
  end if;

  select
    count(*) filter (where vote = 'confirm')::int,
    count(*) filter (where vote = 'dispute')::int
  into v_confirm_count, v_dispute_count
  from public.game_result_votes
  where proposal_id = p_proposal_id;

  -- 任一 dispute 直接進爭議
  if v_dispute_count > 0 then
    update public.game_result_proposals
      set status = 'disputed'
    where id = p_proposal_id
      and status = 'pending';
    return;
  end if;

  -- 3/4 多數決：3 個 confirm 直接接受
  if v_confirm_count >= 3 then
    update public.game_result_proposals
      set status = 'accepted',
          accepted_at = now(),
          accepted_by = 'majority'
    where id = p_proposal_id
      and status = 'pending';
    return;
  end if;

  -- 逾時預設同意：超過 expires_at 且無 dispute → 接受
  update public.game_result_proposals
    set status = 'accepted',
        accepted_at = now(),
        accepted_by = 'timeout'
  where id = p_proposal_id
    and status = 'pending'
    and expires_at <= now();
end;
$$;

-- votes 變動時嘗試 finalize
create or replace function public.on_game_result_vote_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.try_finalize_game_result(coalesce(new.proposal_id, old.proposal_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_game_result_votes_finalize on public.game_result_votes;
create trigger trg_game_result_votes_finalize
  after insert or update on public.game_result_votes
  for each row execute procedure public.on_game_result_vote_change();

-- 供排程/Edge Function 週期性呼叫：把已過期的 pending 全部 finalize（逾時預設同意）
create or replace function public.finalize_expired_game_results()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  with pending as (
    select id
    from public.game_result_proposals
    where status = 'pending'
      and expires_at <= now()
  )
  select count(*) into v_count from pending;

  perform public.try_finalize_game_result(id) from pending;
  return v_count;
end;
$$;

-- ---- RLS: 啟用並給出最小可用策略 ----
alter table public.game_result_proposals enable row level security;
alter table public.game_result_lines enable row level security;
alter table public.game_result_votes enable row level security;

-- 基本原則：僅同局成員（含 host/confirmed/pending/waitlist）可看戰績資料
create policy if not exists game_result_proposals_select_participants
  on public.game_result_proposals for select
  to authenticated
  using (
    exists (
      select 1 from public.game_participants p
      where p.game_id = game_result_proposals.game_id
        and p.user_id = auth.uid()
    )
  );

-- 只有同局成員可新增提案（通常建議限制「已確認」才能提案；先用最小限制，後續可加強）
create policy if not exists game_result_proposals_insert_participants
  on public.game_result_proposals for insert
  to authenticated
  with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from public.game_participants p
      where p.game_id = game_id
        and p.user_id = auth.uid()
    )
  );

-- lines：同局成員可讀；只允許提案者寫入該提案的 lines
create policy if not exists game_result_lines_select_participants
  on public.game_result_lines for select
  to authenticated
  using (
    exists (
      select 1
      from public.game_result_proposals gp
      join public.game_participants p on p.game_id = gp.game_id
      where gp.id = game_result_lines.proposal_id
        and p.user_id = auth.uid()
    )
  );

create policy if not exists game_result_lines_insert_submitter
  on public.game_result_lines for insert
  to authenticated
  with check (
    exists (
      select 1 from public.game_result_proposals gp
      where gp.id = proposal_id
        and gp.submitted_by = auth.uid()
    )
  );

-- votes：同局成員可讀；同局成員僅能對自己的 voter_id 投票
create policy if not exists game_result_votes_select_participants
  on public.game_result_votes for select
  to authenticated
  using (
    exists (
      select 1
      from public.game_result_proposals gp
      join public.game_participants p on p.game_id = gp.game_id
      where gp.id = game_result_votes.proposal_id
        and p.user_id = auth.uid()
    )
  );

create policy if not exists game_result_votes_insert_self
  on public.game_result_votes for insert
  to authenticated
  with check (
    voter_id = auth.uid()
    and exists (
      select 1
      from public.game_result_proposals gp
      join public.game_participants p on p.game_id = gp.game_id
      where gp.id = proposal_id
        and p.user_id = auth.uid()
    )
  );

create policy if not exists game_result_votes_update_self
  on public.game_result_votes for update
  to authenticated
  using (voter_id = auth.uid());

