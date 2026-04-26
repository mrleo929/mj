-- 牌局「多少（將／雀）」：局數／圈數約定（可空＝不限）

do $$ begin
  create type public.mahjong_jiang_que as enum (
    'jiang_1',
    'jiang_2',
    'jiang_3',
    'jiang_4',
    'que_1',
    'que_2',
    'jiang_2_que_2',
    'north_round',
    'on_site'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.games
  add column if not exists mahjong_jiang_que public.mahjong_jiang_que;

create index if not exists games_mahjong_jiang_que_idx on public.games (mahjong_jiang_que);
