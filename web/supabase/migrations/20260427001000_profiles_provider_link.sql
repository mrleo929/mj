-- Mj：約麻將 — profiles 綁定第三方登入身分（LINE）
alter table public.profiles
  add column if not exists provider text,
  add column if not exists provider_user_id text;

create unique index if not exists profiles_provider_user_unique
  on public.profiles (provider, provider_user_id)
  where provider is not null and provider_user_id is not null;

