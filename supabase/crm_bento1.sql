-- Founder CRM bento v2 (SIMAS 11-12 ~16:10: "make the bento integrated with the website and the client saas").
-- Additive only.
-- 1. Founders mark a client's change notes done from the CRM (the portal_ops.py script did this with the service role).
drop policy if exists "founders update notes" on public.video_notes;
create policy "founders update notes" on public.video_notes for update using (public.is_admin()) with check (public.is_admin());

-- 2. Live updates in the CRM (payments, replies, portal activity). Row-level security still decides who receives a row:
--    a client's session only ever gets its own rows, a founder's gets all.
do $$
declare t text;
begin
  foreach t in array array['payments','reply_queue','sample_requests','videos','video_notes','profiles'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 3. Whole conversations in the CRM (SIMAS 11-12 ~16:45: "every hot/paid lead gets their whole conversation attached").
--    threads kept 60-600 character snippets only. body = the full message text (quoted history cut), source = where it came from.
alter table public.threads add column if not exists body text, add column if not exists source text not null default 'instantly';
