-- The whole database of Supabase project tgikpcvkkkbkqtahmczt after XOXD
-- was shut down. Only the audio guide (Przewodnik, Wczasy Bez Kasy) uses
-- it: its content sits in the public `przewodnik` bucket, and accounts with
-- the guide_editor rank may change it. przewodnik/ on this site is the
-- guide's privacy policy.

create table if not exists public.user_ranks (
  user_id uuid not null references auth.users (id) on delete cascade,
  rank text not null check (rank = 'guide_editor'),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, rank)
);
create index if not exists user_ranks_granted_by_idx on public.user_ranks (granted_by);

alter table public.user_ranks enable row level security;
revoke all on public.user_ranks from anon, authenticated;
grant select on public.user_ranks to authenticated;

create policy "Users can see their own ranks"
  on public.user_ranks for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.has_rank(p_rank text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.user_ranks r
    where r.user_id = (select auth.uid()) and r.rank = p_rank
  );
$$;
revoke execute on function public.has_rank(text) from public, anon;
grant execute on function public.has_rank(text) to authenticated;

-- Pinged by .github/workflows/supabase-keepalive.yml so the free-tier
-- project never pauses (it would after 7 days without requests).
create or replace function public.keepalive()
returns boolean
language sql
stable
set search_path = ''
as $$ select true $$;
revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('przewodnik', 'przewodnik', true, 52428800,
        array['application/json', 'image/jpeg', 'image/png', 'audio/mpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Guide editors can list przewodnik"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'przewodnik' and (select public.has_rank('guide_editor')));

create policy "Guide editors can upload to przewodnik"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'przewodnik' and (select public.has_rank('guide_editor')));

create policy "Guide editors can replace in przewodnik"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'przewodnik' and (select public.has_rank('guide_editor')))
  with check (bucket_id = 'przewodnik' and (select public.has_rank('guide_editor')));

create policy "Guide editors can delete from przewodnik"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'przewodnik' and (select public.has_rank('guide_editor')));
