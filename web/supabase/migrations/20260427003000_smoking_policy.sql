-- Mj：約麻將 — v2.1：抽菸規則改為枚舉（禁菸/桌煙/雀煙/電子煙/不限）
do $$ begin
  create type public.smoking_policy as enum (
    'no_smoking',
    'table_smoke',
    'cigar_smoke',
    'vape'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.games
  add column if not exists smoking_policy public.smoking_policy;

create index if not exists games_smoking_policy_idx on public.games (smoking_policy);

