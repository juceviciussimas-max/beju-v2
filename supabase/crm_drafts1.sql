-- crm_drafts1.sql (Benas's side, 11-21): founder approval for lane-3 replies (BENAS 17:2x: big deals + scopes, client
-- problems, new terms, big names). A Claude writes a DRAFT; only a founder (CRM login with 2-step = is_admin()) can
-- approve it; a plain sender (draft-sender Edge Function, no AI) sends ONLY the exact approved text, and only if the
-- thread hasn't moved since the draft was written. No founder answer = it waits (no timeout).
--   Claude:  crm-api draft_create -> status 'pending' (+ the Claude posts it in #red-alert)
--   Founder: CRM "Waiting for approval": Approve / Edit (then Approve) / Hold / Reject  (UPDATE under is_admin)
--   Sender:  every minute: approved + text unchanged + thread unchanged -> send -> 'sent' (else 'stale' / 'failed')
-- ADDITIVE ONLY. Rollback: drop the trigger, 3 functions and the table.

create table if not exists public.drafts (
  id               bigint generated always as identity primary key,
  lead_email       text not null check (lead_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  inbox            text not null check (inbox ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),   -- the eaccount it goes out from
  reply_to_id      text not null,                -- the thread's LATEST email id when the draft was written
  category         text not null check (category in ('big_deal', 'client_problem', 'new_terms', 'big_name', 'other')),
  reason           text check (reason is null or char_length(reason) <= 500),   -- why a founder is needed
  body             text not null check (char_length(body) between 1 and 8000),
  body_sha256      text not null default '',     -- set by the trigger
  status           text not null default 'pending' check (status in ('pending', 'held', 'approved', 'rejected', 'sent', 'stale', 'failed')),
  created_by       text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  decided_by       text,                         -- the founder (profiles.name) who approved / held / rejected
  decided_at       timestamptz,
  approved_sha256  text,                         -- fingerprint of the exact text the founder approved
  founder_note     text check (founder_note is null or char_length(founder_note) <= 1000),
  reminders        int not null default 0,
  last_reminded_at timestamptz,
  sent_at          timestamptz,
  sent_email_id    text,
  error            text
);
create index if not exists drafts_open_idx on public.drafts (status, created_at) where status in ('pending', 'held', 'approved');

alter table public.drafts enable row level security;
drop policy if exists "founders read" on public.drafts;
create policy "founders read" on public.drafts for select using (public.is_admin());
drop policy if exists "founders decide" on public.drafts;
create policy "founders decide" on public.drafts for update using (public.is_admin()) with check (public.is_admin());
revoke all on public.drafts from anon, authenticated;
grant select on public.drafts to authenticated;
grant update (status, body, founder_note) on public.drafts to authenticated;   -- founders: decide or edit, nothing else

-- The rules live here, so neither a Claude nor a script can skip them (the service role bypasses RLS, not triggers):
--  * only a founder (is_admin) can move a draft to approved / held / rejected;
--  * approving stores the fingerprint of the text AT THAT MOMENT; any later edit drops it back to pending;
--  * only an approved draft can become sent / stale / failed, and a sent draft never changes again.
create or replace function public.drafts_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare founder text;
begin
  new.body_sha256 := encode(sha256(convert_to(new.body, 'UTF8')), 'hex');
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then raise exception 'a new draft starts as pending'; end if;
    new.approved_sha256 := null; new.decided_by := null; new.decided_at := null;
    return new;
  end if;
  if old.status = 'sent' then raise exception 'draft % was already sent; it cannot change', old.id; end if;
  if new.body is distinct from old.body and new.status = old.status and old.status = 'approved' then
    new.status := 'pending'; new.approved_sha256 := null;            -- edited after approval: needs a new approval
  end if;
  if new.status is distinct from old.status then
    if new.status in ('approved', 'held', 'rejected', 'pending') then
      if not public.is_admin() then raise exception 'only a founder can % a draft', new.status; end if;
      select coalesce(nullif(name, ''), email) into founder from public.profiles where id = auth.uid();
      new.decided_by := founder; new.decided_at := now();
      new.approved_sha256 := case when new.status = 'approved' then new.body_sha256 end;
    elsif new.status in ('sent', 'stale', 'failed') then
      if old.status <> 'approved' then raise exception 'only an approved draft can become %', new.status; end if;
      if new.status = 'sent' and old.approved_sha256 is distinct from new.body_sha256 then
        raise exception 'the text changed after approval; not sending';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists drafts_guard on public.drafts;
create trigger drafts_guard before insert or update on public.drafts for each row execute function public.drafts_guard();

-- What the CRM list and the reminders read: waiting drafts, oldest first, with how long they've waited.
create or replace view public.drafts_waiting with (security_invoker = on) as
select d.id, d.lead_email, d.inbox, d.category, d.reason, d.body, d.status, d.created_by, d.created_at, d.decided_by,
       d.decided_at, d.founder_note, d.reminders, round(extract(epoch from (now() - d.created_at)) / 60)::int waiting_min
from public.drafts d where d.status in ('pending', 'held', 'approved')
order by d.created_at;
revoke all on public.drafts_waiting from anon, authenticated;
grant select on public.drafts_waiting to authenticated;
