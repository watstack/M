-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Creates the wc_matches table used by /api/sync to cache ESPN match data.

create table if not exists wc_matches (
  id          text primary key,
  home_tla    text not null default '',
  home_name   text not null default '',
  home_id     text,
  away_tla    text not null default '',
  away_name   text not null default '',
  away_id     text,
  home_score  int,
  away_score  int,
  status      text not null default 'SCHEDULED',
  utc_date    timestamptz not null,
  stage       text,
  group_name  text,
  goals       jsonb not null default '[]',
  synced_at   timestamptz default now()
);

-- Allow public reads (no auth needed)
alter table wc_matches enable row level security;

create policy "public_read" on wc_matches
  for select using (true);

-- Allow the server function to write (uses service key which bypasses RLS,
-- but anon inserts are also allowed so the anon key fallback works)
create policy "anon_upsert" on wc_matches
  for insert with check (true);

create policy "anon_update" on wc_matches
  for update using (true);
