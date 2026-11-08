// Always-live ops sync (11-08): runs in Supabase every 10 min (pg_cron), so the CRM stays live with every Mac off.
// 1) Samples tab (Google Sheet) → pipeline   2) Instantly received/sent mail (14 d) → reply_queue + threads.
// Same logic as scripts/crm_sync.py sections 5–6 (the Mac copy still runs hourly; both write the same rows).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const IKEY = Deno.env.get("INSTANTLY_API_KEY")!;

// Vilnius local "YYYY-MM-DD HH:MM" (minutes may be "4x") → ISO UTC, like crm_sync.when()
function offsetMinutes(utcMs: number, tz = "Europe/Vilnius") {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(utcMs / 6e4) * 6e4) / 6e4;
}
function when(v?: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):?(\d|x)?(\d|x)?)?/.exec((v || "").trim());
  if (!m) return null;
  const hh = +(m[4] || 0), mm = +(((m[5] || "0") + (m[6] || "0")).replaceAll("x", "0"));
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], hh, mm);
  return new Date(guess - offsetMinutes(guess) * 6e4).toISOString();
}

async function googleToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN")!, grant_type: "refresh_token" }) });
  if (!r.ok) throw new Error("google token " + r.status + " " + (await r.text()).slice(0, 200));
  return (await r.json()).access_token as string;
}

async function samples() {
  const tok = await googleToken();
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${Deno.env.get("TEAM_SHEET_ID")}/values/${encodeURIComponent("Samples!A:Q")}`,
    { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error("sheets " + r.status + " " + (await r.text()).slice(0, 200));
  const [h, ...rows] = (await r.json()).values as string[][];
  const now = new Date().toISOString(), by: Record<string, Record<string, string>> = {};
  for (const raw of rows) { const o = Object.fromEntries(h.map((k, i) => [k, raw[i] ?? ""])); const e = (o["Lead email"] || "").trim().toLowerCase(); if (e) by[e] = o; }
  const pipe = Object.entries(by).map(([e, r]) => ({ email: e, name: r["Name"] || null, show: r["Show / channel"] || null, owner: r["Owner"] || null,
    inbox: r["Inbox"] || null, status: r["Status"] || null, yes_at: when(r["Yes at"]), due_at: when(r["Due at"]), delivered_at: when(r["Delivered at"]),
    last_reply_at: when(r["Last reply at"]), next_action: r["Next action"] || null, next_action_at: when(r["Next action at"]), paid: r["Paid at"] || null,
    drive_link: r["Drive link"] || null, notes: r["Notes"] || null, builder: r["Builder"] || null, updated_at: now }));
  for (let i = 0; i < pipe.length; i += 200) {
    const { error } = await sb.from("pipeline").upsert(pipe.slice(i, i + 200), { onConflict: "email" });
    if (error) throw new Error("pipeline " + error.message);
  }
  return pipe.length;
}

// --- Instantly mail (20 req/min shared with the reply watchers: page at most ~12 times per run)
async function ig(path: string) {
  await new Promise(r => setTimeout(r, 3000));       // spread calls: 20/min is shared with both reply watchers
  const r = await fetch("https://api.instantly.ai/api/v2" + path, { headers: { Authorization: `Bearer ${IKEY}` } });
  if (!r.ok) throw new Error(`Instantly ${r.status} ${path.split("?")[0]}`);
  return r.json();
}
async function mailSince(type: string, since: string, maxPages = 3) {
  const out: any[] = []; let cur = "";
  for (let p = 0; p < maxPages; p++) {
    const d = await ig(`/emails?email_type=${type}&limit=100${cur ? `&starting_after=${cur}` : ""}`);
    for (const e of d.items || []) { if (e.timestamp_email < since) return out; out.push(e); }
    cur = d.next_starting_after; if (!cur) break;
  }
  return out;
}
const AUTO = /out of (the )?office|\bOOO\b|on (vacation|holiday|leave|maternity)|auto(matic)?[- ]?reply|thank(s| you)( so much| very much)? for (your (email|message|e-mail|inquiry|enquiry|note)|reaching|getting|emailing|contacting)|your (message|email) has been (received|forwarded)|you will receive a (response|reply)|vielen dank f|(reply|respond|get back)[^.]{0,40}(upon|on|after) my return|away at a conference|reply above this line|your request (\(#?\d+\) )?has been received|we strive to respond within|limited access to (my )?e-?mails?|for (the )?fastest (assistance|response)|we (aim to )?(respond|reply) to (all )?e-?mails? within|in the meantime, here are|view (this email )?in (your )?browser|unsubscribe/i;
const HUMAN = /sorry for the (late|delayed|slow) (reply|response)|\bi was (out|away|travell?ing)\b|\b(adding|looping in|cc'?ing|copying in)\b|\bi'?ve (now )?(reviewed|watched|looked)|\b(aren'?t|are not|am not|i'?m not|not) (currently )?(looking for|interested)|\bno,? thank(s| you)\b|\b(just|i'?ve|we'?ve|i|we) (just )?paid\b|looking forward to working (together|with)/i;
const YES = /\b(yes|yeah|sure|interested|go ahead|send it|please do|sounds good|let'?s do|i'?d (like|love|be happy)|take you up on)\b/i;
const bodyOf = (e: any) => e.body?.text || e.content_preview || "";
function snippet(t: string) {
  if (t.trimStart().startsWith(">")) t = t.replace(/^>\s?/gm, "");
  return t.split(/\n\s*On .{5,80}wrote:|\n>/)[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 160);
}

async function replies(pipeEmails: Set<string>) {
  const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 19), week = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19);
  const [rec, sent] = [await mailSince("received", since), await mailSince("sent", since)];
  const ours: Record<string, string> = {};
  for (const e of sent) { const l = (e.lead || "").toLowerCase(); if (l && (ours[l] || "") < e.timestamp_email) ours[l] = e.timestamp_email; }
  // what we already knew (Mac sync pages ALL sent mail; this run only sees ~600 newest sent = a few hours at our volume)
  const { data: prevRows } = await sb.from("reply_queue").select("lead_email,received_at,answered,blocklisted");
  const prev: Record<string, any> = Object.fromEntries((prevRows || []).map(r => [r.lead_email, r]));
  const seen = new Set<string>(), queue: any[] = [];
  for (const e of rec) {                                              // newest first
    const lead = (e.lead || "").toLowerCase();
    if (!lead || seen.has(lead) || e.timestamp_email < week) continue;
    seen.add(lead);
    const s = snippet(bodyOf(e));
    const kind = AUTO.test(s) && !YES.test(s) && !HUMAN.test(s) ? "AUTO" : "REAL";
    const p = prev[lead], same = p && Date.parse(p.received_at) === Date.parse(e.timestamp_email);
    queue.push({ lead_email: lead, inbox: e.eaccount, received_at: e.timestamp_email, kind,
                 answered: (ours[lead] || "") > e.timestamp_email || !!(same && p.answered),
                 blocklisted: !!(p && p.blocklisted), snippet: s.slice(0, 300), synced_at: new Date().toISOString() });
  }
  // still unsure: look at up to 8 real threads directly (Instantly rate limit is shared)
  for (const q of queue.filter(q => q.kind === "REAL" && !q.answered).slice(0, 4)) {
    try {
      const d = await ig(`/emails?lead=${encodeURIComponent(q.lead_email)}&limit=10`);
      if ((d.items || []).some((m: any) => (m.from_address_email || "").toLowerCase() !== q.lead_email && m.timestamp_email > q.received_at)) q.answered = true;
    } catch (_) { break; }
  }
  if (queue.length) await sb.from("reply_queue").upsert(queue, { onConflict: "lead_email" });
  await sb.from("reply_queue").delete().lt("received_at", new Date(Date.now() - 7 * 864e5).toISOString());
  const th = [...rec.map(m => [m, "in"]), ...sent.map(m => [m, "out"])].filter(([m]) => pipeEmails.has((m.lead || "").toLowerCase()) && m.id)
    .map(([m, dir]) => ({ msg_id: m.id, lead_email: (m.lead || "").toLowerCase(), at: m.timestamp_email, direction: dir, inbox: m.eaccount,
      subject: (m.subject || "").slice(0, 200), snippet: snippet(bodyOf(m)).slice(0, 600) }));
  for (let i = 0; i < th.length; i += 200) await sb.from("threads").upsert(th.slice(i, i + 200), { onConflict: "msg_id" });
  return { queue: queue.length, threads: th.length };
}

Deno.serve(async req => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  const out: Record<string, unknown> = {};
  try { out.pipeline = await samples(); await sb.from("sync_status").upsert({ name: "sheet", ran_at: new Date().toISOString(), ok: true, detail: `${out.pipeline} pipeline leads (cloud)` }); }
  catch (e) { out.sheet_error = String(e); await sb.from("sync_status").upsert({ name: "sheet", ran_at: new Date().toISOString(), ok: false, detail: String(e).slice(0, 200) }); }
  try {
    const { data } = await sb.from("pipeline").select("email");
    out.replies = await replies(new Set((data || []).map(r => r.email)));
    await sb.from("sync_status").upsert({ name: "replies", ran_at: new Date().toISOString(), ok: true, detail: JSON.stringify(out.replies) });
  } catch (e) { out.replies_error = String(e); await sb.from("sync_status").upsert({ name: "replies", ran_at: new Date().toISOString(), ok: false, detail: String(e).slice(0, 200) }); }
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
