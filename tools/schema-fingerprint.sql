-- A normalised description of everything schema.sql is responsible for, one
-- row per object: (kind, key, value). tools/schema-drift.mjs runs it against
-- a scratch database built from schema.sql and against the live project, and
-- any row that differs is drift - something changed in one place and not the
-- other.
--
-- Function bodies and view definitions are compared by an md5 of their text
-- with whitespace collapsed, so a body pasted into the SQL Editor with
-- Windows line endings still matches the file. Everything else is compared as
-- Postgres itself prints it back.
--
-- Scope is the public schema, plus the policies schema.sql writes on
-- storage.objects and the triggers it puts on auth.users. Supabase's own
-- schemas (auth, storage, realtime, ...) belong to Supabase and are left out.

with
fn as (
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig, p.*
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    -- Functions an extension created live with the extension, not with us.
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
rel as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm')
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
)
select kind, key, value from (
  -- Tables and views, with their row level security switches.
  select 'relation' as kind, relname::text as key,
         relkind::text || ' rls=' || relrowsecurity || ' force=' || relforcerowsecurity as value
  from rel

  union all
  -- Columns: type, nullability, default, identity.
  select 'column', r.relname || '.' || a.attname,
         format_type(a.atttypid, a.atttypmod)
         || case when a.attnotnull then ' not null' else '' end
         || coalesce(' default ' || regexp_replace(pg_get_expr(ad.adbin, ad.adrelid), '\s+', ' ', 'g'), '')
         || case a.attidentity when 'a' then ' identity always' when 'd' then ' identity by default' else '' end
  from rel r
  join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  where r.relkind in ('r', 'p')

  union all
  -- Primary keys, foreign keys, uniques and checks.
  select 'constraint', r.relname || '.' || con.conname, pg_get_constraintdef(con.oid)
  from rel r
  join pg_constraint con on con.conrelid = r.oid

  union all
  -- Indexes, including the ones behind constraints.
  select 'index', i.relname, pg_get_indexdef(i.oid)
  from rel r
  join pg_index x on x.indrelid = r.oid
  join pg_class i on i.oid = x.indexrelid

  union all
  -- Policies on public tables and on storage.objects.
  select 'policy', c.relname || ': ' || pol.polname,
         pol.polcmd::text
         || case when pol.polpermissive then ' permissive' else ' restrictive' end
         || ' to ' || coalesce((
              select string_agg(case when rid = 0 then 'public' else pg_get_userbyid(rid) end, ',' order by 1)
              from unnest(pol.polroles) as rid
            ), '')
         || coalesce(' using ' || regexp_replace(pg_get_expr(pol.polqual, pol.polrelid), '\s+', ' ', 'g'), '')
         || coalesce(' check ' || regexp_replace(pg_get_expr(pol.polwithcheck, pol.polrelid), '\s+', ' ', 'g'), '')
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects')

  union all
  -- Functions: what they return, how they run, and a hash of the body.
  select 'function', sig,
         pg_get_function_result(oid)
         || ' lang=' || (select lanname from pg_language l where l.oid = prolang)
         || case when prosecdef then ' security definer' else '' end
         || ' vol=' || provolatile::text
         || coalesce(' config=' || array_to_string(proconfig, ','), '')
         || ' body=' || md5(btrim(regexp_replace(prosrc, '\s+', ' ', 'g')))
  from fn

  union all
  -- Who may call each function directly over the API. Trigger functions
  -- are left out: Postgres never lets them be called as an RPC, whatever
  -- the grant says.
  select 'execute', sig,
         'anon=' || has_function_privilege('anon', oid, 'execute')
         || ' authenticated=' || has_function_privilege('authenticated', oid, 'execute')
  from fn
  where prorettype <> 'trigger'::regtype

  union all
  -- Triggers on public tables, and on auth.users when the function is ours.
  select 'trigger', c.relname || ': ' || t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace pn on pn.oid = p.pronamespace
  where not t.tgisinternal
    and (n.nspname = 'public' or (n.nspname = 'auth' and pn.nspname = 'public'))

  union all
  -- Views, by a hash of their definition.
  select 'view', relname,
         md5(btrim(regexp_replace(pg_get_viewdef(oid, true), '\s+', ' ', 'g')))
         || (select coalesce(' options=' || array_to_string(reloptions, ','), '') from pg_class where oid = rel.oid)
  from rel
  where relkind in ('v', 'm')

  union all
  -- Storage buckets: who can read them, and what they accept.
  select 'bucket', id,
         'public=' || public
         || ' limit=' || coalesce(file_size_limit::text, 'none')
         || ' types=' || coalesce(array_to_string(allowed_mime_types, ','), 'any')
  from storage.buckets

  union all
  -- What the API roles may do to each table and view. Supabase grants
  -- everything by default; anything narrower is a decision worth tracking.
  select 'grant', relname,
         'anon=' || concat_ws(',',
           case when has_table_privilege('anon', oid, 'select') then 'select' end,
           case when has_table_privilege('anon', oid, 'insert') then 'insert' end,
           case when has_table_privilege('anon', oid, 'update') then 'update' end,
           case when has_table_privilege('anon', oid, 'delete') then 'delete' end)
         || ' authenticated=' || concat_ws(',',
           case when has_table_privilege('authenticated', oid, 'select') then 'select' end,
           case when has_table_privilege('authenticated', oid, 'insert') then 'insert' end,
           case when has_table_privilege('authenticated', oid, 'update') then 'update' end,
           case when has_table_privilege('authenticated', oid, 'delete') then 'delete' end)
  from rel
) f
order by kind, key;
