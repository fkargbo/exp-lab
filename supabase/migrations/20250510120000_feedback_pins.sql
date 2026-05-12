/*
 * ExP-Lab Universal Feedback Layer — pins & regions per prototype URL (project_id).
 * Prefer running `dashboard-schema.sql` in Dashboard for a single paste; this file mirrors it for CLI.
 */

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

create index if not exists feedback_pins_project_id_idx on public.feedback_pins (project_id);
create index if not exists feedback_pins_created_at_idx on public.feedback_pins (created_at desc);

alter table public.feedback_pins replica identity full;

alter table public.feedback_pins enable row level security;

drop policy if exists "feedback_pins_select_all" on public.feedback_pins;
drop policy if exists "feedback_pins_insert_all" on public.feedback_pins;

create policy "feedback_pins_select_all"
  on public.feedback_pins for select
  using (true);

create policy "feedback_pins_insert_all"
  on public.feedback_pins for insert
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert on table public.feedback_pins to anon, authenticated;

alter publication supabase_realtime add table public.feedback_pins;

comment on table public.feedback_pins is 'ExP-Lab prototype feedback pins (hostname + pathname project scope).';
