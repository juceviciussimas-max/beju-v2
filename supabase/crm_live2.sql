-- BEJÚ founders CRM, part 3 (2026-10-21): answers the questions the founders ask Claude most often.
-- Filled by scripts/crm_sync.py (Simas's Mac, hourly). Founders only.

alter table public.pipeline add column if not exists builder text;

-- Every lead who wrote to us in the last 7 days: "are all replies answered?"
create table if not exists public.reply_queue (
  lead_email text primary key,
  inbox text,
  received_at timestamptz,
  kind text,                                    -- REAL / AUTO
  answered boolean not null default false,
  blocklisted boolean not null default false,
  snippet text,
  synced_at timestamptz not null default now()
);

-- The last emails both ways with each pipeline lead: "what's the latest with X?"
create table if not exists public.threads (
  msg_id text primary key,
  lead_email text not null,
  at timestamptz,
  direction text,                               -- in / out
  inbox text,
  subject text,
  snippet text
);
create index if not exists threads_lead on public.threads (lead_email, at desc);

-- Leads pushed to Instantly per day and tab (sheet Status "in Instantly YYYY-MM-DD"): "did we hit 150 today?"
create table if not exists public.lead_adds (
  day date not null,
  tab text not null,
  n int not null,
  primary key (day, tab)
);

-- Hot-lead follow-ups sent by fu7: "are the hot leads getting follow-ups?"
create table if not exists public.fu_sends (
  lead_email text not null,
  day_n int not null,
  sent_at timestamptz,
  inbox text,
  primary key (lead_email, day_n)
);

do $$ declare t text; begin
  foreach t in array array['reply_queue','threads','lead_adds','fu_sends'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "founders read" on public.%I', t);
    execute format('create policy "founders read" on public.%I for select using (public.is_admin())', t);
  end loop;
end $$;
