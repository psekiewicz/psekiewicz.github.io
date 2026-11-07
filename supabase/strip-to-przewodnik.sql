-- One-off: removes XOXD from the shared Supabase project and leaves only
-- what the audio guide (Przewodnik) needs. Run once in the SQL Editor.
-- After it the database matches supabase/schema.sql.
begin;

select cron.unschedule(jobname) from cron.job
 where jobname in ('announcement-cleanup', 'upload-cleanup');

drop trigger if exists on_auth_user_created on auth.users;

drop policy if exists "Admins can remove announcement media" on storage.objects;
drop policy if exists "Admins can replace announcement media" on storage.objects;
drop policy if exists "Admins can upload announcement media" on storage.objects;
drop policy if exists "People remove their own uploads" on storage.objects;
drop policy if exists "People see their own uploads" on storage.objects;
drop policy if exists "People upload into their own folder" on storage.objects;
drop policy if exists "Admins can see all ranks" on public.user_ranks;

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('v', 'm') loop
    execute format('drop view if exists public.%I cascade', r.relname);
  end loop;
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'user_ranks' loop
    execute format('drop table if exists public.%I cascade', r.relname);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname not in ('has_rank', 'keepalive')
             and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

create or replace function public.keepalive()
returns boolean
language sql
stable
set search_path = ''
as $$ select true $$;
revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

delete from auth.users where email <> 'peter.sekiewicz@gmail.com';

commit;
