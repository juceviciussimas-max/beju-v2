// Instantly → founders CRM, every 10 minutes (pg_cron calls this with the x-cron-secret header).
// About 6 Instantly requests per run: Instantly allows 20 a minute, shared with both Claudes' reply watchers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const KEY = Deno.env.get("INSTANTLY_API_KEY")!;
const BASE = "https://api.instantly.ai/api/v2";

async function ig(path: string) {
  const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`Instantly ${r.status} on ${path.split("?")[0]}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const must = (r: { error: unknown }) => { if (r.error) throw new Error(JSON.stringify(r.error)); };

async function sync() {
  const today = new Date(), from = new Date(Date.now() - 13 * 864e5);
  const camps = ((await ig("/campaigns?limit=100")).items ?? []).filter((c: any) => c.status === 1);
  const stats: any[] = await ig("/campaigns/analytics");
  const byId = Object.fromEntries(stats.map(a => [a.campaign_id, a]));

  const live = [], daily = [];
  for (const c of camps) {
    const a = byId[c.id] ?? {};
    live.push({
      campaign_id: c.id, name: c.name, status: c.status, daily_max_leads: c.daily_max_leads, daily_limit: c.daily_limit,
      inboxes: (c.email_list ?? []).length, leads_total: a.leads_count ?? 0, new_contacted: a.new_leads_contacted_count ?? 0,
      uncontacted: Math.max(0, (a.leads_count ?? 0) - (a.new_leads_contacted_count ?? 0)), emails_sent: a.emails_sent_count ?? 0,
      replies: a.reply_count_unique ?? 0, replies_auto: a.reply_count_automatic_unique ?? 0, bounced: a.bounced_count ?? 0,
      unsubscribed: a.unsubscribed_count ?? 0, opportunities: a.total_opportunities ?? 0, updated_at: new Date().toISOString(),
    });
    for (const d of await ig(`/campaigns/analytics/daily?campaign_id=${c.id}&start_date=${ymd(from)}&end_date=${ymd(today)}`))
      daily.push({ campaign_id: c.id, day: d.date, sent: d.sent ?? 0, new_leads: d.new_leads_contacted ?? 0, replies: d.unique_replies ?? 0,
                   replies_auto: d.unique_replies_automatic ?? 0, opportunities: d.unique_opportunities ?? 0 });
  }
  must(await sb.from("campaign_live").upsert(live));
  if (daily.length) must(await sb.from("campaign_daily").upsert(daily));

  const accs = (await ig("/accounts?limit=100")).items ?? [];
  const inCamp = (e: string) => camps.filter((c: any) => (c.email_list ?? []).includes(e)).map((c: any) => c.name);
  must(await sb.from("inbox_live").upsert(accs.map((a: any) => ({
    email: a.email, status: a.status, warmup_score: a.stat_warmup_score, daily_limit: a.daily_limit, campaigns: inCamp(a.email),
    updated_at: new Date().toISOString() }))));
  const q = new URLSearchParams({ start_date: ymd(from), end_date: ymd(today), emails: accs.map((a: any) => a.email).join(",") });
  const per: any[] = await ig(`/accounts/analytics/daily?${q}`);
  if (per.length) must(await sb.from("inbox_daily").upsert(per.map(d => ({
    email: d.email_account, day: d.date, sent: d.sent ?? 0, new_leads: d.new_leads_contacted ?? 0, replies: d.unique_replies ?? 0, bounced: d.bounced ?? 0 }))));
  return `${live.length} campaigns, ${daily.length} campaign-days, ${accs.length} inboxes, ${per.length} inbox-days`;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  try {
    const detail = await sync();
    await sb.from("sync_status").upsert({ name: "instantly", ran_at: new Date().toISOString(), ok: true, detail });
    return new Response(detail);
  } catch (e) {
    await sb.from("sync_status").upsert({ name: "instantly", ran_at: new Date().toISOString(), ok: false, detail: String(e).slice(0, 500) });
    return new Response(String(e), { status: 500 });
  }
});
