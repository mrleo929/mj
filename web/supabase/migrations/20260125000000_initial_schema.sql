-- Mj：約麻將 — 初始 schema（於 Supabase SQL Editor 執行，或使用 Supabase CLI link 後 db push）
-- 若與既有物件衝突，請調整名稱或分段執行。

-- ---- profiles ----
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  slug text unique,
  bio text,
  county text,
  reputation_score numeric(4, 2),
  games_completed int not null default 0,
  reviews_received int not null default 0,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_county_idx on public.profiles (county);

-- ---- games ----
do $$ begin
  create type public.game_status as enum (
    'recruiting',
    'full',
    'in_progress',
    'finished',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  county text not null,
  district text,
  venue_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  seats_total int not null default 4,
  rules_tags text[] not null default '{}',
  notes text,
  status public.game_status not null default 'recruiting',
  min_reputation numeric(4, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists games_county_starts_idx on public.games (county, starts_at);
create index if not exists games_host_idx on public.games (host_id);

-- ---- 僅主辦／已確認成員可讀的敏感欄位 ----
create table if not exists public.game_secrets (
  game_id uuid primary key references public.games (id) on delete cascade,
  address_detail text,
  host_contact text
);

-- ---- game_participants ----
do $$ begin
  create type public.participant_role as enum ('host', 'player', 'waitlist');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.participant_status as enum (
    'pending',
    'confirmed',
    'declined',
    'removed'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.game_participants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.participant_role not null,
  status public.participant_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create index if not exists game_participants_game_idx on public.game_participants (game_id);
create index if not exists game_participants_user_idx on public.game_participants (user_id);

-- ---- reviews ----
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating >= 1 and rating <= 5),
  tags text[] not null default '{}',
  comment text,
  created_at timestamptz not null default now(),
  unique (game_id, from_user, to_user),
  check (from_user <> to_user)
);

create index if not exists reviews_to_user_idx on public.reviews (to_user);

-- ---- reports ----
do $$ begin
  create type public.report_target_type as enum ('game', 'profile', 'review');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target_type not null,
  target_id uuid not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- ---- 新使用者自動建立 profile ----
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', '使用者')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---- RLS ----
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_secrets enable row level security;
alter table public.game_participants enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;

-- profiles
create policy profiles_select_all
  on public.profiles for select
  using (true);

create policy profiles_insert_own
  on public.profiles for insert
  with check (auth.uid() = id);

create policy profiles_update_own
  on public.profiles for update
  using (auth.uid() = id);

-- games
create policy games_select_authenticated
  on public.games for select
  to authenticated
  using (true);

create policy games_insert_host_is_self
  on public.games for insert
  to authenticated
  with check (auth.uid() = host_id);

create policy games_update_host
  on public.games for update
  to authenticated
  using (auth.uid() = host_id);

-- game_secrets：主辦或已確認成員
create policy game_secrets_select
  on public.game_secrets for select
  to authenticated
  using (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.host_id = auth.uid()
    )
    or exists (
      select 1 from public.game_participants p
      where p.game_id = game_secrets.game_id
        and p.user_id = auth.uid()
        and p.status = 'confirmed'
    )
  );

create policy game_secrets_all_host
  on public.game_secrets for all
  to authenticated
  using (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.games g
      where g.id = game_id and g.host_id = auth.uid()
    )
  );

-- game_participants：本人、主辦、或同局任一成員可見（方便顯示已加入誰）
create policy game_participants_select
  on public.game_participants for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.games g
      where g.id = game_id and g.host_id = auth.uid()
    )
    or exists (
      select 1 from public.game_participants p2
      where p2.game_id = game_participants.game_id
        and p2.user_id = auth.uid()
    )
  );

create policy game_participants_insert_self
  on public.game_participants for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      role in ('player', 'waitlist')
      or (
        role = 'host'
        and exists (
          select 1 from public.games g
          where g.id = game_id and g.host_id = auth.uid()
        )
      )
    )
  );

create policy game_participants_update_host_or_self
  on public.game_participants for update
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.games g
      where g.id = game_id and g.host_id = auth.uid()
    )
  );

create policy game_participants_delete_self_or_host
  on public.game_participants for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.games g
      where g.id = game_id and g.host_id = auth.uid()
    )
  );

-- reviews：可讀；僅本人寫入（業務上應限制「局結束且同桌」— 建議用 DB trigger 或 Edge Function 強化）
create policy reviews_select_authenticated
  on public.reviews for select
  to authenticated
  using (true);

create policy reviews_insert_from_self
  on public.reviews for insert
  to authenticated
  with check (from_user = auth.uid());

-- reports
create policy reports_insert_self
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

create policy reports_select_own
  on public.reports for select
  to authenticated
  using (reporter_id = auth.uid());
