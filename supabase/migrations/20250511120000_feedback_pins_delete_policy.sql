-- ExP-Lab: allow deleting feedback from the embed (anon key). MVP — tighten later.

drop policy if exists "feedback_pins_delete_all" on public.feedback_pins;

create policy "feedback_pins_delete_all"
  on public.feedback_pins
  for delete
  using (true);

grant delete on table public.feedback_pins to anon, authenticated;
