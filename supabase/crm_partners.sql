-- BEJÚ founders CRM, part 3 (2026-10-21, Simas: "add a tab for referrals/affiliates like Henry"; Roast Room 4/4).
-- Partners we trade with (group admins, creators): their channels, what each side owes, the clients they send us and the
-- commission we owe them. Referrals come from Stripe checkouts whose client_reference_id is the partner's ref_code
-- (bejucreative.digital/?ref=<code>), filled by scripts/crm_sync.py. Founders only.

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  ref_code text unique,                         -- = Stripe client_reference_id from ?ref=<code>
  name text not null,
  role text,                                    -- group admin / creator / community owner
  channels jsonb not null default '[]',         -- [{label, url, audience}]
  email text,
  owner text,                                   -- Simas / Benas
  status text not null default 'test',          -- test / active / paused / ended
  deal_start date,
  test_end date,
  renewal_at date,
  commission_pct numeric not null default 20,   -- % of each referred client's FIRST order
  terms text,
  notes text,
  client_id uuid references public.clients on delete set null,
  created_at timestamptz not null default now()
);

-- Both directions of the deal: what we owe them (Tuesday drops) and what they owe us (credit, pinned post, intros...).
create table if not exists public.partner_items (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners on delete cascade,
  direction text not null check (direction in ('we_owe', 'they_owe')),
  item text not null,
  due_at date,
  done_at timestamptz,
  proof_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id text primary key,                          -- Stripe checkout session id, or 'manual-<uuid>' for a hand-added one
  partner_id uuid not null references public.partners on delete cascade,
  source text not null default 'ref_link',      -- ref_link (Stripe client_reference_id) / intro (added by a founder)
  email text,
  name text,
  amount numeric not null,
  first_order boolean not null default true,
  commission numeric not null default 0,
  paid_at timestamptz not null,
  paid_out_at timestamptz                        -- when we paid the partner
);

do $$ declare t text; begin
  foreach t in array array['partners','partner_items','referrals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "founders all" on public.%I', t);
    execute format('create policy "founders all" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
