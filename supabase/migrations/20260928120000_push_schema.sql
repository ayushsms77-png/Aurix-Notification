-- Aurix push notifications: schema.
-- Access model: RLS is ON for every table with NO policies, and all grants to
-- anon/authenticated are revoked. Only Edge Functions (service role) read/write.

create table if not exists public.devices (
  id               uuid primary key default gen_random_uuid(),
  expo_push_token  text not null unique
                   check (expo_push_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$'),
  platform         text not null default 'android' check (platform in ('android','ios')),
  app_version      text check (char_length(app_version) <= 32),
  active           boolean not null default true,
  disabled_reason  text,
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists devices_active_idx on public.devices (active) where active;

create table if not exists public.notification_messages (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid,
  title         text not null check (char_length(title) between 1 and 65),
  body          text not null check (char_length(body) between 1 and 200),
  status        text not null default 'scheduled'
                check (status in ('scheduled','sending','sent','partial','failed','cancelled')),
  scheduled_at  timestamptz not null default now(),
  claimed_at    timestamptz,
  sent_at       timestamptz,
  sent_count    integer not null default 0,
  error_count   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists notification_messages_due_idx
  on public.notification_messages (scheduled_at) where status in ('scheduled','sending');

create table if not exists public.notification_deliveries (
  id              bigint generated always as identity primary key,
  message_id      uuid not null references public.notification_messages(id) on delete cascade,
  device_id       uuid not null references public.devices(id) on delete cascade,
  ticket_id       text,
  status          text not null check (status in ('ok','error')),
  error           text,
  receipt_status  text not null default 'pending' check (receipt_status in ('pending','ok','error','unknown')),
  receipt_error   text,
  created_at      timestamptz not null default now(),
  checked_at      timestamptz,
  unique (message_id, device_id)
);
create index if not exists deliveries_receipt_idx
  on public.notification_deliveries (created_at) where receipt_status = 'pending' and ticket_id is not null;

-- Hashes of the publishing key ('admin') and the pg_cron key ('cron'). Raw keys are never stored here.
create table if not exists public.admin_keys (
  kind        text primary key check (kind in ('admin','cron')),
  key_hash    text not null,
  updated_at  timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger devices_touch before update on public.devices
  for each row execute function public.touch_updated_at();
create trigger messages_touch before update on public.notification_messages
  for each row execute function public.touch_updated_at();

-- Atomically claim due messages (also re-claims ones stuck in 'sending' > 10 min; sends are idempotent).
create or replace function public.claim_due_messages(p_limit int default 5)
returns setof public.notification_messages
language sql security invoker set search_path = public as $$
  update public.notification_messages m
     set status = 'sending', claimed_at = now()
   where m.id in (
     select id from public.notification_messages
      where (status = 'scheduled' and scheduled_at <= now())
         or (status = 'sending' and claimed_at < now() - interval '10 minutes')
      order by scheduled_at
      limit p_limit
      for update skip locked)
  returning m.*;
$$;

alter table public.devices                enable row level security;
alter table public.notification_messages  enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.admin_keys             enable row level security;

revoke all on public.devices, public.notification_messages,
              public.notification_deliveries, public.admin_keys from anon, authenticated;
revoke execute on function public.claim_due_messages(int) from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
grant  execute on function public.claim_due_messages(int) to service_role;
