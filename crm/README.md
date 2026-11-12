# BEJÚ founder CRM dashboard

One bento-style screen with the live numbers of the business: money this month and the road to $10k a month,
new leads and emails sent, hot leads, buyer moods, samples, follow-ups, replies waiting, leads that are away,
campaigns, inboxes, buyers and the funnel. Built 2026-11-12 for Simas.

It is **read-only**: the page never inserts, updates or deletes anything.

## Where it runs

The folder works unchanged at both addresses (all paths are relative):

- `https://bejucreative.digital/crm/` (after it is deployed to the live site repo)
- `https://juceviciussimas-max.github.io/beju-v2/crm/`
- locally: `http://localhost:8765/crm/` when `python3 -m http.server 8765` runs in the `beju-v2` folder

## Who can see it

Only a founder login. The data is protected in the database: every CRM table has row-level security that answers
only when `is_admin()` is true. The sign-in screen on this page is just the front door.

How a founder gets access:

1. Open the page, choose **Create founder login**, enter name, email and a password (8+ characters).
2. The page shows "This area is for the BEJÚ founders" and loads nothing.
3. A founder approves the account by hand: set `is_admin = true` on that row of `profiles` (Supabase SQL editor,
   or ask Simas's Claude). Approval is never automatic. Check that the sign-up really is the founder first,
   because email confirmation is not switched on yet.
4. Press **Check again** (or log in again): the dashboard opens.

A founder who is already logged in on `/portal/` on the same site is logged in here too (same Supabase session).

## Files

- `index.html`: page shell, icon sprite, sign-in screen, drawer. Strict CSP: no inline styles or scripts.
- `crm.css`: the bento design, light and dark theme, motion (switched off under `prefers-reduced-motion`).
- `crm.js`: sign-in gate, data loading, the 27 cards, lead drawer, search, CSV export, 60-second refresh.
- `config.js`: settings (below).
- `fonts/`: Geist and Geist Mono, self-hosted.

## config.js

| Key | Meaning |
|---|---|
| `supabaseUrl` | The Supabase project URL. |
| `supabaseAnonKey` | The public anon key. Never put the service-role key or any other secret here. |
| `monthlyGoal` | The monthly revenue goal for the "Road to $10k / month" ring (10000). |
| `timezone` | Time zone for every date on the page (`Europe/Vilnius`). |

## Where the numbers come from

| Card | Source |
|---|---|
| Money, road to $10k, buyers, milestone | `payments` (refunded payments left out) |
| Outreach chart, new leads, reply-rate change | `campaign_daily` |
| Sent in total, campaigns, reply rate, funnel top | `campaign_live` |
| Hot leads, buyer moods, samples, search, CSV | `pipeline` |
| Needs attention | view `needs_attention` + open `promises` past due |
| Follow-ups | view `fu_state` |
| Away / auto-replies | `reply_queue` (kind AUTO, unanswered, last 7 days) |
| Today | `today_items` |
| Inboxes | `inbox_live` |
| Videos delivered | `deliveries` |
| Client portal | `profiles`, `sample_requests`, `videos` |
| Lead drawer | `pipeline`, `promises`, `client_notes`, `threads` (loaded when a lead is opened) |

Notes on definitions:

- **Real replies** = Instantly's unique human replies (`replies`). Auto-replies are a separate count (`replies_auto`).
- **Buyer** = pipeline status WON or DONE, or a non-empty `paid` field.
- **Buyer moods**: one mood per lead, first match wins: Lost, Hot (status HOT or said yes), Asked price, Talking,
  Thinking, Quiet (parked), Sample in edit, Watching sample, Quiet. Buyers are counted apart.
- **Campaigns** lists only campaigns the last sync touched; older ones still count in "Sent in total".
- The Supabase REST API returns at most 1,000 rows per call; the loader pages through bigger tables.
