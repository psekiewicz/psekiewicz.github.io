-- Run this in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- Safe to run more than once - every statement is idempotent
-- (if not exists / or replace / drop-then-create), so if you already ran
-- an earlier version of this file, just re-run the whole thing to pick up
-- new tables/policies.
--
-- This creates the `projects`, `profiles`, and `follows` tables and the
-- Row Level Security (RLS) policies that are the actual access control
-- for this site: GitHub Pages only serves static files, so it's
-- Postgres/Supabase - not the browser - that enforces "only the owner can
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

-- What kind of thing this is - drives the badge/icon on cards and the
-- filter dropdown. Kept as a plain checked text column rather than a
-- Postgres enum so changing the list is a constraint swap, not a type
-- migration, which is exactly what the move below needs.
alter table public.projects add column if not exists project_type text not null default 'other';

-- The link that makes an entry playable: a YouTube/Vimeo/Spotify/SoundCloud
-- page, or a direct URL to an audio, video or image file. js/media.js
-- decides what it can do with it; nothing here trusts the string.
alter table public.projects add column if not exists media_url text not null default '';

-- The type list used to describe *projects* (website, library, design).
-- It now describes *media*, which is what people come here to find.
--
-- Order matters and is not obvious: the old constraint has to go FIRST.
-- Rewriting the values while it is still in place makes the UPDATE itself
-- illegal - 'app' and 'image' aren't in the old list, so the very
-- statement doing the migration trips the check it is migrating away from.
alter table public.projects drop constraint if exists projects_project_type_check;

update public.projects set project_type = case project_type
    when 'website' then 'app'
    when 'mobile_app' then 'app'
    when 'game' then 'app'
    when 'library' then 'app'
    when 'design' then 'image'
    else project_type
  end
where project_type in ('website', 'mobile_app', 'game', 'library', 'design');

-- Anything unexpected (a row written by a client mid-migration) lands on
-- 'other' rather than blocking the constraint from being added at all.
update public.projects set project_type = 'other'
where project_type not in ('music', 'video', 'image', 'app', 'other');

alter table public.projects add constraint projects_project_type_check
  check (project_type in ('music', 'video', 'image', 'app', 'other'));

create index if not exists projects_user_id_idx on public.projects (user_id);
create index if not exists projects_published_idx on public.projects (published);

-- Keep updated_at current on every edit, server-side.
--
-- The dashboard and the admin table show it as "last updated", so only an
-- edit moves it. The counters on the row (views, likes, comments) change on
-- their own whenever somebody looks, likes or comments, and that is not the
-- owner editing anything - it used to make every counted view read as an
-- edit a minute ago.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  if (to_jsonb(new) - array['views_count', 'likes_count', 'comments_count', 'updated_at'])
     = (to_jsonb(old) - array['views_count', 'likes_count', 'comments_count', 'updated_at']) then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- Same idea for projects. Things a client must not set:
--
-- views_count - owners can legitimately update their own row, so nothing
-- stopped them writing views_count directly, and that number feeds the
-- feed ranking. It is only ever meant to move through log_project_view().
--
-- likes_count, comments_count - the same: counters kept by the triggers in
-- the "Like and comment counts" section below, never by the owner.
--
-- author_name - a denormalised copy of the owner's display name. It was
-- whatever the client sent, so a project could be published under someone
-- else's name. It is now always derived from the owning profile.
create or replace function public.guard_project_client_writes()
returns trigger as $$
declare
  v_display_name text;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' then
      new.views_count := old.views_count;
      new.likes_count := old.likes_count;
      new.comments_count := old.comments_count;
    else
      new.views_count := 0;
      new.likes_count := 0;
      new.comments_count := 0;
    end if;

    select display_name into v_display_name from public.profiles where id = new.user_id;
    new.author_name := coalesce(v_display_name, '');
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists projects_guard_client_writes on public.projects;
create trigger projects_guard_client_writes
  before insert or update on public.projects
  for each row execute function public.guard_project_client_writes();

-- Row Level Security: no one can read/write anything unless a policy below allows it.
alter table public.projects enable row level security;

-- Anyone (including signed-out visitors) can read published projects.
-- Signed-in users can also read their own unpublished drafts.
drop policy if exists "Published projects are publicly readable" on public.projects;
create policy "Published projects are publicly readable"
  on public.projects for select
  using (published = true or (select auth.uid()) = user_id);

-- Signed-in users can only ever create projects owned by themselves.
drop policy if exists "Users can create their own projects" on public.projects;
create policy "Users can create their own projects"
  on public.projects for insert
  with check ((select auth.uid()) = user_id);

-- Only the owner can update their project, and cannot reassign ownership.
drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects"
  on public.projects for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Only the owner can delete their project.
drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Users can delete their own projects"
  on public.projects for delete
  using ((select auth.uid()) = user_id);


-- The Scrolls card is a full-screen portrait, which a landscape thumbnail
-- rarely suits, so a project can carry its own image just for that feed.
-- Optional; empty falls back to the project's normal image.
alter table public.projects add column if not exists scroll_image_url text not null default '';

-- Nothing in this repository reads or writes this. It reached the live
-- database without ever being committed (a preset background for the old
-- Scrolls cards, by the look of the names) and every row holds ''. It is
-- recorded so this file describes the database as it is; delete these lines
-- together with `alter table public.projects drop column scroll_bg` when
-- tidying up.
alter table public.projects add column if not exists scroll_bg text not null default '';
alter table public.projects drop constraint if exists projects_scroll_bg_check;
alter table public.projects add constraint projects_scroll_bg_check
  check (scroll_bg in ('', 'dusk', 'ocean', 'forest', 'ember', 'violet'));


-- ============================================================
-- Profiles - one row per account, holds the public-facing bits
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

-- Profiles are public - anyone can view anyone's profile page.
drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

-- Users can only ever create/update their own profile row.
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

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
-- (harmless to re-run - ON CONFLICT skips rows that already have one).
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;


-- ============================================================
-- Follows - who follows whom. A simple join table; "follower count"
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
  with check ((select auth.uid()) = follower_id);

-- You can only ever remove your own follow row.
drop policy if exists "Users can unfollow as themselves" on public.follows;
create policy "Users can unfollow as themselves"
  on public.follows for delete
  using ((select auth.uid()) = follower_id);


-- ============================================================
-- Admin role - a flag on profiles that grants moderation powers
-- (see admin.html): read every project regardless of owner/published
-- state, and unpublish/delete any project. There is no in-app way to
-- grant this - see the very bottom of this file for how to make an
-- account admin. That's deliberate: promoting someone to admin is not
-- something the client-side app should ever be able to do to itself.
-- ============================================================

alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Guards against privilege escalation: even though the "update own profile"
-- policy above lets you update your own row, this trigger silently discards
-- any change to is_admin unless the request is already coming from an
-- admin. Without this, anyone could call
-- supabase.from('profiles').update({ is_admin: true }) on themselves from
-- the browser console - RLS alone only checks *which row* you may touch,
-- not *which columns*.
create or replace function public.prevent_self_admin_promotion()
returns trigger as $$
begin
  if new.is_admin is distinct from old.is_admin then
    -- auth.uid() is NULL when this runs outside PostgREST (e.g. you,
    -- running SQL directly in the Supabase SQL Editor) - that path is
    -- already gated by owning the Supabase project, so let it through.
    -- Only block when there's a real (non-admin) end-user session behind
    -- the request - i.e. someone hitting this via the anon-key client.
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
-- policy above via OR - it only ever adds access, never removes any.
drop policy if exists "Admins can read all projects" on public.projects;
create policy "Admins can read all projects"
  on public.projects for select
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true));

-- Admins can unpublish or edit any project (moderation).
drop policy if exists "Admins can update any project" on public.projects;
create policy "Admins can update any project"
  on public.projects for update
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true));

-- Admins can delete any project (moderation).
drop policy if exists "Admins can delete any project" on public.projects;
create policy "Admins can delete any project"
  on public.projects for delete
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true));

-- Lists every account for the admin panel's Users tab, including each
-- user's email and ban status - neither of which live in `profiles`
-- (email is never exposed there, and bans are tracked natively by
-- Supabase Auth on auth.users, not by this app). `security definer`
-- lets this function read auth.users despite normal client roles having
-- no access to it; the check below is what keeps that safe - only
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
-- Comments - one row per comment on a project. Visibility piggybacks on
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

-- A comment's author_name was also whatever the client sent, so a comment
-- could be posted under someone else's name from your own account. Derived
-- from the owning profile like projects above.
create or replace function public.guard_comment_client_writes()
returns trigger as $$
declare
  v_display_name text;
begin
  if current_user in ('authenticated', 'anon') then
    select display_name into v_display_name from public.profiles where id = new.user_id;
    new.author_name := coalesce(v_display_name, '');
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists comments_guard_client_writes on public.comments;
create trigger comments_guard_client_writes
  before insert or update on public.comments
  for each row execute function public.guard_comment_client_writes();

-- author_name is a denormalised copy, so the two guards above only keep it
-- honest at write time: renaming yourself used to leave every project and
-- comment you had already posted showing the old name forever. Propagating
-- the rename here keeps the copies true without the client ever being
-- trusted to update them. Defined after comments so both tables exist.
create or replace function public.sync_author_name()
returns trigger as $$
begin
  if new.display_name is distinct from old.display_name then
    update public.projects set author_name = new.display_name where user_id = new.id;
    update public.comments set author_name = new.display_name where user_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists profiles_sync_author_name on public.profiles;
create trigger profiles_sync_author_name
  after update on public.profiles
  for each row execute function public.sync_author_name();

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
    (select auth.uid()) = user_id
    and exists (select 1 from public.projects p where p.id = project_id)
  );

-- A comment can be removed by whoever wrote it, by the project's owner
-- (moderating their own project), or by a site admin.
drop policy if exists "Comment author, project owner, or admin can delete" on public.comments;
create policy "Comment author, project owner, or admin can delete"
  on public.comments for delete
  using (
    (select auth.uid()) = user_id
    or exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
    or exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.is_admin = true)
  );

-- ============================================================
-- Likes - one row per (project, user) like. Public read (so like counts
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

-- Self-likes are rejected outright rather than filtered out later. Likes
-- are now worth XP and points, so "like your own entry" would be the
-- cheapest possible way to print currency.
drop policy if exists "Signed-in users can like as themselves" on public.likes;
create policy "Signed-in users can like as themselves"
  on public.likes for insert
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id <> (select auth.uid()))
  );

delete from public.likes l
using public.projects p
where p.id = l.project_id and p.user_id = l.user_id;

drop policy if exists "Users can remove their own like" on public.likes;
create policy "Users can remove their own like"
  on public.likes for delete
  using ((select auth.uid()) = user_id);


-- ============================================================
-- Like and comment counts, kept on the project row.
--
-- Pages used to count by fetching every like and comment row for a page of
-- entries and tallying them in the browser. PostgREST returns at most 1000
-- rows, unordered, so past that the tallies came out short - for whichever
-- entries the cut happened to land on - and the feed ranking ran on wrong
-- numbers without anything saying so. Now each insert or delete moves a
-- counter on the project, and a page reads one row per entry.
--
-- security definer because the person liking is not the project's owner,
-- so their own rights could never update the row. The counters are pinned
-- against client writes by guard_project_client_writes() above, and
-- set_updated_at() does not treat them moving as an edit.
-- ============================================================

alter table public.projects add column if not exists likes_count integer not null default 0;
alter table public.projects add column if not exists comments_count integer not null default 0;

create or replace function public.count_project_reactions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid := case when tg_op = 'INSERT' then new.project_id else old.project_id end;
  v_delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  -- A project being deleted takes its likes and comments with it; by then
  -- its row is already gone and these simply match nothing.
  if tg_table_name = 'likes' then
    update public.projects set likes_count = greatest(0, likes_count + v_delta) where id = v_project;
  else
    update public.projects set comments_count = greatest(0, comments_count + v_delta) where id = v_project;
  end if;
  return null;
end;
$$;

revoke execute on function public.count_project_reactions() from public, anon, authenticated;

drop trigger if exists likes_count_reactions on public.likes;
create trigger likes_count_reactions
  after insert or delete on public.likes
  for each row execute function public.count_project_reactions();

drop trigger if exists comments_count_reactions on public.comments;
create trigger comments_count_reactions
  after insert or delete on public.comments
  for each row execute function public.count_project_reactions();

-- Brings every counter in line with the rows behind it: the first time
-- this runs, and again on any re-run, so a counter that has drifted for any
-- reason is put right by running the file. Rows already correct are left
-- alone.
update public.projects p
set likes_count = c.likes, comments_count = c.comments
from (
  select pr.id,
         (select count(*) from public.likes l where l.project_id = pr.id)::integer as likes,
         (select count(*) from public.comments cm where cm.project_id = pr.id)::integer as comments
  from public.projects pr
) c
where c.id = p.id
  and (p.likes_count, p.comments_count) is distinct from (c.likes, c.comments);


-- ============================================================
-- Views - a public running counter per project (projects.views_count),
-- plus a private log (project_views) that only the project's owner or an
-- admin can read, used to draw the "views over time" chart on the
-- dashboard. Both are only ever written through log_project_view() below
-- (security definer), never by a direct client insert/update - that's
-- what lets a signed-out visitor's page view count at all, without
-- opening up public write access to the projects table itself.
-- ============================================================

alter table public.projects add column if not exists views_count integer not null default 0;

create table if not exists public.project_views (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Who viewed, so a view can be counted once per person instead of once per
-- page load. Nullable because signed-out visitors are still counted in the
-- public number - they just can't be told apart, which is exactly why they
-- earn nothing (see user_reputation below).
alter table public.project_views add column if not exists viewer_id uuid references auth.users (id) on delete set null;

create index if not exists project_views_project_id_idx on public.project_views (project_id);
create index if not exists project_views_created_at_idx on public.project_views (created_at);
create index if not exists project_views_viewer_idx on public.project_views (project_id, viewer_id, created_at);

alter table public.project_views enable row level security;

-- No select policy at all any more: the log now carries viewer identity, and
-- the owner-readable policy would have turned the dashboard chart into a
-- "who looked at your entry" list nobody agreed to. The chart reads
-- timestamps through the definer function below, which returns no ids.
drop policy if exists "Project owner or admin can read the view log" on public.project_views;

-- Returns whether the view was actually counted, so the page can move its
-- counter only when the number behind it moved. It used to return void and
-- the UI incremented optimistically, which was fine when every call
-- counted - now that own views and rapid re-views don't, that would show
-- the owner a number nobody else can see. The drop is needed because a
-- return type can't be changed by `create or replace`.
drop function if exists public.log_project_view(uuid);

-- ---------------------------------------------------------------
-- Signed-out views
--
-- A signed-out visitor has no id, so for a long time every call from one
-- counted: anyone holding the public anon key could call
-- log_project_view() in a loop, and every call added a row here for good.
-- On the free tier's 500 MB that was a way to fill the database, and since
-- views divide the feed's reaction rate (js/feed-rank.js) and switch off
-- its boost for new entries at 40, pumping someone else's entry was a way
-- to push it down the feed.
--
-- Two things now bound it:
--
--   - The same address counts once per entry per 6 hours, the way a
--     signed-in viewer does. The address itself is never stored: it is
--     hashed together with a random salt that changes every day, kept 6
--     hours to answer "seen already?", then deleted. Without the day's
--     salt - which is deleted too - a hash cannot be turned back into an
--     address.
--   - However many addresses there are, at most 60 signed-out views per
--     entry per hour count.
-- ---------------------------------------------------------------

create table if not exists public.view_salts (
  day date primary key,
  salt bytea not null
);

create table if not exists public.anon_view_marks (
  project_id uuid not null references public.projects (id) on delete cascade,
  viewer_hash bytea not null,
  created_at timestamptz not null default now(),
  primary key (project_id, viewer_hash)
);

create index if not exists anon_view_marks_created_idx on public.anon_view_marks (created_at);

-- Only log_project_view() touches either, as their owner.
alter table public.view_salts enable row level security;
alter table public.anon_view_marks enable row level security;
revoke all on public.view_salts from anon, authenticated;
revoke all on public.anon_view_marks from anon, authenticated;

-- The caller's address as Supabase's gateway reports it: Cloudflare's
-- header first, since a client cannot set it through Cloudflare, then the
-- first X-Forwarded-For entry. Null outside an API request (the SQL Editor,
-- the tests), which simply skips the per-address check.
create or replace function public.request_ip()
returns text
language sql
stable
set search_path = public
as $$
  select nullif(btrim(coalesce(
    h ->> 'cf-connecting-ip',
    split_part(h ->> 'x-forwarded-for', ',', 1),
    h ->> 'x-real-ip'
  )), '')
  from (select nullif(current_setting('request.headers', true), '')::json as h) headers;
$$;

revoke execute on function public.request_ip() from public, anon, authenticated;

create or replace function public.log_project_view(p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_uid uuid := auth.uid();
  v_ip text;
  v_salt bytea;
  v_hash bytea;
begin
  select user_id into v_owner from public.projects where id = p_project_id;
  if v_owner is null then
    return false;
  end if;

  -- Reloading your own entry used to mint views, and views drive XP, the
  -- leaderboard, the Scrolls ranking and now real currency.
  if v_uid = v_owner then
    return false;
  end if;

  -- One view per signed-in viewer per 6h.
  if v_uid is not null and exists (
    select 1 from public.project_views
    where project_id = p_project_id and viewer_id = v_uid and created_at > now() - interval '6 hours'
  ) then
    return false;
  end if;

  -- Signed out: see "Signed-out views" above.
  if v_uid is null then
    if (
      select count(*) from public.project_views
      where project_id = p_project_id and viewer_id is null and created_at > now() - interval '1 hour'
    ) >= 60 then
      return false;
    end if;

    v_ip := public.request_ip();
    if v_ip is not null then
      insert into public.view_salts (day, salt)
      values (current_date, uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()))
      on conflict (day) do nothing;
      select salt into v_salt from public.view_salts where day = current_date;
      delete from public.view_salts where day < current_date;

      v_hash := sha256(v_salt || convert_to(v_ip, 'UTF8'));
      delete from public.anon_view_marks where created_at <= now() - interval '6 hours';
      insert into public.anon_view_marks (project_id, viewer_hash)
      values (p_project_id, v_hash)
      on conflict (project_id, viewer_hash) do nothing;
      if not found then
        return false;
      end if;
    end if;
  end if;

  insert into public.project_views (project_id, viewer_id) values (p_project_id, v_uid);
  update public.projects set views_count = views_count + 1 where id = p_project_id;
  return true;
end;
$$;

grant execute on function public.log_project_view(uuid) to anon, authenticated;

-- Timestamps only, for the dashboard chart - never viewer ids, and only
-- ever for projects the caller owns.
create or replace function public.my_view_timestamps(p_days integer default 14)
returns setof timestamptz
language sql
security definer
set search_path = public
as $$
  select v.created_at
  from public.project_views v
  join public.projects p on p.id = v.project_id
  where p.user_id = auth.uid()
    and v.created_at > now() - make_interval(days => greatest(1, least(365, p_days)));
$$;

grant execute on function public.my_view_timestamps(integer) to authenticated;

-- ============================================================
-- Points & Shop - achievements (see js/achievements.js) pay out points
-- once each, server-verified so the payout can't be forged from the
-- browser console; points are spendable on cosmetic profile items
-- (backgrounds, avatar borders, nickname effects - see js/shop-items.js).
-- ============================================================

alter table public.profiles add column if not exists points integer not null default 0;
-- How much of the earnings figure has already been paid out. Declared here
-- rather than next to collect_earnings() at the bottom of the file so the
-- guard below can pin it - it is every bit as forgeable as points itself:
-- setting it negative would make the next collect pay the difference.
alter table public.profiles add column if not exists points_earned_total integer not null default 0;
alter table public.profiles add column if not exists equipped_bg text not null default 'none';
alter table public.profiles add column if not exists equipped_border text not null default 'none';
alter table public.profiles add column if not exists equipped_name_effect text not null default 'none';

-- Columns a signed-in client must never write directly.
--
-- This was originally `revoke update (points) ... from authenticated`,
-- which does nothing: in Postgres a table-level UPDATE grant covers every
-- column, and revoking one column back does not override it. Points were
-- forgeable the whole time with a plain
-- `supabase.from('profiles').update({ points: 999999 })`.
--
-- A trigger is the robust control because it doesn't depend on grant
-- ordering, and nothing Supabase re-grants later can silently undo it.
-- Deliberately NOT `security definer`: current_user has to stay the role
-- actually executing, so a direct PostgREST call shows up as
-- authenticated/anon while claim_achievement()/purchase_item() (which are
-- security definer) run as their owner and pass straight through.
create or replace function public.guard_profile_client_writes()
returns trigger as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.points := old.points;
    new.points_earned_total := old.points_earned_total;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists profiles_guard_client_writes on public.profiles;
create trigger profiles_guard_client_writes
  before update on public.profiles
  for each row execute function public.guard_profile_client_writes();

-- One row per (user, achievement) the user has ever earned. This is what
-- makes achievements permanent: they're recorded the moment they're first
-- earned, so deleting the project (or losing the likes/followers) that
-- earned one doesn't take the badge away again.
--
-- `claimed_at` is NULL for "earned but the reward hasn't been collected
-- yet" and set once claim_achievement() pays out - that split is what lets
-- a row exist from the moment of unlocking without the payout logic
-- mistaking it for an already-paid claim.
create table if not exists public.unlocked_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- Migration for databases created before unlocks were recorded separately
-- from claims: back then every row meant "claimed", and the column was
-- NOT NULL DEFAULT now(). Existing rows keep their timestamp (they really
-- were claimed), new rows now decide for themselves.
alter table public.unlocked_achievements alter column claimed_at drop not null;
alter table public.unlocked_achievements alter column claimed_at drop default;

alter table public.unlocked_achievements enable row level security;

-- Public read, like likes/follows/owned_items: a profile page has to be
-- able to show *anyone's* permanently-earned badges, not just your own,
-- and this exposes nothing that wasn't already visible on the profile.
drop policy if exists "Users can read their own claimed achievements" on public.unlocked_achievements;
drop policy if exists "Unlocked achievements are publicly readable" on public.unlocked_achievements;
create policy "Unlocked achievements are publicly readable"
  on public.unlocked_achievements for select
  using (true);

-- Deliberately no insert/update/delete policy for this table: rows are
-- only ever written by record_achievement_unlock()/claim_achievement()
-- (both security definer), which re-check eligibility server-side.


-- One row per (user, item) the user has purchased from the shop.
create table if not exists public.owned_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  purchased_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.owned_items enable row level security;

-- Public read (like likes/follows/comments) rather than owner-only: the
-- "Collector" achievement (own 5+ shop items) needs to be checkable on
-- anyone's profile, not just your own, and there's nothing sensitive about
-- what cosmetics someone has bought.
drop policy if exists "Users can read their own owned items" on public.owned_items;
drop policy if exists "Owned items are publicly readable" on public.owned_items;
create policy "Owned items are publicly readable"
  on public.owned_items for select
  using (true);

-- Deliberately no insert/update/delete policy here either: rows are only
-- ever written by purchase_item() (security definer), which re-checks the
-- price and balance server-side.

-- Achievement definitions live in a table, not hardcoded in a function, so
-- adding one later (or tweaking a threshold/reward) is a single small
-- INSERT/UPDATE instead of a CREATE OR REPLACE FUNCTION covering all of
-- them at once - much easier to paste into the SQL Editor incrementally.
-- `metric` picks which measurement achievement_metric() below computes;
-- several achievements share the same metric at different thresholds
-- (e.g. 'total_likes' backs both well-liked and crowd-favorite).
create table if not exists public.achievement_defs (
  id text primary key,
  metric text not null,
  threshold numeric not null,
  reward integer not null
);

alter table public.achievement_defs enable row level security;

drop policy if exists "Achievement definitions are publicly readable" on public.achievement_defs;
create policy "Achievement definitions are publicly readable"
  on public.achievement_defs for select
  using (true);

-- No insert/update/delete policy: this table is config, only ever edited
-- by the site owner directly in the SQL Editor, never by client code.

-- Computes one named metric for one user, mirroring the stat calculations
-- in js/achievements.js's getUserStats() rather than trusting a
-- client-passed stats object.
create or replace function public.achievement_metric(p_uid uuid, p_metric text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
begin
  case p_metric
    when 'published_projects' then
      return (select count(*) from public.projects where user_id = p_uid and published = true);
    when 'total_likes' then
      return (
        select count(*) from public.likes l join public.projects p on p.id = l.project_id
        where p.user_id = p_uid and p.published = true
      );
    when 'total_views' then
      return (select coalesce(sum(views_count), 0) from public.projects where user_id = p_uid and published = true);
    -- Reach metrics come from the user_reputation view (defined at the
    -- bottom of this file) so there is exactly one definition of "a
    -- distinct viewer" and "a comment someone else left you".
    when 'unique_viewers' then
      return (select coalesce(unique_viewers, 0) from public.user_reputation where user_id = p_uid);
    when 'comments_received' then
      return (select coalesce(comments_received, 0) from public.user_reputation where user_id = p_uid);
    when 'releases' then
      return (select coalesce(releases, 0) from public.user_reputation where user_id = p_uid);
    when 'demo_projects' then
      return (select coalesce(demo_projects, 0) from public.user_reputation where user_id = p_uid);
    when 'comment_count' then
      return (select count(*) from public.comments where user_id = p_uid);
    when 'follower_count' then
      return (select count(*) from public.follows where following_id = p_uid);
    when 'following_count' then
      return (select count(*) from public.follows where follower_id = p_uid);
    when 'owned_items_count' then
      return (select count(*) from public.owned_items where user_id = p_uid);
    when 'account_age_days' then
      return (select extract(epoch from (now() - created_at)) / 86400 from public.profiles where id = p_uid);
    when 'profile_complete' then
      return (select case when bio <> '' and avatar_url <> '' then 1 else 0 end from public.profiles where id = p_uid);
    when 'stylized' then
      return (
        select case when equipped_bg <> 'none' and equipped_border <> 'none' and equipped_name_effect <> 'none' then 1 else 0 end
        from public.profiles where id = p_uid
      );
    else
      raise exception 'Unknown metric: %', p_metric;
  end case;
end;
$$;

-- Records an achievement as permanently earned, without paying anything
-- out. The client calls this the first time it notices an achievement has
-- become earned; the eligibility check here is what stops it from being
-- used to award arbitrary badges from the browser console.
create or replace function public.record_achievement_unlock(p_achievement_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_def record;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  select * into v_def from public.achievement_defs where id = p_achievement_id;
  if not found then
    raise exception 'Unknown achievement: %', p_achievement_id;
  end if;

  -- coalesce: a metric with nothing to measure is nothing earned. Without
  -- it a NULL would fail the comparison and pass the check.
  if coalesce(public.achievement_metric(v_uid, v_def.metric), 0) < v_def.threshold then
    raise exception 'Achievement not yet earned';
  end if;

  insert into public.unlocked_achievements (user_id, achievement_id, claimed_at)
  values (v_uid, p_achievement_id, null)
  on conflict (user_id, achievement_id) do nothing;
end;
$$;

grant execute on function public.record_achievement_unlock(text) to authenticated;

-- Looks up the achievement's metric/threshold/reward from achievement_defs,
-- re-checks eligibility server-side (never trusts the client), and pays
-- out the reward exactly once.
create or replace function public.claim_achievement(p_achievement_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_def record;
  v_recorded boolean;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  select * into v_def from public.achievement_defs where id = p_achievement_id;
  if not found then
    raise exception 'Unknown achievement: %', p_achievement_id;
  end if;

  v_recorded := exists (
    select 1 from public.unlocked_achievements
    where user_id = v_uid and achievement_id = p_achievement_id
  );

  -- An already-recorded achievement stays claimable even if the activity
  -- behind it is gone (the project was deleted, likes were withdrawn) -
  -- it was verified server-side when it was recorded, and achievements are
  -- permanent. Only a first-time claim has to prove eligibility now.
  if not v_recorded and coalesce(public.achievement_metric(v_uid, v_def.metric), 0) < v_def.threshold then
    raise exception 'Achievement not yet earned';
  end if;

  insert into public.unlocked_achievements (user_id, achievement_id, claimed_at)
  values (v_uid, p_achievement_id, now())
  on conflict (user_id, achievement_id) do update set claimed_at = now()
  where public.unlocked_achievements.claimed_at is null;

  -- FOUND is true only when a row was actually inserted or updated above.
  -- The `where claimed_at is null` guard means a second claim matches
  -- nothing, so the reward can never be paid twice - while an unlock that
  -- was merely recorded (claimed_at NULL) still pays out the first time.
  if found then
    update public.profiles set points = points + v_def.reward where id = v_uid;
  end if;

  return (select points from public.profiles where id = v_uid);
end;
$$;

grant execute on function public.claim_achievement(text) to authenticated;

-- The reward/threshold values here are the source of truth; js/achievements.js's
-- `reward` field (and the >= thresholds in its `check` functions) are a
-- display-only copy that must be kept in sync by hand.
insert into public.achievement_defs (id, metric, threshold, reward) values
  ('launched', 'published_projects', 1, 20),
  ('builder', 'published_projects', 5, 60),
  ('prolific', 'published_projects', 10, 90),
  ('well-liked', 'total_likes', 10, 30),
  ('crowd-favorite', 'total_likes', 50, 100),
  ('icon', 'total_likes', 100, 150),
  ('veteran', 'account_age_days', 365, 50),
  ('old-timer', 'account_age_days', 730, 90),
  ('conversationalist', 'comment_count', 10, 40),
  ('chatterbox', 'comment_count', 25, 70),
  ('influencer', 'follower_count', 10, 80),
  ('popular', 'follower_count', 50, 140),
  ('social-butterfly', 'following_count', 10, 25),
  ('viral', 'unique_viewers', 500, 90),
  ('reached', 'unique_viewers', 100, 120),
  ('talked-about', 'comments_received', 25, 80),
  ('collector', 'owned_items_count', 5, 70),
  ('trendsetter', 'stylized', 1, 60),
  ('all-set', 'profile_complete', 1, 15),
  ('shipper', 'demo_projects', 1, 40),
  ('maintainer', 'releases', 5, 60)
on conflict (id) do update set
  metric = excluded.metric,
  threshold = excluded.threshold,
  reward = excluded.reward;

-- Shop prices live in a table for the same reason achievement_defs does:
-- adding an item later is a one-line INSERT instead of a CREATE OR REPLACE
-- FUNCTION covering the whole catalog at once.
create table if not exists public.shop_item_defs (
  id text primary key,
  price integer not null check (price >= 0)
);

alter table public.shop_item_defs enable row level security;

drop policy if exists "Shop prices are publicly readable" on public.shop_item_defs;
create policy "Shop prices are publicly readable"
  on public.shop_item_defs for select
  using (true);

-- No insert/update/delete policy: this table is config, only ever edited
-- by the site owner directly in the SQL Editor, never by client code.

-- Charges points and records ownership atomically, reading the price from
-- shop_item_defs rather than trusting anything the client sends. Buying
-- something already owned is a harmless no-op rather than an error, so a
-- double-click can't double-charge.
create or replace function public.purchase_item(p_item_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_price integer;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  select price into v_price from public.shop_item_defs where id = p_item_id;
  if not found then
    raise exception 'Unknown item: %', p_item_id;
  end if;

  if exists (select 1 from public.owned_items where user_id = v_uid and item_id = p_item_id) then
    return (select points from public.profiles where id = v_uid);
  end if;

  -- The balance check and the charge are one statement. They used to be a
  -- read followed by an update, and two purchases fired at once both read
  -- the same starting balance, both passed, and drove it below zero. Now a
  -- second concurrent call waits on the row and re-checks the new balance.
  update public.profiles set points = points - v_price
  where id = v_uid and points >= v_price;
  if not found then
    raise exception 'Not enough points';
  end if;

  insert into public.owned_items (user_id, item_id) values (v_uid, p_item_id);

  return (select points from public.profiles where id = v_uid);
end;
$$;

grant execute on function public.purchase_item(text) to authenticated;

-- The prices here are the source of truth; js/shop-items.js's `price`
-- field is a display-only copy that must be kept in sync by hand.
insert into public.shop_item_defs (id, price) values
  ('bg-sunset', 50),
  ('bg-ocean', 50),
  ('bg-midnight', 75),
  ('bg-aurora', 150),
  ('bg-confetti', 200),
  ('bg-blocks', 100),
  ('border-bronze', 30),
  ('border-silver', 60),
  ('border-gold', 120),
  ('border-neon', 150),
  ('border-rainbow', 200),
  ('border-flame', 250),
  ('name-gradient', 40),
  ('name-shadow', 60),
  ('name-glow', 80),
  ('name-rainbow', 150),
  ('name-sparkle', 180),
  ('bg-paper', 40),
  ('bg-grid', 55),
  ('bg-sunrise', 60),
  ('bg-forest', 70),
  ('bg-terminal', 85),
  ('bg-halftone', 95),
  ('bg-topo', 110),
  ('bg-vhs', 130),
  ('bg-starfield', 160),
  ('bg-vaporwave', 175),
  ('bg-static', 190),
  ('bg-lava', 220),
  ('border-ink', 20),
  ('border-dashed', 45),
  ('border-double', 70),
  ('border-emerald', 90),
  ('border-violet', 90),
  ('border-ember', 130),
  ('border-orbit', 190),
  ('border-conic', 210),
  ('border-glitch', 230),
  ('border-halo', 260),
  ('name-caps', 25),
  ('name-underline', 35),
  ('name-marker', 55),
  ('name-emboss', 65),
  ('name-outline', 75),
  ('name-terminal', 90),
  ('name-ice', 130),
  ('name-fire', 140),
  ('name-gold', 170),
  ('name-glitch', 200),
  ('name-oxygene', 120),
  ('bg-paws', 70),
  ('bg-beach', 80),
  ('bg-snow', 95),
  ('border-collar', 90),
  ('border-sun', 110),
  ('border-frost', 120),
  ('name-woof', 80),
  ('name-tropic', 90)
on conflict (id) do update set price = excluded.price;

-- ---------------------------------------------------------------
-- Sets: a background, a border and a nickname effect drawn to go
-- together, sold for less than the three separately.
--
-- A set owns no cosmetics of its own - it is a list of item ids - so
-- buying one is the same as buying its members, and an item can belong
-- to more than one set. Both tables are publicly readable and edited
-- only by hand here, exactly like shop_item_defs.
-- ---------------------------------------------------------------
create table if not exists public.shop_bundle_defs (
  id text primary key,
  price integer not null check (price >= 0)
);

create table if not exists public.shop_bundle_items (
  bundle_id text not null references public.shop_bundle_defs (id) on delete cascade,
  item_id text not null references public.shop_item_defs (id) on delete cascade,
  primary key (bundle_id, item_id)
);

alter table public.shop_bundle_defs enable row level security;
alter table public.shop_bundle_items enable row level security;

drop policy if exists "Set prices are publicly readable" on public.shop_bundle_defs;
create policy "Set prices are publicly readable"
  on public.shop_bundle_defs for select
  using (true);

drop policy if exists "Set contents are publicly readable" on public.shop_bundle_items;
create policy "Set contents are publicly readable"
  on public.shop_bundle_items for select
  using (true);

grant select on public.shop_bundle_defs, public.shop_bundle_items to anon, authenticated;

insert into public.shop_bundle_defs (id, price) values
  ('set-puppy', 190),
  ('set-summer', 220),
  ('set-winter', 265),
  ('set-terminal', 150),
  ('set-retro', 430),
  ('set-paper', 105)
on conflict (id) do update set price = excluded.price;

-- Rewritten wholesale on every run rather than upserted: a set's contents
-- can change, and an upsert would leave the removed member behind.
delete from public.shop_bundle_items
where bundle_id in ('set-puppy', 'set-summer', 'set-winter', 'set-terminal', 'set-retro', 'set-paper');

insert into public.shop_bundle_items (bundle_id, item_id) values
  ('set-puppy', 'bg-paws'),
  ('set-puppy', 'border-collar'),
  ('set-puppy', 'name-woof'),
  ('set-summer', 'bg-beach'),
  ('set-summer', 'border-sun'),
  ('set-summer', 'name-tropic'),
  ('set-winter', 'bg-snow'),
  ('set-winter', 'border-frost'),
  ('set-winter', 'name-ice'),
  ('set-terminal', 'bg-terminal'),
  ('set-terminal', 'border-ink'),
  ('set-terminal', 'name-terminal'),
  ('set-retro', 'bg-vhs'),
  ('set-retro', 'border-glitch'),
  ('set-retro', 'name-glitch'),
  ('set-paper', 'bg-paper'),
  ('set-paper', 'border-double'),
  ('set-paper', 'name-caps')
on conflict (bundle_id, item_id) do nothing;

-- Charges for a set and grants everything in it.
--
-- The price is pro-rated against what the buyer already owns: pay the
-- set's share of the members still missing, worked out from those
-- members' individual list prices. Without that, buying the Winter set
-- after already owning Ice would charge full price for two items, which
-- makes a set a worse deal than buying the rest of it piece by piece -
-- and a shop that punishes people for having shopped there before is a
-- bug, not a pricing strategy.
--
-- Everything comes from the two tables above; nothing is taken from the
-- client but the set's id.
create or replace function public.purchase_bundle(p_bundle_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bundle_price integer;
  v_list_total integer;
  v_missing_total integer;
  v_charge integer;
  v_granted integer;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  select price into v_bundle_price from public.shop_bundle_defs where id = p_bundle_id;
  if not found then
    raise exception 'Unknown set: %', p_bundle_id;
  end if;

  select coalesce(sum(d.price), 0) into v_list_total
  from public.shop_bundle_items b
  join public.shop_item_defs d on d.id = b.item_id
  where b.bundle_id = p_bundle_id;

  select coalesce(sum(d.price), 0) into v_missing_total
  from public.shop_bundle_items b
  join public.shop_item_defs d on d.id = b.item_id
  where b.bundle_id = p_bundle_id
    and not exists (
      select 1 from public.owned_items o where o.user_id = v_uid and o.item_id = b.item_id
    );

  if v_missing_total = 0 then
    raise exception 'You already own everything in this set';
  end if;

  -- ceil, so rounding never works out in the buyer's favour by a point
  -- and never charges a fraction.
  v_charge := ceil(v_bundle_price::numeric * v_missing_total / v_list_total);

  -- Checked and charged in one statement, as in purchase_item(), so two
  -- purchases fired at once cannot both spend the same balance.
  update public.profiles set points = points - v_charge
  where id = v_uid and points >= v_charge;
  if not found then
    raise exception 'Not enough points';
  end if;

  insert into public.owned_items (user_id, item_id)
  select v_uid, b.item_id
  from public.shop_bundle_items b
  where b.bundle_id = p_bundle_id
  on conflict (user_id, item_id) do nothing;

  get diagnostics v_granted = row_count;

  return json_build_object(
    'charged', v_charge,
    'granted', v_granted,
    'points', (select points from public.profiles where id = v_uid)
  );
end;
$$;

grant execute on function public.purchase_bundle(text) to authenticated;


-- Guards the three equipped_* columns the same way profiles_guard_is_admin
-- guards is_admin above: the "update own profile" policy lets a user
-- update any column on their own row, including equipped_bg/_border/
-- _name_effect, so without this a user could equip an item they never
-- bought by just updating their profile row directly. Silently reverts
-- to the previous value instead of erroring, since this only ever fires
-- on a forged direct update - the normal equip flow (js/shop-data.js)
-- never sets an unowned item id in the first place.
create or replace function public.prevent_unowned_equip()
returns trigger as $$
begin
  if new.equipped_bg is distinct from old.equipped_bg and new.equipped_bg <> 'none' then
    if not exists (select 1 from public.owned_items where user_id = new.id and item_id = new.equipped_bg) then
      new.equipped_bg := old.equipped_bg;
    end if;
  end if;
  if new.equipped_border is distinct from old.equipped_border and new.equipped_border <> 'none' then
    if not exists (select 1 from public.owned_items where user_id = new.id and item_id = new.equipped_border) then
      new.equipped_border := old.equipped_border;
    end if;
  end if;
  if new.equipped_name_effect is distinct from old.equipped_name_effect and new.equipped_name_effect <> 'none' then
    if not exists (select 1 from public.owned_items where user_id = new.id and item_id = new.equipped_name_effect) then
      new.equipped_name_effect := old.equipped_name_effect;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists profiles_guard_equipped_items on public.profiles;
create trigger profiles_guard_equipped_items
  before update on public.profiles
  for each row execute function public.prevent_unowned_equip();

-- ============================================================
-- Notifications - "someone followed you / liked or commented on your
-- project". Written entirely by triggers rather than by the client: the
-- person who causes a notification is never the person who receives it,
-- so there's no way to express "you may insert this row" as an RLS policy
-- the actor could satisfy. The trigger functions are security definer and
-- work out the recipient themselves.
-- ============================================================

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  type text not null check (type in ('follow', 'like', 'comment')),
  project_id uuid references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- 'post' and 'update' tell followers that someone they follow published an
-- entry or posted to a project's changelog (see "Telling followers" below).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'like', 'comment', 'post', 'update'));

alter table public.notifications enable row level security;

drop policy if exists "Users can read their own notifications" on public.notifications;
create policy "Users can read their own notifications"
  on public.notifications for select
  using ((select auth.uid()) = user_id);

-- Marking as read is the only update anyone needs; a user can only ever
-- touch rows addressed to them, which nobody else can even see.
drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
  on public.notifications for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own notifications" on public.notifications;
create policy "Users can delete their own notifications"
  on public.notifications for delete
  using ((select auth.uid()) = user_id);

-- No insert policy at all - see the note above; the triggers below are the
-- only writers.

-- ============================================================
-- Push tokens - removed.
--
-- Phones used to register an Expo push token here, and add_notification()
-- below handed every notification to Expo's relay through send_push(). No
-- released app has registered one since 14 September: the app now asks for
-- its own notifications (mobile/src/lib/notify.ts), so nothing here talks to
-- a push service any more. The live database dropped both first; these keep
-- a database built from this file the same.
-- ============================================================

drop function if exists public.send_push(uuid, text, text, jsonb);
drop table if exists public.push_tokens;

-- Skips when the same person already has an unread notification of the
-- same kind about the same thing. Without this, unliking and re-liking (or
-- toggling a follow) would pile up duplicates.
create or replace function public.add_notification(
  p_user_id uuid,
  p_actor_id uuid,
  p_type text,
  p_project_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_actor_id is null or p_user_id = p_actor_id then
    return;
  end if;

  if exists (
    select 1 from public.notifications
    where user_id = p_user_id
      and actor_id = p_actor_id
      and type = p_type
      and project_id is not distinct from p_project_id
      and read_at is null
  ) then
    return;
  end if;

  insert into public.notifications (user_id, actor_id, type, project_id)
  values (p_user_id, p_actor_id, p_type, p_project_id);
end;
$$;

-- Only the triggers below may call this. Like every function in `public` it
-- was executable by anon and authenticated by default, which made it an
-- open door around the "no insert policy" above: anyone could POST to
-- /rest/v1/rpc/add_notification and hand any user a "X followed you" from
-- any account they liked. The notify_on_* triggers are security definer, so
-- they call it as its owner and are unaffected.
revoke execute on function public.add_notification(uuid, uuid, text, uuid) from public, anon, authenticated;

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.add_notification(new.following_id, new.follower_id, 'follow');
  return new;
end;
$$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify
  after insert on public.follows
  for each row execute function public.notify_on_follow();

create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.projects where id = new.project_id;
  perform public.add_notification(v_owner, new.user_id, 'like', new.project_id);
  return new;
end;
$$;

drop trigger if exists likes_notify on public.likes;
create trigger likes_notify
  after insert on public.likes
  for each row execute function public.notify_on_like();

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.projects where id = new.project_id;
  perform public.add_notification(v_owner, new.user_id, 'comment', new.project_id);
  return new;
end;
$$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_on_comment();


-- ============================================================
-- Project updates - a project's changelog.
--
-- A project is something a person is making, so the useful thing to show
-- about it is that it is still being made: "v0.3 - added the editor".
-- Anyone who can see the project can read its updates; only the project's
-- owner can post one (an admin can remove one). There is no edit - an
-- update is a dated statement of what shipped, and rewriting it afterwards
-- would make the history something other than history.
--
-- user_id is the owner, and the insert policy checks that against the
-- project rather than trusting it, the way comments check author_name.
-- The consent gate for 13-15 year olds is added to the insert policy in the
-- age section below, with the other tables'.
-- ============================================================
create table if not exists public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null default '' check (char_length(version) <= 24),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists project_updates_project_idx on public.project_updates (project_id, created_at desc);

alter table public.project_updates enable row level security;

drop policy if exists "Updates are readable if their project is" on public.project_updates;
create policy "Updates are readable if their project is"
  on public.project_updates for select
  using (exists (select 1 from public.projects p where p.id = project_id));

drop policy if exists "Owners can post updates to their projects" on public.project_updates;
create policy "Owners can post updates to their projects"
  on public.project_updates for insert
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
  );

drop policy if exists "Update author or admin can delete" on public.project_updates;
create policy "Update author or admin can delete"
  on public.project_updates for delete
  using (
    (select auth.uid()) = user_id
    or exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.is_admin = true)
  );

-- The newest update of each project, for a page of cards: "v0.3 - 2d ago".
-- Cards used to fetch every update of every entry on the page and keep the
-- first per project, which grows with each project's history and stops at
-- PostgREST's 1000-row cap. security_invoker, so the policies on
-- project_updates above decide what each caller sees, exactly as before.
create or replace view public.project_latest_updates
with (security_invoker = true) as
select distinct on (project_id) id, project_id, user_id, version, body, created_at
from public.project_updates
order by project_id, created_at desc;

grant select on public.project_latest_updates to anon, authenticated;


-- ============================================================
-- Telling followers
--
-- Following someone used to change what you saw only if you went looking:
-- the person followed was told, and the follower never heard from them
-- again. Now, when someone you follow publishes an entry or posts to a
-- project's changelog, it arrives in your notifications like a like does.
--
--   'post'   - once per entry, the first time it is published. Taking it
--              down and putting it back up does not tell anyone twice.
--   'update' - each changelog post, but no more than one unread per
--              project: five updates in an afternoon are one notification.
--
-- Written by triggers, like every other notification, so no client can
-- address one to anybody.
-- ============================================================

create or replace function public.notify_followers(p_actor uuid, p_type text, p_project uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, actor_id, type, project_id)
  select f.follower_id, p_actor, p_type, p_project
  from public.follows f
  where f.following_id = p_actor
    and not exists (
      select 1 from public.notifications n
      where n.user_id = f.follower_id
        and n.type = p_type
        and n.project_id = p_project
        and (p_type = 'post' or n.read_at is null)
    );
end;
$$;

revoke execute on function public.notify_followers(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.notify_followers_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    perform public.notify_followers(new.user_id, 'post', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists projects_notify_followers on public.projects;
create trigger projects_notify_followers
  after insert or update of published on public.projects
  for each row execute function public.notify_followers_on_publish();

create or replace function public.notify_followers_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A draft's changelog is nobody else's business yet.
  if exists (select 1 from public.projects p where p.id = new.project_id and p.published) then
    perform public.notify_followers(new.user_id, 'update', new.project_id);
  end if;
  return null;
end;
$$;

drop trigger if exists project_updates_notify_followers on public.project_updates;
create trigger project_updates_notify_followers
  after insert on public.project_updates
  for each row execute function public.notify_followers_on_update();

-- ============================================================
-- Reputation & earnings
--
-- XP used to be paid for things you could do to yourself: publishing an
-- entry was 100 XP, posting a comment 10, and a view counted every time
-- you reloaded your own page. Ten junk entries and a refresh loop out-
-- ranked anything anyone actually made, which is the opposite of what a
-- discovery app should reward.
--
-- Both currencies now come from one place: what *other people* did with
-- your work. Nothing here counts an action you can perform on yourself -
-- self-likes are rejected by policy, self-views are dropped by
-- log_project_view(), and your own comments on your own entry are
-- excluded below.
--
-- The two formulas live here rather than in JS on purpose: the browser
-- can't be the authority on how much a like is worth, and keeping them in
-- one place stops the client and the server disagreeing about someone's
-- level. js/levels.js only turns the xp number into a level.
--
--   xp      = 25/published entry (first 20 only), 10/release (first 20
--             only), 2/unique viewer, 30/like, 15/comment received,
--             60/follower
--   points  = 1/unique viewer, 5/like, 3/comment received, 10/follower
--
-- Publishing pays XP again - putting something out is the thing this site
-- is for, and a level of 0 until a stranger turns up was a cold start
-- nobody deserved. It is deliberately worth less than a single like, and
-- it stops counting after the twentieth entry: that keeps it a reward for
-- posting rather than a reason to post twenty times. Points are untouched
-- and still come only from reach - currency stays something other people
-- decide you've earned.
--
-- A release is a project update, counted once per project per day and only
-- on published entries, and it stops counting after the twentieth - so it
-- rewards keeping something going, is worth a third of a like, and is
-- bounded: a script posting updates all day earns the same 200 XP a person
-- posting twenty real ones does, and nothing beyond it.
--
-- Aggregates only, and only over published entries, so this is safe to
-- expose publicly - it's what draws the leaderboard and every level chip.
-- ============================================================

-- One row per account. Shaped for the way it is asked, which is three ways:
-- one account (collect_earnings() on every page, a profile, a dashboard), a
-- page of authors (`user_id in (...)` for every level chip on a feed), and
-- everyone (`xp > 0 order by xp` for the leaderboard and the home page's
-- "who to follow").
--
-- It used to total each table for everybody first and join the totals to
-- profiles. Postgres narrows that to one account when asked for one, but
-- not to a list, so a page of 40 authors and the top 20 both totalled the
-- whole database. Now:
--
--   - each account's numbers come from its own published entries (likes,
--     comments and releases counted per entry, through the indexes), so a
--     list costs the people on it;
--   - an account with no published entry and no follower cannot have
--     anything to count - every number is 0 - and is a row of zeros in a
--     branch of its own. Asking for `xp > 0` drops that branch before it
--     runs, so the leaderboard only works through accounts that can be on
--     it.
--
-- Same columns and same numbers as before: on synthetic data (20,000
-- accounts, 300,000 views) every row matched, a page of 40 authors went
-- from 230 ms to 42, and the top 20 from 315 ms to 142.
create or replace view public.user_reputation as
select
  p.id as user_id,
  t.published_projects,
  t.total_views,
  vw.unique_viewers,
  t.likes_received,
  t.comments_received,
  fl.followers,
  (least(t.published_projects, 20) * 25
    + least(t.releases, 20) * 10
    + vw.unique_viewers * 2
    + t.likes_received * 30
    + t.comments_received * 15
    + fl.followers * 60)::integer as xp,
  (vw.unique_viewers * 1
    + t.likes_received * 5
    + t.comments_received * 3
    + fl.followers * 10)::integer as lifetime_points,
  t.releases,
  t.demo_projects
from public.profiles p
cross join lateral (
  select count(*)::integer as published_projects,
         coalesce(sum(pr.views_count), 0)::integer as total_views,
         (count(*) filter (where pr.live_url <> '' or pr.media_url <> ''))::integer as demo_projects,
         coalesce(sum((select count(*) from public.likes l where l.project_id = pr.id)), 0)::integer as likes_received,
         coalesce(sum((
           select count(*) from public.comments c
           where c.project_id = pr.id and c.user_id <> pr.user_id
         )), 0)::integer as comments_received,
         -- A release is a day with an update on it, per entry.
         coalesce(sum((
           select count(distinct u.created_at::date) from public.project_updates u
           where u.project_id = pr.id
         )), 0)::integer as releases
  from public.projects pr
  where pr.user_id = p.id and pr.published = true
) t
cross join lateral (
  select count(distinct v.viewer_id)::integer as unique_viewers
  from public.projects pr
  join public.project_views v on v.project_id = pr.id
  where pr.user_id = p.id and pr.published = true and v.viewer_id is not null
) vw
cross join lateral (
  select count(*)::integer as followers from public.follows f where f.following_id = p.id
) fl
where exists (select 1 from public.projects pr where pr.user_id = p.id and pr.published = true)
   or exists (select 1 from public.follows f where f.following_id = p.id)

union all

select p.id, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
from public.profiles p
where not exists (select 1 from public.projects pr where pr.user_id = p.id and pr.published = true)
  and not exists (select 1 from public.follows f where f.following_id = p.id);

grant select on public.user_reputation to anon, authenticated;

-- profiles.points_earned_total (declared with the other points columns
-- above, so the client-write guard can pin it) is the high-water mark of
-- what has already been paid out: losing a like never claws points back
-- out of a balance that may already have been spent, and re-earning it
-- never pays twice.
create or replace function public.collect_earnings()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lifetime integer;
  v_paid integer;
  v_points integer;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  select lifetime_points into v_lifetime from public.user_reputation where user_id = v_uid;
  if v_lifetime is null then
    v_lifetime := 0;
  end if;

  -- Locked until this call finishes. Two collects fired at once - two tabs,
  -- or the app and the site open together - used to both read the same
  -- high-water mark and both pay the difference. The second one now waits
  -- here and reads the mark the first one has already moved.
  select greatest(0, v_lifetime - points_earned_total) into v_paid
  from public.profiles where id = v_uid
  for update;

  if v_paid is null then
    return json_build_object('paid', 0, 'points', 0);
  end if;

  if v_paid > 0 then
    update public.profiles
      set points = points + v_paid,
          points_earned_total = points_earned_total + v_paid
    where id = v_uid;
  end if;

  select points into v_points from public.profiles where id = v_uid;
  return json_build_object('paid', v_paid, 'points', v_points);
end;
$$;

grant execute on function public.collect_earnings() to authenticated;


-- ============================================================
-- Saves - a private "come back to this" list.
--
-- A discovery app's whole job is putting something in front of you that
-- you weren't looking for, and until now there was nowhere to put it if
-- you couldn't watch it right then. Unlike likes, this is nobody else's
-- business: there is no public read policy, no count shown anywhere, and
-- it earns the author nothing - otherwise it becomes another number to
-- farm rather than a shelf.
-- ============================================================

create table if not exists public.saves (
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create index if not exists saves_user_id_idx on public.saves (user_id, created_at desc);

alter table public.saves enable row level security;

drop policy if exists "Users can read their own saves" on public.saves;
create policy "Users can read their own saves"
  on public.saves for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can save as themselves" on public.saves;
create policy "Users can save as themselves"
  on public.saves for insert
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.projects p where p.id = project_id)
  );

drop policy if exists "Users can remove their own saves" on public.saves;
create policy "Users can remove their own saves"
  on public.saves for delete
  using ((select auth.uid()) = user_id);

-- Supabase grants these to new tables in `public` by default, so this is
-- belt and braces - but a database where that default isn't in place
-- fails with "permission denied for table saves" and no hint as to why,
-- and the policies above are what actually restrict the rows.
grant select, insert, delete on public.saves to authenticated;


-- ============================================================
-- Reports - the missing half of moderation.
--
-- admin.html could already unpublish and delete, but nothing told an
-- admin where to look: a broken link or a stolen upload sat there until
-- somebody happened to scroll past it. Reports are write-only for
-- ordinary users - you can file one and that's all, you can't read
-- anyone's (including your own, which would let you check whether a
-- report landed and re-file until it did).
-- ============================================================

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  reporter_id uuid references auth.users (id) on delete set null,
  reason text not null check (reason in ('spam', 'broken', 'stolen', 'nsfw', 'other')),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

-- One report per person per entry: re-filing the same complaint is how a
-- reporting queue turns into a way to bury somebody.
create unique index if not exists reports_one_per_reporter_idx
  on public.reports (project_id, reporter_id);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

drop policy if exists "Signed-in users can report as themselves" on public.reports;
create policy "Signed-in users can report as themselves"
  on public.reports for insert
  with check (
    (select auth.uid()) = reporter_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id <> (select auth.uid()))
  );

drop policy if exists "Admins can read reports" on public.reports;
create policy "Admins can read reports"
  on public.reports for select
  using (exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.is_admin = true));

drop policy if exists "Admins can update reports" on public.reports;
create policy "Admins can update reports"
  on public.reports for update
  using (exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.is_admin = true))
  with check (exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.is_admin = true));

-- Table-level access; the policies above decide the rows. select/update
-- are granted to every signed-in account on purpose - without a matching
-- policy they return nothing, which is the point.
grant select, insert, update on public.reports to authenticated;

-- The queue an admin actually works from: one row per reported entry with
-- its report count, not one row per report. security definer because the
-- projects it joins may be unpublished, and the admin check is inside.
create or replace function public.admin_list_reports()
returns table (
  project_id uuid,
  title text,
  author_name text,
  owner_id uuid,
  published boolean,
  report_count bigint,
  reasons text,
  latest_note text,
  last_reported_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Not authorized';
  end if;

  return query
  select p.id,
         p.title,
         p.author_name,
         p.user_id,
         p.published,
         count(*) as report_count,
         string_agg(distinct r.reason, ', ' order by r.reason) as reasons,
         (array_agg(r.note order by r.created_at desc) filter (where r.note <> ''))[1] as latest_note,
         max(r.created_at) as last_reported_at
  from public.reports r
  join public.projects p on p.id = r.project_id
  where r.status = 'open'
  group by p.id, p.title, p.author_name, p.user_id, p.published
  order by max(r.created_at) desc;
end;
$$;

grant execute on function public.admin_list_reports() to authenticated;

-- Closes every open report on one entry in a single step, so working the
-- queue doesn't mean clicking through five rows about the same thing.
create or replace function public.admin_close_reports(p_project_id uuid, p_status text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed integer;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Not authorized';
  end if;

  if p_status not in ('resolved', 'dismissed') then
    raise exception 'Unknown status: %', p_status;
  end if;

  update public.reports set status = p_status
  where project_id = p_project_id and status = 'open';

  get diagnostics v_closed = row_count;
  return v_closed;
end;
$$;

grant execute on function public.admin_close_reports(uuid, text) to authenticated;


-- ============================================================
-- Rate limits
--
-- Everything below this line is cheap to do and expensive to receive: a
-- script can post a thousand comments or file a thousand reports as fast
-- as the network allows, and RLS has nothing to say about volume - it
-- only ever answers "may this row exist", never "how many of these in the
-- last hour". These are BEFORE INSERT triggers rather than anything in
-- the client, because the client is not where the attacker is.
--
-- The numbers are set well above what a person does and well below what a
-- loop does.
-- ============================================================

-- Each limit counts attempts, not surviving rows. Counting rows newer than
-- the window - how this first worked - let anything that can be undone go
-- on for ever: like and unlike, follow and unfollow, comment and delete,
-- and the count never moved. Every insert the limit lets through now
-- leaves an event here, and deleting the row it belonged to leaves the
-- event where it is. A rejected insert rolls back with its event, so only
-- things that happened count.
--
-- Nobody reads or writes this table from a client; only rate_limit_take()
-- below does, as its owner.
create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_lookup_idx
  on public.rate_limit_events (user_id, action, created_at);

alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from anon, authenticated;

-- Counting rows that still exist is what this replaced.
drop function if exists public.rate_limit_count(text, text, interval);

-- Takes one go at an action if there is room for it in the window: true
-- and an event recorded, or false and nothing recorded. security definer
-- because no client can read or write the events. The actor is always
-- auth.uid(), so calling it directly only ever spends your own allowance.
create or replace function public.rate_limit_take(p_action text, p_limit integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if p_action not in ('comments', 'projects', 'likes', 'follows', 'reports', 'project_updates') then
    raise exception 'Not a rate-limited action: %', p_action;
  end if;

  if v_uid is null then
    return true;
  end if;

  -- One person's attempts at one action take turns, so two inserts fired at
  -- the same moment cannot both see the last free slot.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_action, 0));

  select count(*) into v_count
  from public.rate_limit_events
  where user_id = v_uid and action = p_action and created_at > now() - p_window;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_events (user_id, action) values (v_uid, p_action);

  -- Events older than the window can never count again.
  delete from public.rate_limit_events
  where user_id = v_uid and action = p_action and created_at <= now() - p_window;

  return true;
end;
$$;

revoke execute on function public.rate_limit_take(text, integer, interval) from public, anon;
grant execute on function public.rate_limit_take(text, integer, interval) to authenticated;

-- Deliberately NOT security definer, and this is the whole point: inside a
-- definer function current_user is the function's owner, so a check for
-- 'authenticated' there is always false and the limit silently never
-- fires. The first version of this file made exactly that mistake and
-- accepted 25 comments against a limit of 20. The counting is delegated to
-- the definer helper above; the role check stays out here where the role
-- is still real.
--
-- Trigger arguments: the limit, then the window.
create or replace function public.enforce_rate_limit()
returns trigger as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if not public.rate_limit_take(tg_table_name, tg_argv[0]::integer, tg_argv[1]::interval) then
    raise exception 'Slow down - too many in a short time. Try again later.';
  end if;

  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function public.enforce_rate_limit('20', '1 hour');

drop trigger if exists projects_rate_limit on public.projects;
create trigger projects_rate_limit
  before insert on public.projects
  for each row execute function public.enforce_rate_limit('15', '1 hour');

drop trigger if exists likes_rate_limit on public.likes;
create trigger likes_rate_limit
  before insert on public.likes
  for each row execute function public.enforce_rate_limit('120', '1 hour');

drop trigger if exists follows_rate_limit on public.follows;
create trigger follows_rate_limit
  before insert on public.follows
  for each row execute function public.enforce_rate_limit('60', '1 hour');

drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function public.enforce_rate_limit('20', '1 hour');


-- ---------------------------------------------------------------
-- created_at belongs to the server.
--
-- Every table here takes created_at from its default, but a default is
-- only what happens when the client says nothing: PostgREST passes an
-- explicit value straight through, and nothing stopped one. That mattered
-- in three places:
--
--   - the rate limits above count rows newer than their window, so a
--     script that stamped each insert with last year's date was never
--     counted and could comment, like, follow and report without limit;
--   - an entry dated next month sat at the top of Latest and kept the
--     "just posted" boost in the For you ranking until the date came round;
--   - profiles.created_at is what account_age_days measures, so moving it
--     back two years unlocked 'veteran' and 'old-timer' and paid out their
--     points on the spot.
--
-- Pinned the way views_count and points are: only when the write comes
-- straight from a client role, so the security definer functions, the
-- signup trigger and the SQL Editor are untouched. Deliberately NOT
-- security definer, for the same reason as guard_profile_client_writes().
-- ---------------------------------------------------------------
create or replace function public.pin_created_at()
returns trigger as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

do $$
declare
  t text;
begin
  foreach t in array array['projects', 'profiles', 'comments', 'likes', 'follows', 'saves', 'reports', 'notifications'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_pin_created_at', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.pin_created_at()',
      t || '_pin_created_at',
      t
    );
  end loop;
end
$$;


-- ---------------------------------------------------------------
-- To make an account admin, run this separately in the SQL Editor
-- (this does NOT run automatically as part of this file - uncomment
-- and edit the email first):
--
-- update public.profiles set is_admin = true
-- where id = (select id from auth.users where email = 'you@example.com');
-- ---------------------------------------------------------------


-- ============================================================
-- Age, and parental authorisation for 13-15 year olds
--
-- GDPR Article 8 lets a child consent for themselves from an age each
-- member state sets between 13 and 16. Poland kept 16. XOXD admits
-- 13 year olds, so an account held by someone between 13 and 15 needs a
-- holder of parental responsibility to authorise it, and Article 8(2)
-- asks for reasonable efforts to verify that the authorisation is real -
-- which a checkbox the child ticks themselves plainly is not. So the
-- parent is emailed, and the account cannot publish, comment, like,
-- follow, save or report until they confirm.
--
-- Three deliberate choices:
--
--   - Ages live in their own table, NOT on `profiles`. Profiles are
--     publicly readable by design, and a date of birth - or even a
--     consent state, which gives away that someone is under 16 - is not
--     something to hand to every visitor.
--   - The row is written by the signup trigger from the metadata
--     Supabase Auth already carries, not by a later client write. A
--     client that skipped that write would otherwise get an account
--     with no age on it.
--   - consent_state is derived here rather than sent by the client. The
--     browser saying "this account is fine" is exactly the claim that
--     needs checking.
-- ============================================================

create table if not exists public.account_ages (
  user_id uuid primary key references auth.users (id) on delete cascade,
  birth_date date,
  -- 'not_required' - 16 or over, or an account from before this existed.
  -- 'pending'      - 13 to 15, waiting on a parent.
  -- 'granted'      - 13 to 15, a parent confirmed by email.
  consent_state text not null default 'not_required'
    check (consent_state in ('not_required', 'pending', 'granted')),
  created_at timestamptz not null default now()
);

alter table public.account_ages enable row level security;

-- You may read your own age and nothing else. There is deliberately no
-- insert, update or delete policy: the signup trigger and the Edge
-- Function write these rows, and both run with the service role.
drop policy if exists "You can read your own age" on public.account_ages;
create policy "You can read your own age"
  on public.account_ages for select
  using ((select auth.uid()) = user_id);

-- Whole years old today. Null in, null out.
--
-- stable, not immutable: the answer depends on today's date, and an
-- immutable function is one Postgres may evaluate once and reuse - in a
-- cached plan or an index - long after the birthday that should change it.
create or replace function public.age_years(d date)
returns integer
language sql
stable
set search_path = public
as $fn$
  select case when d is null then null else extract(year from age(current_date, d))::int end;
$fn$;

-- May this account write? Only once it has a date of birth, and not while
-- it is a 13-15 year old still waiting on a parent. A birthday does the
-- rest on its own: once the account holder turns 16 the age test passes
-- and the pending state stops mattering, without anything having to run
-- on a schedule.
--
-- An account with no date - one from before ages were asked for, or one
-- made by a client that never sent it - cannot write until it gives one.
-- This used to let them through, on purpose, until the website asked for
-- a date as well as the app: refusing them before then would have locked
-- everybody out with no way to answer. Both clients now stand in front of
-- everything and ask (age.html, BirthDateGate), so the database agreeing
-- with them closes the gap a direct API call walked straight through -
-- sign up without a birth_date and nothing was ever restricted.
--
-- security definer so it can read account_ages regardless of the
-- caller's own policies, and pinned to public so the search_path cannot
-- be swapped underneath it.
--
-- It takes no argument on purpose. An earlier version took a user id,
-- which meant anyone holding a profile id - and those are public - could
-- ask whether that person was a 13-15 year old waiting on a parent.
-- Answering only about auth.uid() leaves nothing to enumerate.
create or replace function public.consent_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (
      select a.birth_date is not null
             and (a.consent_state <> 'pending' or public.age_years(a.birth_date) >= 16)
      from public.account_ages a
      where a.user_id = auth.uid()
    ),
    -- No row at all: an account from before ages were asked for. Same as a
    -- row with no date - set_birth_date() is the way through.
    false
  );
$fn$;

-- Neither needs to be reachable over the REST API. consent_ok is called
-- from inside policy expressions, which need the caller to hold EXECUTE;
-- age_years only ever runs inside a SECURITY DEFINER function, as the
-- owner, so nobody needs it directly.
revoke all on function public.age_years(date) from public, anon, authenticated;
revoke all on function public.consent_ok() from public, anon;
grant execute on function public.consent_ok() to authenticated;

-- The signup trigger now carries the date of birth through, and decides
-- the state from it. Under 13 is refused outright: the clients stop it
-- at the form, and this stops a client that did not.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_birth date := nullif(new.raw_user_meta_data ->> 'birth_date', '')::date;
  v_age int := public.age_years(v_birth);
  v_state text;
begin
  if v_age is not null and v_age < 13 then
    raise exception 'An account holder must be at least 13 years old.';
  end if;

  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  v_state := case when v_age is not null and v_age < 16 then 'pending' else 'not_required' end;

  insert into public.account_ages (user_id, birth_date, consent_state)
  values (new.id, v_birth, v_state)
  on conflict (user_id) do nothing;

  return new;
end;
$fn$;

-- The way an account that has no date of birth supplies one.
--
-- account_ages has no insert or update policy on purpose, so this is the
-- only route in from a client, and it decides the consent state itself -
-- the browser saying "this account is fine" is the claim being checked.
--
-- A date can be filled in but never changed. Without that the gate is
-- decoration: a 13 year old who lands on 'pending' would simply set it
-- again to 17. Correcting a genuine mistake is an admin job, done with
-- the service role.
create or replace function public.set_birth_date(p_birth date)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_age int;
  v_state text;
  v_existing date;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if p_birth is null then
    raise exception 'A date of birth is required.';
  end if;
  if p_birth > current_date then
    raise exception 'That date is in the future.';
  end if;

  select birth_date into v_existing
  from public.account_ages
  where user_id = auth.uid();

  if v_existing is not null then
    raise exception 'A date of birth is already set on this account.';
  end if;

  v_age := public.age_years(p_birth);

  if v_age > 120 then
    raise exception 'That date does not look right.';
  end if;
  if v_age < 13 then
    raise exception 'An account holder must be at least 13 years old.';
  end if;

  v_state := case when v_age < 16 then 'pending' else 'not_required' end;

  insert into public.account_ages (user_id, birth_date, consent_state)
  values (auth.uid(), p_birth, v_state)
  on conflict (user_id) do update
     set birth_date = excluded.birth_date,
         consent_state = excluded.consent_state
   where public.account_ages.birth_date is null;

  return v_state;
end;
$fn$;

revoke all on function public.set_birth_date(date) from public, anon;
grant execute on function public.set_birth_date(date) to authenticated;


-- A parent's authorisation, one row per account that needs one. Nobody
-- reads or writes this from a client: the Edge Function holds the
-- service role, and the token is stored as a hash, so a leak of this
-- table is not a set of working confirmation links.
create table if not exists public.parental_consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  parent_email text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  confirmed_at timestamptz
);

-- How many emails this account has had sent in the current 24 hours, and
-- when that window opened. The Edge Function's request path mails an address
-- the child types in, so it caps itself with these - anyone can make a
-- pending account, and without a cap that is a way to flood a stranger's
-- inbox from this project's sender.
alter table public.parental_consents add column if not exists sends integer not null default 0;
alter table public.parental_consents add column if not exists sends_since timestamptz not null default now();

alter table public.parental_consents enable row level security;

-- No policies at all, deliberately. With RLS on and nothing granted,
-- every client request against this table returns nothing, and only the
-- service role can touch it.

create index if not exists parental_consents_token_idx
  on public.parental_consents (token_hash);

-- ---------------------------------------------------------------
-- The write policies, re-stated with the consent check appended.
-- Reading is untouched: a pending account can look around, it just
-- cannot add to the site until a parent says so.
-- ---------------------------------------------------------------

drop policy if exists "Users can create their own projects" on public.projects;
create policy "Users can create their own projects"
  on public.projects for insert
  with check ((select auth.uid()) = user_id and public.consent_ok());

drop policy if exists "Users can follow as themselves" on public.follows;
create policy "Users can follow as themselves"
  on public.follows for insert
  with check ((select auth.uid()) = follower_id and public.consent_ok());

drop policy if exists "Signed-in users can comment on visible projects" on public.comments;
create policy "Signed-in users can comment on visible projects"
  on public.comments for insert
  with check (
    (select auth.uid()) = user_id
    and public.consent_ok()
    and exists (select 1 from public.projects p where p.id = project_id)
  );

drop policy if exists "Signed-in users can like as themselves" on public.likes;
create policy "Signed-in users can like as themselves"
  on public.likes for insert
  with check (
    (select auth.uid()) = user_id
    and public.consent_ok()
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id <> (select auth.uid()))
  );

drop policy if exists "Users can save as themselves" on public.saves;
create policy "Users can save as themselves"
  on public.saves for insert
  with check (
    (select auth.uid()) = user_id
    and public.consent_ok()
    and exists (select 1 from public.projects p where p.id = project_id)
  );

drop policy if exists "Signed-in users can report as themselves" on public.reports;
create policy "Signed-in users can report as themselves"
  on public.reports for insert
  with check (
    (select auth.uid()) = reporter_id
    and public.consent_ok()
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id <> (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Announcements: a message an admin can push to every user as a popup.
-- The app shows the newest active row once per device (it remembers the id it
-- has shown). Publishing a new one makes it the newest; "clear" switches every
-- row off. Anyone can read the active rows; only admins can write.
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 4000),
  -- Files shown with the notice: [{ url, name, type, size, path? }]. `path` is
  -- the file's place in the 'announcements' bucket when an admin uploaded it;
  -- announcement-cleanup deletes those files once the notice is over.
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  -- Optional end: after this moment the announcement stops showing.
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

drop policy if exists "Anyone can read active announcements" on public.announcements;
create policy "Anyone can read active announcements"
  on public.announcements for select
  using (
    (active = true and (expires_at is null or expires_at > now()))
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)
  );

drop policy if exists "Admins can publish announcements" on public.announcements;
create policy "Admins can publish announcements"
  on public.announcements for insert
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)
  );

drop policy if exists "Admins can edit announcements" on public.announcements;
create policy "Admins can edit announcements"
  on public.announcements for update
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true));

drop policy if exists "Admins can delete announcements" on public.announcements;
create policy "Admins can delete announcements"
  on public.announcements for delete
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true));

-- For a database that already has the first version of the table above.
alter table public.announcements add column if not exists attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array');
alter table public.announcements drop column if exists image_url;
alter table public.announcements drop column if exists video_url;
alter table public.announcements add column if not exists expires_at timestamptz;
alter table public.announcements drop constraint if exists announcements_body_check;
alter table public.announcements add constraint announcements_body_check check (char_length(body) between 1 and 4000);

-- Files attached to an announcement - pictures, films, sound, documents,
-- anything - are uploaded by an admin to a public bucket (readable by link, so
-- they show for logged-out visitors too). Only admins can add, replace or
-- remove files in it, so any type is accepted; only the size is capped. The
-- announcement-cleanup function deletes the files when the notice is over.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcements', 'announcements', true, 52428800, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can upload announcement media" on storage.objects;
create policy "Admins can upload announcement media"
  on storage.objects for insert
  with check (
    bucket_id = 'announcements'
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)
  );

drop policy if exists "Admins can replace announcement media" on storage.objects;
create policy "Admins can replace announcement media"
  on storage.objects for update
  using (
    bucket_id = 'announcements'
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)
  );

drop policy if exists "Admins can remove announcement media" on storage.objects;
create policy "Admins can remove announcement media"
  on storage.objects for delete
  using (
    bucket_id = 'announcements'
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)
  );

-- ============================================================
-- Project updates: the consent gate, server-owned created_at, a rate limit
-- ============================================================
drop policy if exists "Owners can post updates to their projects" on public.project_updates;
create policy "Owners can post updates to their projects"
  on public.project_updates for insert
  with check (
    (select auth.uid()) = user_id
    and public.consent_ok()
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
  );

drop trigger if exists project_updates_pin_created_at on public.project_updates;
create trigger project_updates_pin_created_at
  before insert or update on public.project_updates
  for each row execute function public.pin_created_at();

drop trigger if exists project_updates_rate_limit on public.project_updates;
create trigger project_updates_rate_limit
  before insert on public.project_updates
  for each row execute function public.enforce_rate_limit('10', '1 hour');

-- ============================================================
-- Uploads: pictures and demo clips people add to their posts and profile
-- ============================================================
-- Every picture field (avatar, cover, Scrolls image, pictures in a post) and
-- the media field still take a link; next to each there is now an Upload
-- button that compresses the file on the device first (js/compress.js on the
-- site, lib/compress.ts in the app) and puts it here. What ends up in the row
-- is the file's public URL, so nothing that draws a post knows the difference.
--
-- Compression happens on the client because that is where the bytes start:
-- a phone photo is 3-8 MB and a screen recording far more, and squeezing them
-- before they leave saves the upload as well as the storage and egress. The
-- server cannot check that it happened, so the bucket keeps its own ceiling:
-- only these types, at most 25 MB a file, and a cap on files per person
-- below. Files nothing refers to any more are removed by upload-cleanup
-- (supabase/functions/upload-cleanup).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', true, 26214400,
        array['image/webp', 'image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Files live in <user id>/<name>. A person writes only into their own folder,
-- has room for 300 files, and cannot overwrite (no update policy): a new
-- picture is a new file, so a link already in a post never changes under it.
--
-- The 300 are counted by a function, not by a subquery in the policy. A
-- policy on storage.objects that reads storage.objects makes Postgres apply
-- the table's select policies inside it, and as soon as any of those holds a
-- subquery of its own - the audio guide's below does - every insert into the
-- table fails with "infinite recursion detected in policy". That is what
-- stopped every upload, on the site, in the app and in the guide, from the
-- day the two first met. A function is planned on its own, so it never
-- nests.
create or replace function public.my_upload_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from storage.objects o
  where o.bucket_id = 'uploads' and split_part(o.name, '/', 1) = (select auth.uid())::text;
$$;

revoke execute on function public.my_upload_count() from public, anon;
grant execute on function public.my_upload_count() to authenticated;

drop policy if exists "People upload into their own folder" on storage.objects;
create policy "People upload into their own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and public.consent_ok()
    and public.my_upload_count() < 300
  );

drop policy if exists "People see their own uploads" on storage.objects;
create policy "People see their own uploads"
  on storage.objects for select
  using (bucket_id = 'uploads' and split_part(name, '/', 1) = (select auth.uid())::text);

drop policy if exists "People remove their own uploads" on storage.objects;
create policy "People remove their own uploads"
  on storage.objects for delete
  using (bucket_id = 'uploads' and split_part(name, '/', 1) = (select auth.uid())::text);

-- Which uploaded clips the weekly ffmpeg pass has already been through
-- (.github/workflows/media-optimize.yml, tools/media-optimize.mjs). Clips are
-- compressed quickly on the device first; once a week every clip not listed
-- here is encoded again, slowly and properly, and the file in the bucket is
-- replaced in place when that comes out smaller - so links in posts stay the
-- same. A row is written either way, so a clip is only ever tried once.
-- Only the job (with the service key) reads or writes it: RLS on, no policies.
create table if not exists public.media_optimized (
  path text primary key,
  original_size bigint not null,
  optimized_size bigint not null,
  replaced boolean not null,
  processed_at timestamptz not null default now()
);
alter table public.media_optimized enable row level security;

-- ============================================================
-- The audio guide (Audioprzewodnik, Wczasy Bez Kasy)
--
-- A separate app shares this Supabase project; przewodnik/ on this site is
-- its privacy policy. It keeps its content in the `przewodnik` bucket, and
-- accounts holding the guide_editor rank may change that content. Nothing
-- in XOXD reads any of this. It is here so this file describes the whole
-- database and tools/schema-drift.mjs has nothing to explain away: change
-- the guide's objects here, in the same shape, or the drift check fails.
-- ============================================================

create table if not exists public.user_ranks (
  user_id uuid not null references auth.users (id) on delete cascade,
  rank text not null check (rank = 'guide_editor'),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, rank)
);

alter table public.user_ranks enable row level security;
revoke all on public.user_ranks from anon, authenticated;
grant select on public.user_ranks to authenticated;

drop policy if exists "Users can see their own ranks" on public.user_ranks;
create policy "Users can see their own ranks"
  on public.user_ranks for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Admins can see all ranks" on public.user_ranks;
create policy "Admins can see all ranks"
  on public.user_ranks for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

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

create or replace function public.admin_grant_rank(p_user uuid, p_rank text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin) then
    raise exception 'Admin access required';
  end if;
  insert into public.user_ranks (user_id, rank, granted_by)
  values (p_user, p_rank, (select auth.uid()))
  on conflict (user_id, rank) do nothing;
end;
$$;

create or replace function public.admin_revoke_rank(p_user uuid, p_rank text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin) then
    raise exception 'Admin access required';
  end if;
  delete from public.user_ranks where user_id = p_user and rank = p_rank;
end;
$$;

revoke execute on function public.has_rank(text) from public, anon;
revoke execute on function public.admin_grant_rank(uuid, text) from public, anon;
revoke execute on function public.admin_revoke_rank(uuid, text) from public, anon;
grant execute on function public.has_rank(text) to authenticated;
grant execute on function public.admin_grant_rank(uuid, text) to authenticated;
grant execute on function public.admin_revoke_rank(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('przewodnik', 'przewodnik', true, 52428800,
        array['application/json', 'image/jpeg', 'image/png', 'audio/mpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Guide editors can list przewodnik" on storage.objects;
create policy "Guide editors can list przewodnik"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'przewodnik' and (select public.has_rank('guide_editor')));

drop policy if exists "Guide editors can upload to przewodnik" on storage.objects;
create policy "Guide editors can upload to przewodnik"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'przewodnik' and (select public.has_rank('guide_editor')));

drop policy if exists "Guide editors can replace in przewodnik" on storage.objects;
create policy "Guide editors can replace in przewodnik"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'przewodnik' and (select public.has_rank('guide_editor')))
  with check (bucket_id = 'przewodnik' and (select public.has_rank('guide_editor')));

drop policy if exists "Guide editors can delete from przewodnik" on storage.objects;
create policy "Guide editors can delete from przewodnik"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'przewodnik' and (select public.has_rank('guide_editor')));


-- ============================================================
-- Indexes for foreign keys
--
-- Postgres indexes the referenced side of a foreign key, never the
-- referencing one. Without these, deleting an account or a project scans
-- each table below for rows pointing at it, and so does every lookup by
-- these columns (your own comments for an achievement, for instance).
-- ============================================================

create index if not exists announcements_created_by_idx on public.announcements (created_by);
create index if not exists comments_user_id_idx on public.comments (user_id);
create index if not exists likes_user_id_idx on public.likes (user_id);
create index if not exists notifications_actor_id_idx on public.notifications (actor_id);
create index if not exists notifications_project_id_idx on public.notifications (project_id);
create index if not exists project_updates_user_id_idx on public.project_updates (user_id);
create index if not exists project_views_viewer_id_idx on public.project_views (viewer_id);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists saves_project_id_idx on public.saves (project_id);
create index if not exists shop_bundle_items_item_id_idx on public.shop_bundle_items (item_id);
create index if not exists user_ranks_granted_by_idx on public.user_ranks (granted_by);
