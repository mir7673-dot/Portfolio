-- The C(9)atalog — Supabase schema
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).

create extension if not exists pgcrypto;

-- ══ TABLES ══

create table if not exists site_info (
  id int primary key default 1,
  name text,
  role text,
  intro text,
  bio text,
  awards text,
  reach text,
  social text,
  design text,
  resume text,
  other text,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

create table if not exists works (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  title text not null,
  type text default '3D',
  year text,
  medium text,
  status text,
  short text,
  description text,
  image_url text,
  fit text default 'contain',
  color text default '#f3f3f1',
  x numeric default 2,
  y numeric default 0,
  w numeric default 40,
  h numeric default 320,
  created_at timestamptz default now()
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  n int unique not null,
  name text,
  category text,
  description text,
  visited boolean default false,
  image_url text,
  created_at timestamptz default now()
);

insert into site_info (id) values (1) on conflict (id) do nothing;

-- ══ ROW LEVEL SECURITY ══
-- Anyone can read (the site is a public portfolio).
-- Only a signed-in (Supabase Auth) user can write — that's Dylan via the Admin panel,
-- or the migrate.mjs script when using the service_role key (which bypasses RLS entirely).

alter table site_info enable row level security;
alter table works enable row level security;
alter table cards enable row level security;

create policy "public read site_info" on site_info for select using (true);
create policy "public read works" on works for select using (true);
create policy "public read cards" on cards for select using (true);

create policy "auth write site_info" on site_info for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write works" on works for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth write cards" on cards for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ══ STORAGE ══
-- Two public buckets for images. Public = readable by anyone via URL;
-- writes are still gated by the policies below (authenticated only).

insert into storage.buckets (id, name, public)
  values ('works-images', 'works-images', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
  values ('cards-images', 'cards-images', true) on conflict (id) do nothing;

create policy "public read works-images" on storage.objects for select
  using (bucket_id = 'works-images');
create policy "public read cards-images" on storage.objects for select
  using (bucket_id = 'cards-images');

create policy "auth write works-images" on storage.objects for all
  using (bucket_id = 'works-images' and auth.role() = 'authenticated')
  with check (bucket_id = 'works-images' and auth.role() = 'authenticated');
create policy "auth write cards-images" on storage.objects for all
  using (bucket_id = 'cards-images' and auth.role() = 'authenticated')
  with check (bucket_id = 'cards-images' and auth.role() = 'authenticated');
