-- BEJÚ CRM, part 5 (2026-11-08, Roast Room "ops core"): the CRM becomes the one place both Claudes work from.
-- Next action required, promises ledger, thread claims (no double-sends), stage history, one "needs attention" queue.

alter table public.pipeline add column if not exists source text;          -- stamped once at import, never overwritten
alter table public.pipeline add column if not exists campaign text;
alter table public.pipeline add column if not exists stage_changed_at timestamptz;

-- Every status change, from day one (funnel + velocity later).
create table if not exists public.stage_log (
  id bigserial primary key,
  lead_email text not null,
  from_status text,
  to_status text,
  actor text,
  at timestamptz not null default now()
);
create index if not exists stage_log_lead on public.stage_log (lead_email, at desc);

create or replace function public.log_stage() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or coalesce(old.status,'') is distinct from coalesce(new.status,'') then
    insert into public.stage_log (lead_email, from_status, to_status, actor)
    values (new.email, case when tg_op = 'UPDATE' then old.status end, new.status, current_setting('beju.actor', true));
    new.stage_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists pipeline_stage on public.pipeline;
create trigger pipeline_stage before insert or update on public.pipeline for each row execute function public.log_stage();

-- Promises made to a lead or client in our emails. Open ones block upsells and sales follow-ups.
create table if not exists public.promises (
  id uuid primary key default gen_random_uuid(),
  lead_email text not null,
  promise text not null,
  owner text not null,                 -- Simas / Benas (the side that must keep it)
  due_at timestamptz,
  status text not null default 'open', -- open / kept / void
  source_msg text,                     -- Instantly email id it was made in
  created_by text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists promises_open on public.promises (lead_email) where status = 'open';

-- One operator per thread at a time (claim before replying; expires so a crashed assistant can't block it).
create table if not exists public.thread_claims (
  lead_email text primary key,
  actor text not null,
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- The home queue. Kinds: reply (unanswered real reply), overdue (next action past due), no_next (open lead with no next action),
-- promise (promise past due), brief (paid but no brief yet, from today_items/notes later).
create or replace view public.needs_attention as
  select 'reply'::text as kind, r.lead_email, p.name, coalesce(p.owner, '') as owner, r.inbox,
         r.received_at as due_at, r.snippet as detail
    from public.reply_queue r left join public.pipeline p on p.email = r.lead_email
   where r.kind = 'REAL' and not r.answered and not r.blocklisted
  union all
  select 'overdue', p.email, p.name, p.owner, p.inbox, p.next_action_at, p.next_action
    from public.pipeline p
   where p.next_action_at < now() and coalesce(p.status,'') not in ('WON','LOST','SILENT','DONE')
  union all
  select 'no_next', p.email, p.name, p.owner, p.inbox, null, p.status
    from public.pipeline p
   where coalesce(p.next_action,'') = '' and coalesce(p.status,'') not in ('WON','LOST','SILENT','DONE')
  union all
  select 'promise', x.lead_email, p.name, x.owner, p.inbox, x.due_at, x.promise
    from public.promises x left join public.pipeline p on p.email = x.lead_email
   where x.status = 'open' and x.due_at < now();

do $$ declare t text; begin
  foreach t in array array['stage_log','promises','thread_claims'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "founders read" on public.%I', t);
    execute format('create policy "founders read" on public.%I for select using (public.is_admin())', t);
  end loop;
end $$;
drop policy if exists "founders write promises" on public.promises;
create policy "founders write promises" on public.promises for all using (public.is_admin()) with check (public.is_admin());
alter view public.needs_attention set (security_invoker = on);
