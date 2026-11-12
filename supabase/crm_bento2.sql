-- Hot leads = everyone Instantly marks "Interested" (SIMAS 11-12 18:15: "we have much more hot leads than 11").
-- The pipeline (Samples sheet) only holds leads who said yes to a sample; interested leads who asked a question,
-- wanted prices or are mid-conversation were invisible in the CRM. Filled by scripts/crm_interested.py (Dashboard repo).
create table if not exists public.interested_leads (
  email             text primary key,
  first_name        text,
  company           text,
  campaign_id       text,
  campaign          text,
  inbox             text,
  reply_count       integer,
  last_reply_at     timestamptz,
  last_contact_at   timestamptz,
  interest_changed_at timestamptz,
  created_at        timestamptz,
  synced_at         timestamptz not null default now()
);
alter table public.interested_leads enable row level security;
drop policy if exists "founders read" on public.interested_leads;
create policy "founders read" on public.interested_leads for select using (public.is_admin());
revoke all on public.interested_leads from anon;
revoke insert, update, delete, truncate, references, trigger on public.interested_leads from authenticated;
grant select on public.interested_leads to authenticated;
