create table if not exists public.reply_dismissals (
  lead_email text not null,
  received_at timestamptz not null,
  actor text, reason text,
  at timestamptz not null default now(),
  primary key (lead_email, received_at)
);
alter table public.reply_dismissals enable row level security;
drop policy if exists "founders read" on public.reply_dismissals;
create policy "founders read" on public.reply_dismissals for select using (public.is_admin());
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
   where x.status = 'open' and x.due_at < now();
alter view public.needs_attention set (security_invoker = on);
