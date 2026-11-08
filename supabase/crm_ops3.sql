-- CRM ops core, part 3 (11-08): founders (is_admin) write through their own login, so Benas's Claude needs no shared secret.
drop policy if exists "founders write pipeline" on public.pipeline;
create policy "founders write pipeline" on public.pipeline for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "founders write claims" on public.thread_claims;
create policy "founders write claims" on public.thread_claims for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "founders write dismissals" on public.reply_dismissals;
create policy "founders write dismissals" on public.reply_dismissals for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "founders write stage log" on public.stage_log;
create policy "founders write stage log" on public.stage_log for insert with check (public.is_admin());

-- Atomic claim: true if the caller now holds the thread; false if another actor holds an unexpired claim.
create or replace function public.claim_thread(p_lead text, p_actor text, p_minutes int default 10)
returns table (ok boolean, holder text) language plpgsql security definer set search_path = public as $$
declare cur record;
begin
  if not public.is_admin() and current_user not in ('service_role','postgres') then raise exception 'founders only'; end if;
  select * into cur from public.thread_claims where lead_email = lower(p_lead) for update;
  if found and cur.actor <> p_actor and cur.expires_at > now() then
    return query select false, cur.actor; return;
  end if;
  insert into public.thread_claims (lead_email, actor, claimed_at, expires_at)
  values (lower(p_lead), p_actor, now(), now() + make_interval(mins => p_minutes))
  on conflict (lead_email) do update set actor = excluded.actor, claimed_at = excluded.claimed_at, expires_at = excluded.expires_at;
  return query select true, p_actor;
end $$;
grant execute on function public.claim_thread(text, text, int) to authenticated, service_role;
