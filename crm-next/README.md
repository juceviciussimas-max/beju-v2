# BEJÚ founder CRM (`/crm/`)

One page for the two founders: money, outreach, leads, samples, conversations and the client portal queues, in the website's look. Built 2026-11-12 (v2).

## Where it runs

- `https://bejucreative.digital/crm/` (after the site repo deploys this folder)
- `https://juceviciussimas-max.github.io/beju-v2/crm/`
- Local: `http://localhost:8765/crm/` (any static server on the `beju-v2` folder)

The folder is self-contained: relative paths only, own fonts, no build step. After any change to `crm.css` or `crm.js`, bump the three `?v=` strings in `index.html`.

## Who can open it

Sign in with a Supabase login whose `profiles.is_admin` is `true`. Anyone else sees a waiting screen and the page asks the database for nothing but their own profile. The real protection is row-level security (`is_admin()` on every CRM table); the screen is only the front door.

A new founder: open the page, choose "Create founder login", sign up, then a founder sets `is_admin = true` on that `profiles` row **after confirming who it is** (email confirmation is off). There are no shared passwords. The same login works in the client portal on the same domain.

Account menu (person icon): website, client portal, theme, refresh, **change password** (your own login only, 10+ characters) and sign out.

## What it writes

Everything is read-only except the client-portal actions, which make the same writes as `scripts/portal_ops.py`, in the same order:

| Action | Tables |
|---|---|
| Accept / Building / Decline / Ready on a free-sample request | `sample_requests` (status, `due_at`, `note`, `preview_url`, `delivered_at`) |
| Mark editing | `videos.status` |
| Deliver a version | insert `video_versions`, set open `video_notes.done_at`, then update `videos` (status, link, version, dates) |
| Add a pack (someone who paid outside the portal) | insert `purchases` |
| Change password | the signed-in user's own password (`auth.updateUser`) |

Every action shows a confirm sheet that says what the client will see. Links must be http or https. Nothing else is ever inserted, updated or deleted. SQL that these rely on: `supabase/crm_bento1.sql`.

## Live data

- Realtime (Supabase) on `payments, reply_queue, sample_requests, videos, video_notes, profiles`: a change triggers one refresh (bursts are merged) and a toast. A new payment also throws confetti.
- A full refresh runs every 60 seconds as well. The status chip says "Live" or "Polling" truthfully.
- Conversations: `threads.body` holds the full text; rows not backfilled yet show the short preview and say so.

## Using it

- Every number, chart mark and row opens the list behind it. Lists open leads; leads open the whole conversation.
- Period switch (Today · 7d · 30d · Month) in the hero drives the hero chips, the money card and the outreach range. Owner switch (All · Simas · Benas) filters every pipeline card.
- Shortcuts: `⌘K` / `Ctrl K` search and actions · `/` lead search · arrows in a chart move through days, in a lead they move through the list · `Enter` opens · `Esc` closes · `W` wall mode.
- Themes: BEJÚ dark (default) and Light; the choice is remembered.

## Phone (600px and narrower)

Five bottom tabs (Home · Money · Leads · Outreach · Clients), each with its own cards; the last tab is remembered. Compact header with the owner switch, search, live dot and account menu. Lead drawers and lists are bottom sheets (drag the handle down to close); a conversation opens at the latest message. Charts: first tap shows the value, second tap opens it. `manifest.webmanifest` + Apple meta tags make it installable ("Add to Home Screen"); there is no service worker, so it needs a connection.

## Config (`config.js`)

`supabaseUrl`, `supabaseAnonKey` (public by design; never put the service-role key or any secret here), `monthlyGoal` (10000), `timezone` (`Europe/Vilnius`).

## Known limits

- Speed to reply is an estimate: `threads` does not mark auto-replies; they are left out only where the reply queue (last 60 days) marks them.
- Deliveries are matched to clients through the `clients` list; a payer who is not on it shows payments but no videos.
- `pipeline.source` and `pipeline.campaign` are empty, so there is no "which lane buys" card yet.
- Chart marks narrower than 44px on a phone (8-week mini bars, inbox bars, mood segments) keep their size; the number or legend row beside each opens the same list.
