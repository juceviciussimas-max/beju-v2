-- NOT APPLIED YET. Money page (SIMAS 11-14: "get the money straight … be our financial boss").
-- One row, id = 'current': the JSON snapshot that scripts/finance.py --sync builds (Dashboard repo) from the
-- "Beju Finance" sheet and Stripe: month P&L, Stripe balance, bills for the next 45 days, payouts per founder,
-- transfers, the 50/50 position and the alerts. crm/money.html reads it through the founder's own login.
-- Same protection as the other founder tables (crm_bento2.sql): row-level security with is_admin(), no anon access,
-- read-only for logged-in users. The service role (finance.py) bypasses RLS and is the only writer.
-- Additive only.

create table if not exists public.finance_snapshot (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.finance_snapshot enable row level security;
drop policy if exists "founders read" on public.finance_snapshot;
create policy "founders read" on public.finance_snapshot for select using (public.is_admin());
revoke all on public.finance_snapshot from anon;
revoke insert, update, delete, truncate, references, trigger on public.finance_snapshot from authenticated;
grant select on public.finance_snapshot to authenticated;

-- Check after applying (as a founder in the CRM, or in the SQL editor):
--   select id, updated_at, jsonb_array_length(data->'alerts') as alerts from public.finance_snapshot;
-- A client login must get 0 rows; anon gets "permission denied".
