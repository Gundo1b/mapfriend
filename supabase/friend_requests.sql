-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- Friend requests
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'canceled'))
);

create unique index if not exists friend_requests_unique_pair_idx
  on public.friend_requests (from_user_id, to_user_id);

create index if not exists friend_requests_to_user_id_idx
  on public.friend_requests (to_user_id);

