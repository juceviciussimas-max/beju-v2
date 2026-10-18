-- BEJÚ CRM: every client who ever paid (portal or not), their payments (Stripe) and the videos we delivered (Drive).
-- Founders only (profiles.is_admin). Filled by scripts/crm_sync.py (service role) and the stripe-webhook function.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emails text[] not null default '{}',          -- every address they paid or wrote from (lower case)
  show text,
  youtube text,
  instagram text,
  website text,
  niche text,
  source text,                                  -- cold email / referral / portal / ...
  notes text,
  drive_folder text,                            -- name of their folder in the Beju Drive
  user_id uuid references public.profiles on delete set null,   -- their portal account, if any
  created_at timestamptz not null default now()
);
create unique index if not exists clients_name_key on public.clients (lower(name));

create table if not exists public.payments (
  id text primary key,                          -- Stripe charge id
  client_id uuid references public.clients on delete set null,
  email text,
  payer_name text,
  amount numeric not null,
  currency text not null default 'usd',
  package text,                                 -- metadata.package (short_5, long_3, ...)
  description text,
  refunded boolean not null default false,
  paid_at timestamptz not null
);

create table if not exists public.deliveries (
  id text primary key,                          -- Drive file id
  client_id uuid references public.clients on delete cascade,
  title text not null,
  order_name text,
  kind text,
  duration_s int,
  link text,
  delivered_at date
);

alter table public.clients enable row level security;
alter table public.payments enable row level security;
alter table public.deliveries enable row level security;

drop policy if exists "founders clients" on public.clients;
create policy "founders clients" on public.clients for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "founders payments" on public.payments;
create policy "founders payments" on public.payments for select using (public.is_admin());
drop policy if exists "founders deliveries" on public.deliveries;
create policy "founders deliveries" on public.deliveries for select using (public.is_admin());
