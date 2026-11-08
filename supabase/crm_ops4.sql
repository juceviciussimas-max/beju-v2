-- CRM ops core, part 4 (11-08): client-side flags in the same queue (Roast Room: fold retention flags into one queue).
create table if not exists public.briefs (
  email text not null,
  submitted_at timestamptz not null,
  primary key (email, submitted_at)
);
alter table public.briefs enable row level security;
drop policy if exists "founders read" on public.briefs;
create policy "founders read" on public.briefs for select using (public.is_admin());

create or replace view public.needs_attention as
  select 'reply'::text as kind, r.lead_email, p.name, coalesce(p.owner, '') as owner, r.inbox,
         r.received_at as due_at, r.snippet as detail
    from public.reply_queue r left join public.pipeline p on p.email = r.lead_email
   where r.kind = 'REAL' and not r.answered and not r.blocklisted
     and not exists (select 1 from public.reply_dismissals d where d.lead_email = r.lead_email and d.received_at >= r.received_at)
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
   where x.status = 'open' and x.due_at < now()
  union all
  -- paid 48h+ ago (last 30 days), nothing delivered to that client since
  select 'paid_waiting', pay.email, c.name, coalesce(p.owner, ''), p.inbox, pay.paid_at,
         'paid $' || pay.amount::int || coalesce(' · ' || pay.package, '') ||
         case when exists (select 1 from public.deliveries d0 where d0.client_id = pay.client_id)
              then ', nothing delivered since' else ', deliveries not indexed: check their Drive folder' end
    from public.payments pay left join public.clients c on c.id = pay.client_id
         left join public.pipeline p on p.email = lower(pay.email)
   where not pay.refunded and pay.paid_at > now() - interval '10 days' and pay.paid_at < now() - interval '48 hours'
     and not exists (select 1 from public.deliveries d where d.client_id = pay.client_id and d.delivered_at >= pay.paid_at)
  union all
  -- sample yes 24h+ ago, no brief form and not delivered yet
  select 'brief', p.email, p.name, p.owner, p.inbox, p.yes_at, 'said yes, no brief form yet'
    from public.pipeline p
   where p.status in ('YES','CLAIMED') and p.yes_at < now() - interval '24 hours'
     and not exists (select 1 from public.briefs b where b.email = p.email and b.submitted_at >= p.yes_at - interval '2 hours');
alter view public.needs_attention set (security_invoker = on);
