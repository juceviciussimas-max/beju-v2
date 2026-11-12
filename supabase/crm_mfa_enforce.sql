-- NOT APPLIED. Founder 2-step login enforced in the database (SIMAS 11-12: "make it very safe").
-- Apply ONLY after BOTH founders have turned on 2-step login in the CRM (account menu → 2-step login) and logged in
-- with their code once. Check first:
--   select u.email, count(f.id) filter (where f.status = 'verified') as factors
--   from auth.users u join public.profiles p on p.id = u.id left join auth.mfa_factors f on f.user_id = u.id
--   where p.is_admin group by 1;          -- every founder must show 1 or more
--
-- What it does: is_admin() is true only for a founder whose session passed the code step (aal2). Every founder
-- table policy and every portal trigger uses is_admin(), so a stolen founder password alone reads nothing.
-- Service-role scripts (crm_sync.py, ops-sync, portal_ops.py, stripe-webhook) are not affected: they bypass RLS and
-- the triggers treat auth.uid() = null as the service role.
--
-- What it breaks if applied too early: a founder WITHOUT a verified factor (or a session that skipped the code)
-- is treated as a client everywhere: the CRM loads no data (all founder tables return 0 rows), every founder write
-- in the CRM (accept sample, deliver, add a pack, replies) fails with "Not allowed", the portal still opens for them
-- as a client view. Undo = run the original function (bottom of this file).

create or replace function public.is_admin()
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$function$;

-- Undo (the version live today):
-- create or replace function public.is_admin()
--  returns boolean language sql stable security definer set search_path to 'public'
-- as $function$
--   select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
-- $function$;
