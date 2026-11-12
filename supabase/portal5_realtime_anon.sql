-- Portal v2 test finding (11-12): an anonymous realtime subscriber got an empty "Error 401" event each time a row was
-- added to video_versions or sample_requests (no content, but it shows THAT a delivery or a sample request happened).
-- Cause: those two tables have no SELECT grant for anon, so Realtime reports "unauthorized" instead of filtering the
-- event out. With the grant, row-level security decides as on videos / video_notes / purchases: anon matches no policy
-- (auth.uid() is null, is_admin() is false), so it gets 0 rows over REST and no realtime events at all.
-- Additive, idempotent. Undo: revoke select on public.video_versions, public.sample_requests from anon;
grant select on public.video_versions, public.sample_requests to anon;
