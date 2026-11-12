# BEJÚ founder CRM (`/crm/`)

One page for the two founders: money, outreach, leads, samples, conversations and the client portal queues. Built 2026-11-12 (v2, liquid glass).

## Where it runs

- `https://bejucreative.digital/crm/` (after the site repo deploys this folder)
- `https://juceviciussimas-max.github.io/beju-v2/crm/`
- Local: `http://localhost:8765/crm/` (any static server on the `beju-v2` folder)

The folder is self-contained: relative paths only, own fonts, no build step. Files: `index.html`, `theme.js`, `crm.css`, `config.js`, `crm.js`, `manifest.webmanifest`, `fonts/`. After any change to `theme.js`, `crm.css` or `crm.js`, bump the four `?v=` strings in `index.html`.

## Who can open it

One login for the whole site, routed by role:

- A login whose `profiles.is_admin` is `true` (a founder) sees the dashboard.
- Any other signed-in login is sent to the client portal (`/portal/` on bejucreative.digital, `https://bejucreative.digital/portal/` from any other host). The page asks the database for nothing but that login's own profile first.
- One exception: right after "Create founder login" the new login stays on a waiting screen (with a "Go to the client portal" button) until a founder approves it. On a later visit it is routed like any client until it is approved.
- The CRM's own "Client portal" links end in `?view=portal`, so the portal does not send a founder straight back here.

The real protection is row-level security (`is_admin()` on every CRM table); the screens are only the front door.

A new founder: open the page, choose "Create founder login", sign up, then a founder sets `is_admin = true` on that `profiles` row **after confirming who it is** (email confirmation is off). There are no shared passwords.

Account menu (person icon): website, client portal, look, motion, refresh, **change password** (your own login only, 10+ characters) and sign out.

## Looks and motion

Five liquid-glass looks, saved per device (`localStorage` key `beju-crm-look`):

| Look | What it is |
|---|---|
| Frost (default) | bright white glass over a soft colour backdrop |
| Graphite | neutral dark glass |
| Forest | the BEJÚ brand green |
| Ocean | deep blue glass |
| Sunset | warm peach and rose glass |

Pick one from the account menu, the sun button in the top bar, the Look card, or the command palette ("Look: Ocean"). On a device with nothing saved, a "Pick your look" sheet opens once after sign-in. `theme.js` applies the saved look before the first paint; `crm.js` owns the picker.

How a look is built (`crm.css`): `<html data-theme data-mode data-motion>`. The `:root` block is Frost, `[data-mode="dark"]` is Forest, and Graphite / Ocean / Sunset override the dark tokens near the end of the file. Each look sets its backdrop (`--bd`), pane (`--glass`, `--tint`, `--tint-lite`), rim, accent and chart colours. To add a look: add a token block, add one row to `THEMES` in `crm.js` and one line to `MODE` in `theme.js`, add a `.thsw[data-th]` swatch.

Glass: panes blur and saturate what is behind them (`backdrop-filter`), with a highlight layer, a gradient rim and a sheen. Two fallbacks keep the same look without live blur: phones never blur the cards (only the top bar, tab bar, hero and sheets), and on a desktop the page measures its frame rate once after loading and drops the card blur under about 40 frames a second (`html.fx-lite`). Browsers without `backdrop-filter` get opaque panes.

Motion: **Full** keeps small loops running (backdrop drift, sheen across cards, breathing progress head, shimmer on bars and hot leads, floating specks in the hero, ticker). **Calm** stops the loops and keeps transitions and count-ups. The switch is in the account menu, the Look card and the palette; saved as `beju-crm-motion`. Loops only run on cards in view, pause when the tab is hidden, and are off when the device asks for reduced motion.

Text contrast was checked on rendered pixels in every look (4.5:1 for normal text). Check again after changing colours.

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

- Realtime (Supabase) on `payments, reply_queue, sample_requests, videos, video_notes, profiles`: a change shows a toast at once and triggers one refresh about 1.5 seconds later (bursts are merged). A new payment also throws confetti.
- A full refresh runs every 60 seconds as well. The status chip says "Live" or "Polling" truthfully.
- Conversations: `threads.body` holds the full text; rows not backfilled yet show the short preview and say so.

## Using it

- Every number, chart mark and row opens the list behind it. Lists open leads; leads open the whole conversation.
- Period switch (Today · 7d · 30d · Month) in the hero drives the hero chips, the money card and the outreach range. Owner switch (All · Simas · Benas) filters every pipeline card.
- Shortcuts: `⌘K` / `Ctrl K` search and actions · `/` lead search · arrows in a chart move through days, in a lead they move through the list · `Enter` opens · `Esc` closes · `W` wall mode.

## Phone (600px and narrower)

Five bottom tabs (Home · Money · Leads · Outreach · Clients), each with its own cards; the last tab is remembered. Compact header with the owner switch, search, live dot and account menu. Lead drawers and lists are bottom sheets (drag the handle down to close); a conversation opens at the latest message. Charts: first tap shows the value, second tap opens it. On phones that report tilt without asking (Android), the hero highlight follows the device; the page never asks for that permission. `manifest.webmanifest` + Apple meta tags make it installable ("Add to Home Screen"); there is no service worker, so it needs a connection.

## Config (`config.js`)

`supabaseUrl`, `supabaseAnonKey` (public by design; never put the service-role key or any secret here), `monthlyGoal` (10000), `timezone` (`Europe/Vilnius`).

## Known limits

- Speed to reply is an estimate: `threads` does not mark auto-replies; they are left out only where the reply queue (last 60 days) marks them.
- Deliveries are matched to clients through the `clients` list; a payer who is not on it shows payments but no videos.
- `pipeline.source` and `pipeline.campaign` are empty, so there is no "which lane buys" card yet.
- Chart marks narrower than 44px on a phone (8-week mini bars, inbox bars, mood segments) keep their size; the number or legend row beside each opens the same list.
- A few synced message bodies arrive HTML-escaped (`&#x27;`); the page decodes them for display. The stored text is unchanged.
