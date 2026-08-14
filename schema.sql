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


-- How this project looks in the Scrolls feed. The card there is a
-- full-screen portrait, which a landscape thumbnail rarely suits — so a
-- project can carry its own Scrolls image, and pick a gradient for when it
-- has none. Both optional; empty means "fall back to the project image,
-- then to the initials gradient".
alter table public.projects add column if not exists scroll_image_url text not null default '';
alter table public.projects add column if not exists scroll_bg text not null default '';

alter table public.projects drop constraint if exists projects_scroll_bg_check;
alter table public.projects add constraint projects_scroll_bg_check
  check (scroll_bg in ('', 'dusk', 'ocean', 'forest', 'ember', 'violet'));


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

-- ============================================================
-- Points & Shop — achievements (see js/achievements.js) pay out points
-- once each, server-verified so the payout can't be forged from the
-- browser console; points are spendable on cosmetic profile items
-- (backgrounds, avatar borders, nickname effects — see js/shop-items.js).
-- ============================================================

alter table public.profiles add column if not exists points integer not null default 0;
alter table public.profiles add column if not exists equipped_bg text not null default 'none';
alter table public.profiles add column if not exists equipped_border text not null default 'none';
alter table public.profiles add column if not exists equipped_name_effect text not null default 'none';

-- Only claim_achievement()/purchase_item() below (both security definer,
-- so they run with elevated privileges regardless of this grant) are
-- allowed to change points — revoking column-level update from the
-- `authenticated` role means a direct
-- `supabase.from('profiles').update({ points: 999999 })` from the browser
-- console is rejected by Postgres itself, not just hidden UI.
revoke update (points) on public.profiles from authenticated;

-- One row per (user, achievement) the user has ever earned. This is what
-- makes achievements permanent: they're recorded the moment they're first
-- earned, so deleting the project (or losing the likes/followers) that
-- earned one doesn't take the badge away again.
--
-- `claimed_at` is NULL for "earned but the reward hasn't been collected
-- yet" and set once claim_achievement() pays out — that split is what lets
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
-- them at once — much easier to paste into the SQL Editor incrementally.
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
  -- behind it is gone (the project was deleted, likes were withdrawn) —
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
  -- nothing, so the reward can never be paid twice — while an unlock that
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
  ('viral', 'total_views', 1000, 90),
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
  ('name-oxygene', 120)
on conflict (id) do update set price = excluded.price;

-- Guards the three equipped_* columns the same way profiles_guard_is_admin
-- guards is_admin above: the "update own profile" policy lets a user
-- update any column on their own row, including equipped_bg/_border/
-- _name_effect, so without this a user could equip an item they never
-- bought by just updating their profile row directly. Silently reverts
-- to the previous value instead of erroring, since this only ever fires
-- on a forged direct update — the normal equip flow (js/shop-data.js)
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
-- Notifications — "someone followed you / liked or commented on your
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

-- No insert policy at all — see the note above; the triggers below are the
-- only writers.

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


-- ---------------------------------------------------------------
-- To make an account admin, run this separately in the SQL Editor
-- (this does NOT run automatically as part of this file — uncomment
-- and edit the email first):
--
-- update public.profiles set is_admin = true
-- where id = (select id from auth.users where email = 'you@example.com');
-- ---------------------------------------------------------------
