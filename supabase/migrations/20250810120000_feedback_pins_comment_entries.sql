-- Threaded feedback: multiple messages per pin (author + timestamp each).

alter table public.feedback_pins
  add column if not exists comment_entries jsonb not null default '[]'::jsonb;

comment on column public.feedback_pins.comment_entries is 'ExP-Lab: ordered JSON array of {id, body, author_*, created_at}.';

-- One-time backfill: legacy rows with flat comment_text → single thread entry
update public.feedback_pins
set comment_entries = jsonb_build_array(
  jsonb_build_object(
    'id', 'legacy-' || id::text,
    'body', comment_text,
    'author_name', author_name,
    'author_avatar_url', author_avatar_url,
    'author_github_id', author_github_id,
    'created_at', created_at
  )
)
where coalesce(trim(comment_text), '') <> ''
  and comment_entries = '[]'::jsonb;
