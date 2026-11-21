-- crm_contacts1.sql (Benas's side, 11-21): ONE contacts list (BENAS approved the build 11-21).
-- One row per PERSON: a paying client is one row with all its addresses (clients.emails); everyone else is one row per
-- address. Built live from what we already store (pipeline, interested_leads, threads, reply_queue, clients, payments,
-- lead_stage, lead_next_step, orders, tasks, desk holds), so it can never drift. Only the facts nobody else stores live in
-- `contact_info` (phone, role, tags, notes, and name/company overrides), written by founders (CRM) or crm-api.
-- ADDITIVE ONLY. Rollback: drop view public.contacts; drop table public.contact_info;

create table if not exists public.contact_info (
  email       text primary key check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),   -- the contact's primary address
  name        text check (name is null or char_length(name) <= 120),
  company     text check (company is null or char_length(company) <= 160),
  role        text check (role is null or char_length(role) <= 120),
  phone       text check (phone is null or char_length(phone) <= 40),
  linkedin    text check (linkedin is null or char_length(linkedin) <= 300),
  tags        text[] not null default '{}',
  notes       text check (notes is null or char_length(notes) <= 4000),
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.contact_info enable row level security;
drop policy if exists "founders all" on public.contact_info;
create policy "founders all" on public.contact_info for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.contact_info from anon, authenticated;
grant select, insert, update on public.contact_info to authenticated;

create or replace view public.contacts with (security_invoker = on) as
with cl as (                                   -- every client address -> its client
  select lower(x) e, c.id client_id from public.clients c, unnest(c.emails) x
), addr as (                                   -- every address we know, with the person it belongs to
  select e, coalesce((select 'client:' || cl.client_id from cl where cl.e = a.e limit 1), e) pkey
  from (select lower(email) e from public.pipeline where email is not null
        union select lower(email) from public.interested_leads where email is not null
        union select lower(lead_email) from public.threads where lead_email is not null
        union select lower(lead_email) from public.reply_queue where lead_email is not null
        union select e from cl) a
), people as (
  select pkey, array_agg(e order by e) emails from addr group by pkey
  union all                                    -- a client with no address on file still counts (e.g. paid by someone else)
  select 'client:' || c.id, '{}'::text[] from public.clients c where coalesce(array_length(c.emails, 1), 0) = 0
), th as (
  select lower(lead_email) e, min(at) first_at, max(at) last_at, max(at) filter (where direction = 'in') last_in_at,
         count(*) msgs, (array_agg(inbox order by at desc))[1] last_inbox
  from public.threads group by 1
), paid as (
  select client_id, sum(amount) filter (where not refunded) usd, max(paid_at) last_paid_at from public.payments group by 1
)
select pp.pkey contact_id,
       coalesce(c.emails[1], pp.emails[1]) primary_email,
       pp.emails,
       coalesce(ci.name, c.name, max(p.name), max(ls.name), max(il.first_name)) name,
       coalesce(ci.company, c.show, max(p.show), max(il.company)) company,
       ci.role, ci.phone, ci.linkedin, coalesce(ci.tags, '{}') tags, ci.notes,
       nullif(case when split_part(coalesce(c.emails[1], pp.emails[1]), '@', 2)
                    ~ '^(gmail|googlemail|hotmail|outlook|yahoo|icloud|me|aol|live|msn|proton|protonmail)\.' then ''
                   else split_part(coalesce(c.emails[1], pp.emails[1]), '@', 2) end, '') company_domain,
       c.id client_id, (c.id is not null and coalesce(pd.usd, 0) > 0) is_client, coalesce(pd.usd, 0) lifetime_usd, pd.last_paid_at,
       max(ls.stage) stage, coalesce(max(ls.owner), max(p.owner)) owner,
       max(nx.next_step) next_step, min(nx.next_at) next_at,
       coalesce(max(p.inbox), max(il.inbox), (array_agg(th.last_inbox order by th.last_at desc nulls last))[1]) inbox,
       coalesce(max(p.campaign), max(il.campaign)) campaign,
       min(th.first_at) first_contact_at, max(th.last_at) last_contact_at, max(th.last_in_at) last_reply_at, coalesce(sum(th.msgs), 0)::int messages,
       (select count(*) from public.orders o where o.client_id = c.id and o.status = 'open')::int open_orders,
       (select count(*) from public.tasks t where lower(t.lead_email) = any(pp.emails) and t.status in ('todo', 'doing'))::int open_tasks,
       (select count(*) from public.promises pr where lower(pr.lead_email) = any(pp.emails) and pr.status = 'open')::int open_promises,
       exists (select 1 from public.desk_items h where h.kind = 'hold' and h.status = 'open' and h.emails && pp.emails) on_hold,
       c.website, c.instagram, c.youtube, c.niche, coalesce(c.source, max(p.source)) source
from people pp
left join public.clients c on pp.pkey = 'client:' || c.id
left join paid pd on pd.client_id = c.id
left join public.contact_info ci on ci.email = coalesce(c.emails[1], pp.emails[1])
left join public.pipeline p on lower(p.email) = any(pp.emails)
left join public.interested_leads il on lower(il.email) = any(pp.emails)
left join public.lead_stage ls on lower(ls.email) = any(pp.emails)
left join public.lead_next_step nx on lower(nx.email) = any(pp.emails)
left join th on th.e = any(pp.emails)
group by pp.pkey, pp.emails, c.id, c.emails, c.name, c.show, c.website, c.instagram, c.youtube, c.niche, c.source, pd.usd, pd.last_paid_at,
         ci.email, ci.name, ci.company, ci.role, ci.phone, ci.linkedin, ci.tags, ci.notes;
revoke all on public.contacts from anon, authenticated;
grant select on public.contacts to authenticated;   -- security_invoker: founders only, through the base tables' RLS
