-- crm_drafts2.sql (Benas's side, 11-21): run the plain draft-sender every minute (needs crm_drafts1.sql + the
-- draft-sender function deployed with --no-verify-jwt). Same pattern as ops-sync / instantly-sync / slack-sync.
-- Replace <CRON_SECRET> with the value the other cron jobs use (Supabase secret CRON_SECRET) when applying; never commit it.
-- Rollback: select cron.unschedule('draft-sender');
select cron.unschedule('draft-sender') where exists (select 1 from cron.job where jobname = 'draft-sender');
select cron.schedule('draft-sender', '* * * * *', $$
  select net.http_post(url := 'https://zfnpvcrnujxlycmqukqs.supabase.co/functions/v1/draft-sender',
                       headers := '{"x-cron-secret": "<CRON_SECRET>", "Content-Type": "application/json"}'::jsonb,
                       body := '{}'::jsonb, timeout_milliseconds := 60000)
$$);
