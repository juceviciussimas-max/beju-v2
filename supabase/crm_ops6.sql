-- Follow-up cadence (Simas 11-10: "we're lost on the hot leads, we need to know when to follow up").
-- fu_stage  = where the lead stands; set by the Claude that handled the last reply (crm.set_stage).
-- fu_day0   = when the ball went into their court (our price / sample / link email, or their "let me think").
-- The app counts our emails since fu_day0 from public.threads and shows who is due today, with the reason.
alter table public.pipeline add column if not exists fu_stage text;       -- asked_price / sample_sent / said_yes / thinking / parked / none
alter table public.pipeline add column if not exists fu_day0 timestamptz;
alter table public.pipeline add column if not exists fu_note text;        -- their key sentence, in their words
