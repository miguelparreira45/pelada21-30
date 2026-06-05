-- PeladaFast Supabase schema
-- Run this file in Supabase SQL Editor after creating the project.

create extension if not exists "pgcrypto";

create table if not exists public.pelada_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pelada_name text not null,
  username text not null unique,
  email text not null unique,
  phone text not null unique,
  current_season_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_lowercase check (username = lower(username)),
  constraint username_format check (username ~ '^[a-z0-9._]+$')
);

alter table public.pelada_profiles
  add column if not exists email text;

create unique index if not exists pelada_profiles_email_unique
on public.pelada_profiles (lower(email));

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.pelada_profiles(id) on delete cascade,
  name text not null,
  finished_at timestamptz,
  awards jsonb,
  created_at timestamptz not null default now()
);

alter table public.seasons
  add column if not exists finished_at timestamptz,
  add column if not exists awards jsonb;

create unique index if not exists seasons_profile_name_unique
on public.seasons (profile_id, lower(name));

alter table public.pelada_profiles
  drop constraint if exists pelada_profiles_current_season_fk;

alter table public.pelada_profiles
  add constraint pelada_profiles_current_season_fk
  foreign key (current_season_id) references public.seasons(id)
  deferrable initially deferred;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.pelada_profiles(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  member_type text not null check (member_type in ('mensalista', 'suplente')),
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.pelada_profiles(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete restrict,
  played_at timestamptz not null default now(),
  settings jsonb not null default '{"durationMinutes": 7, "goalLimit": 2, "playersPerTeam": 5}'::jsonb,
  teams jsonb not null default '{}'::jsonb,
  matches jsonb not null default '[]'::jsonb,
  stats jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.public_share_pages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.pelada_profiles(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete set null,
  slug text not null unique,
  payload jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.login_email_for_identity(identity text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.pelada_profiles
  where username = lower(identity)
     or lower(email) = lower(identity)
     or phone = regexp_replace(identity, '\D', '', 'g')
  limit 1;
$$;

grant execute on function public.login_email_for_identity(text) to anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pelada_profiles_updated_at on public.pelada_profiles;
create trigger set_pelada_profiles_updated_at
before update on public.pelada_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_players_updated_at on public.players;
create trigger set_players_updated_at
before update on public.players
for each row execute function public.set_updated_at();

drop trigger if exists set_sessions_updated_at on public.sessions;
create trigger set_sessions_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

drop trigger if exists set_public_share_pages_updated_at on public.public_share_pages;
create trigger set_public_share_pages_updated_at
before update on public.public_share_pages
for each row execute function public.set_updated_at();

alter table public.pelada_profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.public_share_pages enable row level security;

drop policy if exists "profiles_select_own" on public.pelada_profiles;
create policy "profiles_select_own"
on public.pelada_profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.pelada_profiles;
create policy "profiles_insert_own"
on public.pelada_profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.pelada_profiles;
create policy "profiles_update_own"
on public.pelada_profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "seasons_all_own" on public.seasons;
create policy "seasons_all_own"
on public.seasons for all
to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

drop policy if exists "players_all_own" on public.players;
create policy "players_all_own"
on public.players for all
to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

drop policy if exists "sessions_all_own" on public.sessions;
create policy "sessions_all_own"
on public.sessions for all
to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

drop policy if exists "share_pages_owner_all" on public.public_share_pages;
create policy "share_pages_owner_all"
on public.public_share_pages for all
to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

drop policy if exists "share_pages_public_read" on public.public_share_pages;
create policy "share_pages_public_read"
on public.public_share_pages for select
to anon, authenticated
using (is_active = true);

insert into storage.buckets (id, name, public)
values ('player-photos', 'player-photos', false)
on conflict (id) do nothing;

drop policy if exists "player_photos_select_own" on storage.objects;
create policy "player_photos_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "player_photos_insert_own" on storage.objects;
create policy "player_photos_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "player_photos_update_own" on storage.objects;
create policy "player_photos_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "player_photos_delete_own" on storage.objects;
create policy "player_photos_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'player-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
