-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- Locations
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  accuracy double precision null
);

-- If you already created `public.locations` earlier, these make the migration safe to re-run
alter table public.locations add column if not exists user_id uuid null;
alter table public.locations add column if not exists accuracy double precision null;

create index if not exists locations_created_at_idx on public.locations (created_at desc);
create index if not exists locations_user_id_idx on public.locations (user_id);

-- Simple username/password auth (server-managed sessions)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  username text not null unique,
  password_hash text not null,
  purpose text not null check (purpose in ('friends', 'hangout', 'hookup', 'social')),
  gender text null
);

-- Safe to re-run if `public.users` already exists
alter table public.users add column if not exists gender text null;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null
);

create index if not exists sessions_token_idx on public.sessions (token);
