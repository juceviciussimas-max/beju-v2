-- Client portal v2 (SIMAS 11-12 ~18:20: "a better dashboard … like frame.io … everything tracked … live … very safe").
-- Additive and idempotent. Review copies in the private "finished" bucket, comment threads with team replies,
-- realtime for every table the portal shows, upload types limited.

begin;

-- 1. A version can be an uploaded review copy: finished/<client uid>/<video id>/v<n>-<random>.mp4 (played through a
--    short-lived signed URL, never public). url stays NOT NULL: for an upload it holds the same storage path.
alter table public.video_versions add column if not exists storage_path text;

create or replace function public.check_version_path()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v public.videos;
begin
  if new.storage_path is null then return new; end if;
  select * into v from public.videos where id = new.video_id;
  if not found then raise exception 'Not allowed'; end if;
  -- the file must sit in this client's own folder, under this video
  if new.storage_path !~ ('^' || v.user_id::text || '/' || v.id::text || '/v[0-9]+[A-Za-z0-9_-]*\.(mp4|mov|webm)$') then
    raise exception 'Review copy path must be <client>/<video>/v<n>….mp4';
  end if;
  return new;
end $function$;
drop trigger if exists video_versions_path on public.video_versions;
create trigger video_versions_path before insert or update on public.video_versions
  for each row execute function public.check_version_path();

-- 2. Comment threads: a founder can answer a client's comment. author_role / author_name are set by the database
--    (a client can never write a "team" reply); team replies are not open change requests (done_at set).
alter table public.video_notes
  add column if not exists parent_id   uuid references public.video_notes(id) on delete cascade,
  add column if not exists author_role text not null default 'client',
  add column if not exists author_name text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'video_notes_author_role_check') then
    alter table public.video_notes add constraint video_notes_author_role_check check (author_role in ('client','team'));
  end if;
end $$;
create index if not exists video_notes_parent_idx on public.video_notes (parent_id);

create or replace function public.set_note_round()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v public.videos; par public.video_notes;
begin
  select * into v from public.videos where id = new.video_id;
  if new.parent_id is not null then
    select * into par from public.video_notes where id = new.parent_id;
    if not found or par.video_id is distinct from new.video_id then raise exception 'Not allowed'; end if;
    if par.parent_id is not null then new.parent_id := par.parent_id; end if;   -- threads stay one level deep
  end if;
  if public.is_admin() then                       -- a founder's note is a team reply
    new.author_role := 'team';
    new.author_name := coalesce((select nullif(trim(name), '') from public.profiles where id = auth.uid()), 'BEJÚ team');
    new.round := coalesce(par.round, greatest(1, coalesce(v.version, 1)));
    new.done_at := coalesce(new.done_at, now());
    if par.id is not null then new.at := par.at; end if;
    return new;
  end if;
  if auth.uid() is null then                      -- service role (scripts): keep what it sends
    new.author_role := coalesce(new.author_role, 'client');
    return new;
  end if;
  new.author_role := 'client'; new.author_name := null;   -- a client: fixed fields, never "team"
  new.round := greatest(1, coalesce(v.version, 1));
  new.done_at := null;
  if par.id is not null then new.at := par.at; end if;
  return new;
end $function$;
drop trigger if exists video_notes_round on public.video_notes;
create trigger video_notes_round before insert on public.video_notes for each row execute function public.set_note_round();

-- 3. Live updates for everything the portal shows (RLS still decides which rows each subscriber receives).
do $$
declare t text;
begin
  foreach t in array array['video_versions','purchases'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 4. Upload types: review copies are video files only; client footage (raw) is video, audio or images.
update storage.buckets set allowed_mime_types = array['video/mp4','video/quicktime','video/webm'] where id = 'finished';
update storage.buckets set allowed_mime_types = array['video/*','audio/*','image/*'] where id = 'raw';

commit;
