-- Client preference notes (Simas 11-10): what each lead likes / dislikes / asked for, added after every reply.
-- Mirrors docs/clients/<email>.md on Simas's Mac so both Claudes and the founders read one set.
create table if not exists public.client_notes (
  id bigserial primary key,
  lead_email text not null,
  kind text not null default 'fact',      -- like / dislike / ask / fact / price
  note text not null,
  actor text,
  created_at timestamptz not null default now(),
  unique (lead_email, kind, note)
);
create index if not exists client_notes_lead on public.client_notes (lead_email, created_at);
alter table public.client_notes enable row level security;
drop policy if exists "founders read" on public.client_notes;
create policy "founders read" on public.client_notes for select using (public.is_admin());
drop policy if exists "founders write" on public.client_notes;
create policy "founders write" on public.client_notes for all using (public.is_admin()) with check (public.is_admin());
