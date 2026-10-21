-- BEJÚ founders CRM, part 2 (2026-10-21): live outreach numbers, the lead pipeline, today's list, notes with due dates.
-- Founders only (profiles.is_admin). Filled by the instantly-sync function (every 10 min, pg_cron) and scripts/crm_sync.py.

create table if not exists public.campaign_live (
  campaign_id text primary key,
  name text not null,
  status int,
  daily_max_leads int,                          -- new leads Instantly starts per day
  daily_limit int,                              -- emails per day, all steps
  inboxes int,
  leads_total int,
  new_contacted int,
  uncontacted int,
  emails_sent int,
  replies int,                                  -- unique, human
  replies_auto int,
  bounced int,
  unsubscribed int,
  opportunities int,
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_daily (
  campaign_id text not null,
  day date not null,
  sent int, new_leads int, replies int, replies_auto int, opportunities int,
  primary key (campaign_id, day)
);

create table if not exists public.inbox_live (
  email text primary key,
  status int, warmup_score int, daily_limit int,
  campaigns text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.inbox_daily (
  email text not null,
  day date not null,
  sent int, new_leads int, replies int, bounced int,
  primary key (email, day)
);

-- One row per sample / hot lead, mirrored from the team sheet's Samples tab (crm_sync.py, hourly).
create table if not exists public.pipeline (
  email text primary key,
  name text, show text, owner text, inbox text, status text,
  yes_at timestamptz, due_at timestamptz, delivered_at timestamptz, last_reply_at timestamptz,
  next_action text, next_action_at timestamptz, paid text, drive_link text, notes text,
  updated_at timestamptz not null default now()
);

-- Things happening today that only the Mac knows (follow-up texts queued for 16:00, ...). Replaced on every sync.
create table if not exists public.today_items (
  id text primary key,
  day date not null,
  kind text not null,                           -- followup / sample_due / action / call
  title text not null,
  detail text,
  at timestamptz,
  lead_email text
);

create table if not exists public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients on delete cascade,
  lead_email text,
  body text not null,
  due_at date,
  done boolean not null default false,
  author text,
  created_at timestamptz not null default now()
);

create table if not exists public.sync_status (
  name text primary key,                        -- instantly / sheet
  ran_at timestamptz not null default now(),
  ok boolean not null default true,
  detail text
);

do $$ declare t text; begin
  foreach t in array array['campaign_live','campaign_daily','inbox_live','inbox_daily','pipeline','today_items','crm_notes','sync_status'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "founders read" on public.%I', t);
    execute format('create policy "founders read" on public.%I for select using (public.is_admin())', t);
  end loop;
end $$;
drop policy if exists "founders write notes" on public.crm_notes;
create policy "founders write notes" on public.crm_notes for all using (public.is_admin()) with check (public.is_admin());
