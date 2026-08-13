-- Run this in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- Safe to run more than once — every statement is idempotent
-- (if not exists / or replace / drop-then-create), so if you already ran
-- an earlier version of this file, just re-run the whole thing to pick up
-- new tables/policies.
--
-- This creates the `projects`, `profiles`, and `follows` tables and the
-- Row Level Security (RLS) policies that are the actual access control
-- for this site: GitHub Pages only serves static files, so it's
-- Postgres/Supabase — not the browser — that enforces "only the owner can
-- edit/delete their project", "drafts are only visible to their owner",
-- and "you can only follow/unfollow as yourself".

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null default '',
  title text not null check (char_length(title) between 3 and 100),
  summary text not null default '',
  description text not null default '',
  image_url text not null default '',
  tags text[] not null default '{}',
  repo_url text not null default '',
  live_url text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- What kind of project this is — drives the badge/icon shown on cards and
-- the filter dropdown on projects.html. Kept as a plain checked text
-- column rather than a Postgres enum so adding a new type later is just
-- one more value in the check constraint, not a type migration.
alter table public.projects add column if not exists project_type text not null default 'other';

alter table public.projects drop constraint if exists projects_project_type_check;
alter table public.projects add constraint projects_project_type_check
  check (project_type in ('website', 'mobile_app', 'game', 'design', 'library', 'other'));

create index if not exists projects_user_id_idx on public.projects (user_id);
create index if not exists projects_published_idx on public.projects (published);

-- Keep updated_at current on every edit, server-side.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- Row Level Security: no one can read/write anything unless a policy below allows it.
alter table public.projects enable row level security;

-- Anyone (including signed-out visitors) can read published projects.
-- Signed-in users can also read their own unpublished drafts.
drop policy if exists "Published projects are publicly readable" on public.projects;
create policy "Published projects are publicly readable"
  on public.projects for select
  using (published = true or auth.uid() = user_id);

-- Signed-in users can only ever create projects owned by themselves.
drop policy if exists "Users can create their own projects" on public.projects;
create policy "Users can create their own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

-- Only the owner can update their project, and cannot reassign ownership.
drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Only the owner can delete their project.
drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Users can delete their own projects"
  on public.projects for delete
  using (auth.uid() = user_id);


-- ============================================================
-- Profiles — one row per account, holds the public-facing bits
-- (display name, bio, avatar) that a client is allowed to read
-- for *other* users. `auth.users` itself is never queryable from
-- the browser, so profile pages and follower lists read from here.
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Profiles are public — anyone can view anyone's profile page.
drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

-- Users can only ever create/update their own profile row.
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row the moment someone signs up, seeded from the
-- display name passed to signUp(). Runs with elevated privileges because
-- it needs to read the auth.users row that just triggered it.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: if you're adding profiles to a project that already had
-- users/projects, this creates a profile row for every existing account
-- (harmless to re-run — ON CONFLICT skips rows that already have one).
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;


-- ============================================================
-- Follows — who follows whom. A simple join table; "follower count"
-- and "following count" are just row counts, computed client-side.
-- ============================================================

create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_following_id_idx on public.follows (following_id);

alter table public.follows enable row level security;

-- Follow relationships are public (needed to show follower/following lists).
drop policy if exists "Follows are publicly readable" on public.follows;
create policy "Follows are publicly readable"
  on public.follows for select
  using (true);

-- You can only ever create a follow row where you are the follower.
drop policy if exists "Users can follow as themselves" on public.follows;
create policy "Users can follow as themselves"
  on public.follows for insert
  with check (auth.uid() = follower_id);

-- You can only ever remove your own follow row.
drop policy if exists "Users can unfollow as themselves" on public.follows;
create policy "Users can unfollow as themselves"
  on public.follows for delete
  using (auth.uid() = follower_id);


-- ============================================================
-- Admin role — a flag on profiles that grants moderation powers
-- (see admin.html): read every project regardless of owner/published
-- state, and unpublish/delete any project. There is no in-app way to
-- grant this — see the very bottom of this file for how to make an
-- account admin. That's deliberate: promoting someone to admin is not
-- something the client-side app should ever be able to do to itself.
-- ============================================================

alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Guards against privilege escalation: even though the "update own profile"
-- policy above lets you update your own row, this trigger silently discards
-- any change to is_admin unless the request is already coming from an
-- admin. Without this, anyone could call
-- supabase.from('profiles').update({ is_admin: true }) on themselves from
-- the browser console — RLS alone only checks *which row* you may touch,
-- not *which columns*.
create or replace function public.prevent_self_admin_promotion()
returns trigger as $$
begin
  if new.is_admin is distinct from old.is_admin then
    -- auth.uid() is NULL when this runs outside PostgREST (e.g. you,
    -- running SQL directly in the Supabase SQL Editor) — that path is
    -- already gated by owning the Supabase project, so let it through.
    -- Only block when there's a real (non-admin) end-user session behind
    -- the request — i.e. someone hitting this via the anon-key client.
    if auth.uid() is not null
       and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true) then
      new.is_admin = old.is_admin;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists profiles_guard_is_admin on public.profiles;
create trigger profiles_guard_is_admin
  before update on public.profiles
  for each row execute function public.prevent_self_admin_promotion();

-- Admins can see every project, including other users' drafts (needed for
-- the admin panel to list everything). Combines with the owner/published
-- policy above via OR — it only ever adds access, never removes any.
drop policy if exists "Admins can read all projects" on public.projects;
create policy "Admins can read all projects"
  on public.projects for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- Admins can unpublish or edit any project (moderation).
drop policy if exists "Admins can update any project" on public.projects;
create policy "Admins can update any project"
  on public.projects for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- Admins can delete any project (moderation).
drop policy if exists "Admins can delete any project" on public.projects;
create policy "Admins can delete any project"
  on public.projects for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- Lists every account for the admin panel's Users tab, including each
-- user's email and ban status — neither of which live in `profiles`
-- (email is never exposed there, and bans are tracked natively by
-- Supabase Auth on auth.users, not by this app). `security definer`
-- lets this function read auth.users despite normal client roles having
-- no access to it; the check below is what keeps that safe — only
-- callers who are already admins get any rows back.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  display_name text,
  avatar_url text,
  is_admin boolean,
  banned_until timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true) then
    raise exception 'Admin access required';
  end if;

  return query
    select u.id, u.email::text, p.display_name, p.avatar_url, p.is_admin, u.banned_until, p.created_at
    from auth.users u
    join public.profiles p on p.id = u.id
    order by p.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;


-- ============================================================
-- Comments — one row per comment on a project. Visibility piggybacks on
-- the `projects` policies above: "select 1 from projects where id = ..."
-- only finds a row at all if the *current caller* is allowed to see that
-- project (published, or its owner, or an admin), because that lookup is
-- itself subject to projects' own RLS. So a comment on someone's private
-- draft is never exposed, without duplicating the visibility rules here.
-- ============================================================

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null default '',
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists comments_project_id_idx on public.comments (project_id);

alter table public.comments enable row level security;

drop policy if exists "Comments are readable if their project is" on public.comments;
create policy "Comments are readable if their project is"
  on public.comments for select
  using (exists (select 1 from public.projects p where p.id = project_id));

-- Must be signed in, can only ever post as yourself, and the project has
-- to actually be visible to you (see the note above).
drop policy if exists "Signed-in users can comment on visible projects" on public.comments;
create policy "Signed-in users can comment on visible projects"
  on public.comments for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id)
  );

-- A comment can be removed by whoever wrote it, by the project's owner
-- (moderating their own project), or by a site admin.
drop policy if exists "Comment author, project owner, or admin can delete" on public.comments;
create policy "Comment author, project owner, or admin can delete"
  on public.comments for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
    or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin = true)
  );

-- ============================================================
-- Likes — one row per (project, user) like. Public read (so like counts
-- show even to signed-out visitors), but you can only ever like/unlike as
-- yourself, and only on a project you can actually see.
-- ============================================================

create table if not exists public.likes (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists likes_project_id_idx on public.likes (project_id);

alter table public.likes enable row level security;

drop policy if exists "Likes are publicly readable" on public.likes;
create policy "Likes are publicly readable"
  on public.likes for select
  using (true);

drop policy if exists "Signed-in users can like as themselves" on public.likes;
create policy "Signed-in users can like as themselves"
  on public.likes for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id)
  );

drop policy if exists "Users can remove their own like" on public.likes;
create policy "Users can remove their own like"
  on public.likes for delete
  using (auth.uid() = user_id);


-- ============================================================
-- Views — a public running counter per project (projects.views_count),
-- plus a private log (project_views) that only the project's owner or an
-- admin can read, used to draw the "views over time" chart on the
-- dashboard. Both are only ever written through log_project_view() below
-- (security definer), never by a direct client insert/update — that's
-- what lets a signed-out visitor's page view count at all, without
-- opening up public write access to the projects table itself.
-- ============================================================

alter table public.projects add column if not exists views_count integer not null default 0;

create table if not exists public.project_views (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists project_views_project_id_idx on public.project_views (project_id);
create index if not exists project_views_created_at_idx on public.project_views (created_at);

alter table public.project_views enable row level security;

drop policy if exists "Project owner or admin can read the view log" on public.project_views;
create policy "Project owner or admin can read the view log"
  on public.project_views for select
  using (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
    or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin = true)
  );

create or replace function public.log_project_view(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.projects where id = p_project_id) then
    insert into public.project_views (project_id) values (p_project_id);
    update public.projects set views_count = views_count + 1 where id = p_project_id;
  end if;
end;
$$;

grant execute on function public.log_project_view(uuid) to anon, authenticated;

-- ---------------------------------------------------------------
-- To make an account admin, run this separately in the SQL Editor
-- (this does NOT run automatically as part of this file — uncomment
-- and edit the email first):
--
-- update public.profiles set is_admin = true
-- where id = (select id from auth.users where email = 'you@example.com');
-- ---------------------------------------------------------------
