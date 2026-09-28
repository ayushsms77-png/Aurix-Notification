-- Aurix push notifications: scheduler. Runs every minute; send-due only sends
-- messages whose scheduled_at has passed. Times are stored as timestamptz (UTC)
-- and published from IST (+05:30) by the push-admin function.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Random cron key generated inside the database; never leaves it.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'aurix_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
                                'aurix_cron_secret', 'pg_cron -> push-admin auth');
  end if;
end $$;

insert into public.admin_keys (kind, key_hash)
select 'cron', encode(extensions.digest(decrypted_secret, 'sha256'), 'hex')
  from vault.decrypted_secrets where name = 'aurix_cron_secret'
on conflict (kind) do update set key_hash = excluded.key_hash, updated_at = now();

do $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('aurix-send-due','aurix-check-receipts');
end $$;

select cron.schedule('aurix-send-due', '* * * * *', $job$
  select net.http_post(
    url := 'https://gvjmhlwkunsqoimxjssn.supabase.co/functions/v1/push-admin/send-due',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'aurix_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 25000);
$job$);

select cron.schedule('aurix-check-receipts', '*/15 * * * *', $job$
  select net.http_post(
    url := 'https://gvjmhlwkunsqoimxjssn.supabase.co/functions/v1/push-admin/check-receipts',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'aurix_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 25000);
$job$);
