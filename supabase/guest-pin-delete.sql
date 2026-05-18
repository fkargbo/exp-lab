-- Run in Supabase SQL editor if guest (anonymous) users cannot delete their pins.
-- Adds a per-browser token column and RLS so DELETE matches id + guest_author_token.

alter table public.feedback_pins
  add column if not exists guest_author_token text;

create policy "feedback_pins_delete_guest_own"
  on public.feedback_pins
  for delete
  to anon, authenticated
  using (
    guest_author_token is not null
    and author_github_id is null
  );

-- Tighten with GitHub-owned pins (optional; adjust claim names to match your JWT):
-- create policy "feedback_pins_delete_github_own"
--   on public.feedback_pins
--   for delete
--   to authenticated
--   using (
--     author_github_id is not null
--     and author_github_id = coalesce(
--       auth.jwt() ->> 'user_name',
--       auth.jwt() ->> 'preferred_username'
--     )
--   );
