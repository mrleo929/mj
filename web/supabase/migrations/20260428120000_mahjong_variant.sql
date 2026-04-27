-- 牌局「類型」：台麻變體／美麻／日麻／港麻（可空＝不限）

do $$ begin
  create type public.mahjong_variant as enum (
    'zheng_hua_zheng_zi',
    'jian_hua_jian_zi',
    'american',
    'riichi',
    'hong_kong'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.games
  add column if not exists mahjong_variant public.mahjong_variant;

create index if not exists games_mahjong_variant_idx on public.games (mahjong_variant);
