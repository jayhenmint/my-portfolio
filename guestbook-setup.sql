-- Run this entire file in your Supabase project's SQL Editor.
begin;

create table if not exists public.guestbook (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint guestbook_name_length check (char_length(btrim(name)) between 1 and 60),
  constraint guestbook_message_length check (char_length(btrim(message)) between 1 and 500)
);

create index if not exists guestbook_newest_idx
  on public.guestbook (created_at desc, id desc);

alter table public.guestbook enable row level security;
alter table public.guestbook force row level security;

-- Website users can only read rows and insert the two text fields.
-- No permission to edit/delete, or supply their own ID or timestamp.
revoke all privileges on table public.guestbook from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on table public.guestbook to anon, authenticated;
grant insert (name, message) on public.guestbook to anon, authenticated;

drop policy if exists guestbook_public_read on public.guestbook;
create policy guestbook_public_read on public.guestbook
  for select to anon, authenticated using (true);

drop policy if exists guestbook_valid_insert on public.guestbook;
create policy guestbook_valid_insert on public.guestbook
  for insert to anon, authenticated
  with check (
    name is not null and message is not null
    and char_length(name) between 1 and 60
    and char_length(message) between 1 and 500
    and char_length(btrim(name)) >= 1
    and char_length(btrim(message)) >= 1
  );

commit;

-- Verify RLS and permissions after running the setup.
select relname, relrowsecurity, relforcerowsecurity
from pg_class where oid = 'public.guestbook'::regclass;
select policyname, cmd, roles from pg_policies
where schemaname = 'public' and tablename = 'guestbook';
select
  has_table_privilege('anon', 'public.guestbook', 'SELECT') as can_read,
  has_column_privilege('anon', 'public.guestbook', 'name', 'INSERT') as can_add_name,
  has_column_privilege('anon', 'public.guestbook', 'message', 'INSERT') as can_add_message,
  has_table_privilege('anon', 'public.guestbook', 'UPDATE') as can_edit,
  has_table_privilege('anon', 'public.guestbook', 'DELETE') as can_delete;
