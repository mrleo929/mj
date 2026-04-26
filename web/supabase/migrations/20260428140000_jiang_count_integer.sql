-- 「將」改為整數欄位（1–20，可空＝不限），取代 mahjong_jiang_que enum

alter table public.games add column if not exists jiang_count smallint;

alter table public.games drop constraint if exists games_jiang_count_check;
alter table public.games add constraint games_jiang_count_check
  check (jiang_count is null or (jiang_count >= 1 and jiang_count <= 20));

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'games'
      and column_name = 'mahjong_jiang_que'
  ) then
    update public.games g
    set jiang_count = case g.mahjong_jiang_que::text
      when 'jiang_1' then 1
      when 'jiang_2' then 2
      when 'jiang_3' then 3
      when 'jiang_4' then 4
      else null
    end
    where g.mahjong_jiang_que is not null;

    alter table public.games drop column mahjong_jiang_que;
  end if;
end $$;

drop index if exists games_mahjong_jiang_que_idx;
drop type if exists public.mahjong_jiang_que;

create index if not exists games_jiang_count_idx on public.games (jiang_count);
