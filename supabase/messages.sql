-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- 1:1 messages (server-managed sessions; no RLS assumed)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(body) <= 2000)
);

create index if not exists messages_pair_created_at_idx
  on public.messages (from_user_id, to_user_id, created_at desc);

create index if not exists messages_to_user_created_at_idx
  on public.messages (to_user_id, created_at desc);

