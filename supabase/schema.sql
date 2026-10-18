-- BEJÚ Studio (client portal) schema. Run once on a fresh Supabase project (idempotent where cheap).
-- Rules the database enforces itself (not only the app):
--   * a client sees only their own profile, packs, videos, notes and files; admins (profiles.is_admin) see everything
--   * credits are only created by the Stripe webhook (service role) or an admin
--   * a client can start a video only on their own unexpired pack with credits left
--   * a client can only move a delivered video to 'approved', or to 'revision' within 48 h of delivery

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  pack_id text not null,
  videos int not null check (videos > 0),
  amount numeric not null default 0,
  stripe_session text unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  purchase_id uuid references public.purchases on delete set null,
  title text not null,
  notes text,
  footage text,
  status text not null default 'received' check (status in ('received','editing','ready','revision','approved')),
  result_url text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.video_notes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  at numeric not null default 0,
  text text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- every new login gets a profile
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email) values (new.id, new.raw_user_meta_data->>'name', new.email)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- credit check on new videos
create or replace function public.check_video_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.purchases; used int;
begin
  if public.is_admin() or auth.uid() is null then return new; end if;   -- admins and the service role (webhook, scripts)
  if new.user_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  new.status := 'received'; new.result_url := null; new.delivered_at := null;
  select * into p from public.purchases where id = new.purchase_id and user_id = new.user_id and expires_at > now();
  if not found then raise exception 'No valid pack for this video'; end if;
  select count(*) into used from public.videos where purchase_id = p.id;
  if used >= p.videos then raise exception 'No credits left on this pack'; end if;
  return new;
end $$;
drop trigger if exists videos_insert_check on public.videos;
create trigger videos_insert_check before insert on public.videos for each row execute function public.check_video_insert();

-- what a client may change on a video
create or replace function public.check_video_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or auth.uid() is null then return new; end if;   -- admins and the service role
  if old.status <> 'ready' or new.status not in ('approved','revision') then raise exception 'Not allowed'; end if;
  if new.status = 'revision' and old.delivered_at < now() - interval '48 hours' then raise exception 'The 48 h change window has closed'; end if;
  if (new.title, new.notes, new.footage, new.result_url, new.user_id, new.purchase_id, new.delivered_at)
     is distinct from (old.title, old.notes, old.footage, old.result_url, old.user_id, old.purchase_id, old.delivered_at)
  then raise exception 'Not allowed'; end if;
  return new;
end $$;
drop trigger if exists videos_update_check on public.videos;
create trigger videos_update_check before update on public.videos for each row execute function public.check_video_update();

-- row-level security
alter table public.profiles enable row level security;
alter table public.purchases enable row level security;
alter table public.videos enable row level security;
alter table public.video_notes enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "edit own name" on public.profiles;
create policy "edit own name" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (name) on public.profiles to authenticated;

drop policy if exists "own purchases" on public.purchases;
create policy "own purchases" on public.purchases for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "admin adds purchases" on public.purchases;
create policy "admin adds purchases" on public.purchases for insert with check (public.is_admin());

drop policy if exists "own videos" on public.videos;
create policy "own videos" on public.videos for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "start own video" on public.videos;
create policy "start own video" on public.videos for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "update own video" on public.videos;
create policy "update own video" on public.videos for update using (user_id = auth.uid() or public.is_admin());

drop policy if exists "own notes" on public.video_notes;
create policy "own notes" on public.video_notes for select
  using (public.is_admin() or exists (select 1 from public.videos v where v.id = video_id and v.user_id = auth.uid()));
drop policy if exists "note on own delivered video" on public.video_notes;
create policy "note on own delivered video" on public.video_notes for insert
  with check (user_id = auth.uid() and (public.is_admin() or exists (
    select 1 from public.videos v where v.id = video_id and v.user_id = auth.uid() and v.status = 'ready')));

-- storage: raw footage + finished Shorts, private, one folder per client (<user id>/...)
insert into storage.buckets (id, name, public, file_size_limit) values ('raw', 'raw', false, 52428800)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit) values ('finished', 'finished', false, 52428800)
  on conflict (id) do nothing;

drop policy if exists "upload own raw" on storage.objects;
create policy "upload own raw" on storage.objects for insert to authenticated
  with check (bucket_id = 'raw' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "read own files" on storage.objects;
create policy "read own files" on storage.objects for select to authenticated
  using (bucket_id in ('raw','finished') and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "admin writes finished" on storage.objects;
create policy "admin writes finished" on storage.objects for insert to authenticated
  with check (bucket_id = 'finished' and public.is_admin());
