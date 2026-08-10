-- ExP-Lab: fix "new row violates row-level security policy for table feedback_pins"
-- when RLS is on but INSERT (or other) policy is missing — common if only partial SQL
-- was applied or the table was created without the MVP policies from dashboard-schema.sql.

alter table if exists public.feedback_pins enable row level security;

drop policy if exists "feedback_pins_select_all" on public.feedback_pins;
drop policy if exists "feedback_pins_insert_all" on public.feedback_pins;
drop policy if exists "feedback_pins_update_all" on public.feedback_pins;
drop policy if exists "feedback_pins_delete_all" on public.feedback_pins;

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

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.feedback_pins to anon, authenticated;
