-- Follow-up cadence in the database (Simas 11-10: "replace the daily follow-up rule, but make sure you're not forgetting
-- when to send to the hot leads"). BENAS RULE 11-09: no third follow-up, so two touches per stage, then park.
-- fu_state = every lead with a follow-up stage: touches done (our emails since day 0), whether they replied, when the next
-- touch is due. needs_attention gains kind 'followup' (due today or earlier), so it shows in the founders' queue and in
-- crm.py recap even when no Claude session is running.
create or replace function public.add_biz(t timestamptz, n int) returns timestamptz language plpgsql stable as $$
declare d timestamptz := t; i int := greatest(n, 0);
begin
  while i > 0 loop
    d := d + interval '1 day';
    if extract(isodow from (d at time zone 'Europe/Vilnius')) < 6 then i := i - 1; end if;
  end loop;
  return d;
end $$;

create or replace view public.fu_state as
with c(stage, days, park) as (values
  ('asked_price', array[2,7], 30), ('sample_sent', array[1,4], 30), ('said_yes', array[1,3], 20),
  ('thinking', array[0,7], 20), ('parked', array[0], 40)),   -- park = working days from day 0 until the one re-engage
t as (
  select p.email, p.name, p.show, p.owner, p.inbox, p.status, p.fu_stage, p.fu_day0, p.fu_note, c.days, c.park,
    (select count(*) from public.threads th where th.lead_email = p.email and th.direction = 'out'
        and th.at > p.fu_day0 + interval '5 minutes')::int as outs,
    (select max(th.at) from public.threads th where th.lead_email = p.email and th.direction = 'out') as last_out,
    (select max(th.at) from public.threads th where th.lead_email = p.email and th.direction = 'in'
        and th.at > p.fu_day0 + interval '5 minutes'
        and coalesce(th.snippet,'') !~* 'out of (the )?office|time away from work|auto(matic)?[- ]?reply|(have|has been) received|on (vacation|holiday|leave)|view (this email )?in (your )?browser|unsubscribe') as replied_at
  from public.pipeline p join c on c.stage = p.fu_stage
  where p.fu_day0 is not null and coalesce(p.paid,'') = '' and coalesce(p.status,'') !~* 'LOST|WON|DONE'
)
select email, name, show, owner, inbox, status, fu_stage, fu_day0, fu_note,
  outs as touches_done, array_length(days,1) as touches_total, replied_at, last_out,
  case when replied_at is not null then 'replied' when outs >= array_length(days,1) then 'finished' else 'active' end as state,
  case when replied_at is null and outs < array_length(days,1) then public.add_biz(fu_day0, days[outs+1]) end as due_at,
  case when replied_at is null and outs >= array_length(days,1) then public.add_biz(fu_day0, park) end as reengage_at
from t;
alter view public.fu_state set (security_invoker = on);

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
     and coalesce(p.fu_stage,'') in ('', 'none')          -- leads on the cadence show as 'followup' instead
  union all
  select 'no_next', p.email, p.name, p.owner, p.inbox, null, p.status
    from public.pipeline p
   where coalesce(p.next_action,'') = '' and coalesce(p.status,'') not in ('WON','LOST','SILENT','DONE')
     and coalesce(p.fu_stage,'') in ('', 'none')
  union all
  select 'promise', x.lead_email, p.name, x.owner, p.inbox, x.due_at, x.promise
    from public.promises x left join public.pipeline p on p.email = x.lead_email
   where x.status = 'open' and x.due_at < now()
  union all
  select 'paid_waiting', pay.email, c.name, coalesce(p.owner, ''), p.inbox, pay.paid_at,
         'paid $' || pay.amount::int || coalesce(' · ' || pay.package, '') ||
         case when exists (select 1 from public.deliveries d0 where d0.client_id = pay.client_id)
              then ', nothing delivered since' else ', deliveries not indexed: check their Drive folder' end
    from public.payments pay left join public.clients c on c.id = pay.client_id
         left join public.pipeline p on p.email = lower(pay.email)
   where not pay.refunded and pay.paid_at > now() - interval '10 days' and pay.paid_at < now() - interval '48 hours'
     and not exists (select 1 from public.deliveries d where d.client_id = pay.client_id and d.delivered_at >= pay.paid_at)
  union all
  select 'brief', p.email, p.name, p.owner, p.inbox, p.yes_at, 'said yes, no brief form yet'
    from public.pipeline p
   where p.status in ('YES','CLAIMED') and p.yes_at < now() - interval '24 hours'
     and not exists (select 1 from public.briefs b where b.email = p.email and b.submitted_at >= p.yes_at - interval '2 hours')
  union all
  -- follow-up due today or earlier (never two touches inside 20 hours)
  select 'followup', f.email, f.name, f.owner, f.inbox, f.due_at,
         'follow-up ' || (f.touches_done + 1) || ' of ' || f.touches_total || ' · ' || replace(f.fu_stage, '_', ' ') ||
         coalesce(' · they said: ' || left(f.fu_note, 120), '')
    from public.fu_state f
   where f.state = 'active' and f.due_at < (date_trunc('day', now() at time zone 'Europe/Vilnius') + interval '1 day') at time zone 'Europe/Vilnius'
     and (f.last_out is null or f.last_out < now() - interval '20 hours')
  union all
  -- both touches sent and no answer: park it (crm.py roll does this)
  select 'followup_done', f.email, f.name, f.owner, f.inbox, f.reengage_at,
         'both follow-ups sent, no answer: park until ' || to_char(f.reengage_at at time zone 'Europe/Vilnius', 'DD Mon')
    from public.fu_state f where f.state = 'finished' and f.fu_stage <> 'parked';
alter view public.needs_attention set (security_invoker = on);
