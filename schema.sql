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

-- One row per (user, achievement) the user has actually claimed — lets
-- claim_achievement() pay out an achievement's reward exactly once, no
-- matter how many times the claim button is clicked.
create table if not exists public.unlocked_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.unlocked_achievements enable row level security;

drop policy if exists "Users can read their own claimed achievements" on public.unlocked_achievements;
create policy "Users can read their own claimed achievements"
  on public.unlocked_achievements for select
  using (auth.uid() = user_id);

-- Deliberately no insert/update/delete policy for this table: rows are
-- only ever written by claim_achievement() (security definer), which
-- re-checks eligibility server-side before inserting.

-- One row per (user, item) the user has purchased from the shop.
create table if not exists public.owned_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  purchased_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.owned_items enable row level security;

drop policy if exists "Users can read their own owned items" on public.owned_items;
create policy "Users can read their own owned items"
  on public.owned_items for select
  using (auth.uid() = user_id);

-- Deliberately no insert/update/delete policy here either: rows are only
-- ever written by purchase_item() (security definer), which re-checks the
-- price and balance server-side.

-- Verifies eligibility for `p_achievement_id` itself (mirroring the
-- `check` functions in js/achievements.js) rather than trusting a
-- client-passed stats object, then pays out a fixed reward exactly once.
-- The reward amounts here are the source of truth; js/achievements.js's
-- `reward` field is a display-only copy that must be kept in sync by hand.
create or replace function public.claim_achievement(p_achievement_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reward integer;
  v_eligible boolean;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  case p_achievement_id
    when 'launched' then
      v_reward := 20;
      v_eligible := exists (select 1 from public.projects where user_id = v_uid and published = true);
    when 'well-liked' then
      v_reward := 30;
      v_eligible := (
        select count(*) from public.likes l join public.projects p on p.id = l.project_id
        where p.user_id = v_uid and p.published = true
      ) >= 10;
    when 'veteran' then
      v_reward := 50;
      v_eligible := (select created_at from public.profiles where id = v_uid) <= now() - interval '365 days';
    when 'conversationalist' then
      v_reward := 40;
      v_eligible := (select count(*) from public.comments where user_id = v_uid) >= 10;
    when 'builder' then
      v_reward := 60;
      v_eligible := (select count(*) from public.projects where user_id = v_uid and published = true) >= 5;
    when 'influencer' then
      v_reward := 80;
      v_eligible := (select count(*) from public.follows where following_id = v_uid) >= 10;
    when 'crowd-favorite' then
      v_reward := 100;
      v_eligible := (
        select count(*) from public.likes l join public.projects p on p.id = l.project_id
        where p.user_id = v_uid and p.published = true
      ) >= 50;
    else
      raise exception 'Unknown achievement: %', p_achievement_id;
  end case;

  if not v_eligible then
    raise exception 'Achievement not yet earned';
  end if;

  insert into public.unlocked_achievements (user_id, achievement_id)
  values (v_uid, p_achievement_id)
  on conflict (user_id, achievement_id) do nothing;

  -- FOUND reflects whether the insert above actually inserted a row —
  -- false on conflict, which is what keeps a repeat claim from paying out
  -- twice.
  if found then
    update public.profiles set points = points + v_reward where id = v_uid;
  end if;

  return (select points from public.profiles where id = v_uid);
end;
$$;

grant execute on function public.claim_achievement(text) to authenticated;

-- Prices here are the source of truth (js/shop-items.js's `price` field is
-- a display-only copy that must be kept in sync by hand). Charges points
-- and records ownership atomically; buying something already owned is a
-- harmless no-op rather than an error, so a double-click can't double-charge.
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

  v_price := case p_item_id
    when 'bg-sunset' then 50
    when 'bg-ocean' then 50
    when 'bg-midnight' then 75
    when 'bg-aurora' then 150
    when 'bg-confetti' then 200
    when 'border-bronze' then 30
    when 'border-silver' then 60
    when 'border-gold' then 120
    when 'border-neon' then 150
    when 'border-rainbow' then 200
    when 'name-gradient' then 40
    when 'name-shadow' then 60
    when 'name-glow' then 80
    when 'name-rainbow' then 150
    when 'name-sparkle' then 180
    else null
  end;

  if v_price is null then
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

-- ---------------------------------------------------------------
-- To make an account admin, run this separately in the SQL Editor
-- (this does NOT run automatically as part of this file — uncomment
-- and edit the email first):
--
-- update public.profiles set is_admin = true
-- where id = (select id from auth.users where email = 'you@example.com');
-- ---------------------------------------------------------------
