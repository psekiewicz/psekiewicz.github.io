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

-- Same idea for projects. Two things a client must not set:
--
-- views_count - owners can legitimately update their own row, so nothing
-- stopped them writing views_count directly, and that number feeds XP,
-- level, leaderboard position and the Scrolls ranking. It is only ever
-- meant to move through log_project_view().
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
    else
      new.views_count := 0;
    end if;

    select display_name into v_display_name from public.profiles where id = new.user_id;
    new.author_name := coalesce(v_display_name, '');
  end if;
  return new;
end;
$$ language plpgsql;

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


-- The Scrolls card is a full-screen portrait, which a landscape thumbnail
-- rarely suits, so a project can carry its own image just for that feed.
-- Optional; empty falls back to the project's normal image.
alter table public.projects add column if not exists scroll_image_url text not null default '';


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
  with check (auth.uid() = follower_id);

-- You can only ever remove your own follow row.
drop policy if exists "Users can unfollow as themselves" on public.follows;
create policy "Users can unfollow as themselves"
  on public.follows for delete
  using (auth.uid() = follower_id);


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
$$ language plpgsql;

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
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id <> auth.uid())
  );

delete from public.likes l
using public.projects p
where p.id = l.project_id and p.user_id = l.user_id;

drop policy if exists "Users can remove their own like" on public.likes;
create policy "Users can remove their own like"
  on public.likes for delete
  using (auth.uid() = user_id);


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

create or replace function public.log_project_view(p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_uid uuid := auth.uid();
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

  -- One view per signed-in viewer per 6h. Signed-out visitors can't be
  -- deduplicated, so they still count towards the public number and
  -- towards nothing else.
  if v_uid is not null and exists (
    select 1 from public.project_views
    where project_id = p_project_id and viewer_id = v_uid and created_at > now() - interval '6 hours'
  ) then
    return false;
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
$$ language plpgsql;

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

  if public.achievement_metric(v_uid, v_def.metric) < v_def.threshold then
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
  if not v_recorded and public.achievement_metric(v_uid, v_def.metric) < v_def.threshold then
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
  ('all-set', 'profile_complete', 1, 15)
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
  v_points integer;
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

  select points into v_points from public.profiles where id = v_uid;
  if v_points < v_price then
    raise exception 'Not enough points';
  end if;

  update public.profiles set points = points - v_price where id = v_uid;
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
  v_points integer;
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

  select points into v_points from public.profiles where id = v_uid;
  if v_points < v_charge then
    raise exception 'Not enough points';
  end if;

  update public.profiles set points = points - v_charge where id = v_uid;

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

alter table public.notifications enable row level security;

drop policy if exists "Users can read their own notifications" on public.notifications;
create policy "Users can read their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

-- Marking as read is the only update anyone needs; a user can only ever
-- touch rows addressed to them, which nobody else can even see.
drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own notifications" on public.notifications;
create policy "Users can delete their own notifications"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- No insert policy at all - see the note above; the triggers below are the
-- only writers.

-- ============================================================
-- Push tokens - one row per device that's granted notification
-- permission (see mobile/src/lib/push.ts), so add_notification() below
-- can reach someone who isn't looking at the app right now. Nothing
-- ever reads these except send_push() itself.
-- ============================================================

create table if not exists public.push_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.push_tokens enable row level security;

drop policy if exists "Users can register their own push token" on public.push_tokens;
create policy "Users can register their own push token"
  on public.push_tokens for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own push token" on public.push_tokens;
create policy "Users can remove their own push token"
  on public.push_tokens for delete
  using (auth.uid() = user_id);

-- Deliberately no select policy - a token is only ever read from inside
-- send_push() below, a security definer function that (like every other
-- trigger in this file) runs as the table owner and isn't subject to RLS.

-- pg_net is Supabase's own extension for firing HTTP requests from
-- Postgres (the same mechanism behind Database Webhooks), pre-installed
-- on every project - this is what lets a push go out with no server to
-- host and no Edge Function to deploy.
create extension if not exists pg_net with schema extensions;

-- One HTTP call to Expo's push relay per notified user, covering every
-- device they've registered. net.http_post is fire-and-forget - it
-- queues the request on a background worker and returns immediately -
-- so a slow or failed delivery here can never block or fail the insert
-- that triggered it.
create or replace function public.send_push(p_user_id uuid, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tokens text[];
begin
  select array_agg(token) into v_tokens from public.push_tokens where user_id = p_user_id;
  if v_tokens is null or array_length(v_tokens, 1) = 0 then
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
    body := (
      select jsonb_agg(jsonb_build_object('to', t, 'title', p_title, 'body', p_body, 'data', p_data))
      from unnest(v_tokens) as t
    )
  );
end;
$$;

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
declare
  v_actor_name text;
  v_project_title text;
  v_body text;
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

  select display_name into v_actor_name from public.profiles where id = p_actor_id;
  v_actor_name := coalesce(nullif(v_actor_name, ''), 'Someone');

  if p_project_id is not null then
    select title into v_project_title from public.projects where id = p_project_id;
  end if;

  v_body := case p_type
    when 'follow' then v_actor_name || ' followed you.'
    when 'like' then v_actor_name || ' liked ' || coalesce(v_project_title, 'your project') || '.'
    when 'comment' then v_actor_name || ' commented on ' || coalesce(v_project_title, 'your project') || '.'
    else v_actor_name || ' did something.'
  end;

  perform public.send_push(p_user_id, 'Showcase', v_body, jsonb_build_object('type', p_type, 'projectId', p_project_id));
end;
$$;

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
--   xp      = 25/published entry (first 20 only), 2/unique viewer,
--             30/like, 15/comment received, 60/follower
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
-- Aggregates only, and only over published entries, so this is safe to
-- expose publicly - it's what draws the leaderboard and every level chip.
-- ============================================================

create or replace view public.user_reputation as
with pub as (
  select id, user_id, views_count from public.projects where published = true
),
totals as (
  select user_id, count(*) as published_projects, coalesce(sum(views_count), 0) as total_views
  from pub group by user_id
),
viewers as (
  select pub.user_id, count(distinct v.viewer_id) as unique_viewers
  from pub join public.project_views v on v.project_id = pub.id
  where v.viewer_id is not null
  group by pub.user_id
),
liked as (
  select pub.user_id, count(*) as likes_received
  from pub join public.likes l on l.project_id = pub.id
  group by pub.user_id
),
commented as (
  select pub.user_id, count(*) as comments_received
  from pub join public.comments c on c.project_id = pub.id and c.user_id <> pub.user_id
  group by pub.user_id
),
followed as (
  select following_id as user_id, count(*) as followers
  from public.follows group by following_id
)
select
  p.id as user_id,
  coalesce(t.published_projects, 0)::integer as published_projects,
  coalesce(t.total_views, 0)::integer as total_views,
  coalesce(vw.unique_viewers, 0)::integer as unique_viewers,
  coalesce(lk.likes_received, 0)::integer as likes_received,
  coalesce(cm.comments_received, 0)::integer as comments_received,
  coalesce(fl.followers, 0)::integer as followers,
  (least(coalesce(t.published_projects, 0), 20) * 25
    + coalesce(vw.unique_viewers, 0) * 2
    + coalesce(lk.likes_received, 0) * 30
    + coalesce(cm.comments_received, 0) * 15
    + coalesce(fl.followers, 0) * 60)::integer as xp,
  (coalesce(vw.unique_viewers, 0) * 1
    + coalesce(lk.likes_received, 0) * 5
    + coalesce(cm.comments_received, 0) * 3
    + coalesce(fl.followers, 0) * 10)::integer as lifetime_points
from public.profiles p
left join totals t on t.user_id = p.id
left join viewers vw on vw.user_id = p.id
left join liked lk on lk.user_id = p.id
left join commented cm on cm.user_id = p.id
left join followed fl on fl.user_id = p.id;

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

  select greatest(0, v_lifetime - points_earned_total) into v_paid
  from public.profiles where id = v_uid;

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
  using (auth.uid() = user_id);

drop policy if exists "Users can save as themselves" on public.saves;
create policy "Users can save as themselves"
  on public.saves for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id)
  );

drop policy if exists "Users can remove their own saves" on public.saves;
create policy "Users can remove their own saves"
  on public.saves for delete
  using (auth.uid() = user_id);

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
    auth.uid() = reporter_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id <> auth.uid())
  );

drop policy if exists "Admins can read reports" on public.reports;
create policy "Admins can read reports"
  on public.reports for select
  using (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin = true));

drop policy if exists "Admins can update reports" on public.reports;
create policy "Admins can update reports"
  on public.reports for update
  using (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin = true))
  with check (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin = true));

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

-- Counting has to bypass RLS: `reports` has no select policy for ordinary
-- users at all, so a count run as the caller would come back 0 and the
-- limit would never fire. This is `security definer` for that reason and
-- nothing else - the table/column pair is checked against a fixed list
-- and the actor is always auth.uid(), so calling it directly tells you
-- only how many of your own rows you just wrote.
create or replace function public.rate_limit_count(p_table text, p_column text, p_window interval)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if (p_table, p_column) not in (
    ('comments', 'user_id'),
    ('projects', 'user_id'),
    ('likes', 'user_id'),
    ('follows', 'follower_id'),
    ('reports', 'reporter_id'),
    ('saves', 'user_id')
  ) then
    raise exception 'Not a rate-limited table: %.%', p_table, p_column;
  end if;

  if auth.uid() is null then
    return 0;
  end if;

  execute format(
    'select count(*) from public.%I where %I = $1 and created_at > now() - $2',
    p_table,
    p_column
  )
  into v_count
  using auth.uid(), p_window;

  return v_count;
end;
$$;

-- Deliberately NOT security definer, and this is the whole point: inside a
-- definer function current_user is the function's owner, so a check for
-- 'authenticated' there is always false and the limit silently never
-- fires. The first version of this file made exactly that mistake and
-- accepted 25 comments against a limit of 20. The counting is delegated to
-- the definer helper above; the role check stays out here where the role
-- is still real.
create or replace function public.enforce_rate_limit()
returns trigger as $$
declare
  v_count integer;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  v_count := public.rate_limit_count(tg_table_name, tg_argv[2], tg_argv[1]::interval);

  if v_count >= tg_argv[0]::integer then
    raise exception 'Slow down - too many in a short time. Try again later.';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function public.enforce_rate_limit('20', '1 hour', 'user_id');

drop trigger if exists projects_rate_limit on public.projects;
create trigger projects_rate_limit
  before insert on public.projects
  for each row execute function public.enforce_rate_limit('15', '1 hour', 'user_id');

drop trigger if exists likes_rate_limit on public.likes;
create trigger likes_rate_limit
  before insert on public.likes
  for each row execute function public.enforce_rate_limit('120', '1 hour', 'user_id');

drop trigger if exists follows_rate_limit on public.follows;
create trigger follows_rate_limit
  before insert on public.follows
  for each row execute function public.enforce_rate_limit('60', '1 hour', 'follower_id');

drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function public.enforce_rate_limit('20', '1 hour', 'reporter_id');


-- ---------------------------------------------------------------
-- To make an account admin, run this separately in the SQL Editor
-- (this does NOT run automatically as part of this file - uncomment
-- and edit the email first):
--
-- update public.profiles set is_admin = true
-- where id = (select id from auth.users where email = 'you@example.com');
-- ---------------------------------------------------------------
