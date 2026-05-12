-- =============================================================================
-- ExP-Lab — run this in Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================
-- Supports: feedback pins/regions, optional prototype URL for emails, Realtime.
-- After success: Authentication → Providers → enable GitHub (for OAuth reviewers).
-- =============================================================================

create table if not exists public.feedback_pins (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  kind text not null default 'point' check (kind in ('point', 'region')),
  x_pct double precision not null,
  y_pct double precision not null,
  w_pct double precision,
  h_pct double precision,
  comment_text text not null default '',
  prototype_url text,
  author_name text,
  author_avatar_url text,
  author_github_id text,
  created_at timestamptz not null default now()
);

comment on table public.feedback_pins is 'ExP-Lab: prototype feedback (project_id = hostname + pathname).';

create index if not exists feedback_pins_project_id_idx
  on public.feedback_pins (project_id);

create index if not exists feedback_pins_created_at_idx
  on public.feedback_pins (created_at desc);

-- Realtime needs FULL replica identity for filtered subscriptions / updates (safe default).
alter table public.feedback_pins replica identity full;

alter table public.feedback_pins enable row level security;

-- MVP: anyone with the anon key can read/write pins (tighten later with auth.uid() rules).
drop policy if exists "feedback_pins_select_all" on public.feedback_pins;
drop policy if exists "feedback_pins_insert_all" on public.feedback_pins;
drop policy if exists "feedback_pins_delete_all" on public.feedback_pins;
drop policy if exists "feedback_pins_update_all" on public.feedback_pins;

create policy "feedback_pins_select_all"
  on public.feedback_pins
  for select
  using (true);

create policy "feedback_pins_insert_all"
  on public.feedback_pins
  for insert
  with check (true);

create policy "feedback_pins_update_all"
  on public.feedback_pins
  for update
  using (true)
  with check (true);

create policy "feedback_pins_delete_all"
  on public.feedback_pins
  for delete
  using (true);

-- Browser clients use the anon key — grant table access explicitly.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.feedback_pins to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: subscribe to INSERTs from the embed (repeat run is OK if already added).
-- If you see "already member of publication", skip this line — Realtime is already on.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.feedback_pins;
