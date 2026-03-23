-- ─────────────────────────────────────────────────────────────────────────────
-- Pathfinder Roadmap SaaS — Supabase Setup
-- Run this in the Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── roadmaps table ────────────────────────────────────────────────────────────
create table if not exists roadmaps (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  topic      text not null,
  data       jsonb not null,
  public_id  text unique not null,
  is_public  boolean default true,
  created_at timestamp with time zone default now()
);

create index if not exists roadmaps_user_id_idx on roadmaps(user_id);
create index if not exists roadmaps_public_id_idx on roadmaps(public_id);

-- ── user_memory table (for future personalization) ────────────────────────────
create table if not exists user_memory (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  interests  jsonb,
  skill_level text,
  goals      text,
  updated_at timestamp with time zone default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security (RLS)
-- CRITICAL: Without this, any user can read/write all rows
-- ─────────────────────────────────────────────────────────────────────────────

alter table roadmaps enable row level security;
alter table user_memory enable row level security;

-- roadmaps policies
create policy "Users can insert their own roadmaps"
  on roadmaps for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own roadmaps"
  on roadmaps for select
  using (auth.uid() = user_id);

create policy "Anyone can read public roadmaps"
  on roadmaps for select
  using (is_public = true);

create policy "Users can delete their own roadmaps"
  on roadmaps for delete
  using (auth.uid() = user_id);

-- user_memory policies
create policy "Users can manage their own memory"
  on user_memory for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);