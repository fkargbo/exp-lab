-- ExP-Lab: allow updating comment text from the embed (anon key). MVP — tighten later.

drop policy if exists "feedback_pins_update_all" on public.feedback_pins;

create policy "feedback_pins_update_all"
  on public.feedback_pins
  for update
  using (true)
  with check (true);

grant update on table public.feedback_pins to anon, authenticated;
