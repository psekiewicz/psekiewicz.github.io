-- Minimal stand-ins for the parts of a real Supabase project that
-- schema.sql assumes already exist: the `auth` schema (just enough of
-- `auth.users` to satisfy the foreign keys and the on-signup trigger),
-- `auth.uid()`, and the `anon`/`authenticated`/`service_role` roles with
-- the same blanket object grants a real Supabase project bootstraps for
-- them (RLS, not object grants, is what's actually meant to restrict
-- access - see schema.sql's own comments).
--
-- This exists ONLY so schema.sql's RLS policies can be exercised against
-- a plain local Postgres in tests/rls.test.js. It is never meant to run
-- against a real Supabase project, which already provides all of this
-- for real via GoTrue + PostgREST.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- Real Supabase's auth.uid() reads the "sub" claim off the request's JWT,
-- which PostgREST exposes to Postgres as the request.jwt.claims GUC. Tests
-- set that GUC directly (see setUser() in rls.test.js) instead of forging
-- a real JWT.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;

-- So that objects schema.sql is about to create (it runs right after this
-- file) get the same grants without listing them one by one.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
