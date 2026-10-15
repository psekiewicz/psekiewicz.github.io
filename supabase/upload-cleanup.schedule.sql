-- Schedules the upload-cleanup Edge Function. Run this once in the SQL editor
-- of a real Supabase project, AFTER deploying the function
-- (supabase functions deploy upload-cleanup --no-verify-jwt). It is not part
-- of schema.sql for the same reason as announcement-cleanup.schedule.sql: it
-- needs pg_cron and the project's own URL.

-- Runs upload-cleanup (supabase/functions/upload-cleanup) once an hour: files
-- in the uploads bucket that no post, profile, comment or announcement refers
-- to, and that are more than a day old, are deleted. Replace <project-ref>
-- with your project's reference (the part of the API URL before .supabase.co).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('upload-cleanup')
where exists (select 1 from cron.job where jobname = 'upload-cleanup');

select cron.schedule(
  'upload-cleanup',
  '17 * * * *',
  $cron$
    select net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/upload-cleanup',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $cron$
);
