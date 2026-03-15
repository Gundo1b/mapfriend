-- Create table for saved locations
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  accuracy double precision null
);

create index if not exists locations_created_at_idx on public.locations (created_at desc);

