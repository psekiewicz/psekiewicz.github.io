-- Schedules the announcement-cleanup Edge Function. Run this once in the SQL
-- editor of a real Supabase project, AFTER deploying the function
-- (supabase functions deploy announcement-cleanup --no-verify-jwt). It is not
-- part of schema.sql because it needs pg_cron and the project's own URL, which
-- a plain Postgres (the one the tests run against) has neither of.

-- Runs announcement-cleanup (supabase/functions/announcement-cleanup) every 15
-- minutes: files of withdrawn, replaced and expired announcements go, and so do
-- uploads that never got attached to one. Replace <project-ref> with your
-- project's reference (the part of the API URL before .supabase.co).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('announcement-cleanup')
where exists (select 1 from cron.job where jobname = 'announcement-cleanup');

select cron.schedule(
  'announcement-cleanup',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/announcement-cleanup',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $cron$
);
