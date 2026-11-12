/* BEJÚ founder CRM: bento dashboard v2 (2026-11-12, Simas).
   Reads the CRM database; the ONLY writes are the client-portal actions in pOp() (sample_requests, videos,
   video_versions, video_notes.done_at, purchases), the same writes scripts/portal_ops.py makes. Nothing else is written.
   Data is protected by row-level security (is_admin() on every CRM table); the sign-in gate here is only UX.
   CSP forbids inline styles, so every dynamic size goes through data-v="name:value" -> style.setProperty. */
(() => {
"use strict";
const CFG = window.BEJU_CRM || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"'`]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
const TZ = CFG.timezone || "Europe/Vilnius";
const GOAL = +CFG.monthlyGoal || 10000;
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const HOVER = matchMedia("(hover: hover) and (pointer: fine)").matches;
const PHONE = matchMedia("(max-width: 600px)"), COARSE = matchMedia("(pointer: coarse)").matches;
const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const lc = s => String(s || "").toLowerCase().trim();
const cut = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const ON_SITE = /(^|\.)bejucreative\.digital$/i.test(location.hostname);
const SITE = ON_SITE ? "/" : "https://bejucreative.digital/", PORTAL = ON_SITE ? "/portal/" : "https://bejucreative.digital/portal/";

/* ---------------- dates (all in CFG.timezone) ---------------- */
const fParts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const parts = t => Object.fromEntries(fParts.formatToParts(new Date(t)).map(p => [p.type, p.value]));
const dayOf = t => { if (!t) return ""; const p = parts(t); return `${p.year}-${p.month}-${p.day}`; };   // timestamp -> YYYY-MM-DD
const timeOf = t => { const p = parts(t); return `${p.hour === "24" ? "00" : p.hour}:${p.minute}`; };
const hourOf = t => +parts(t).hour % 24;
const today = () => dayOf(Date.now());
const addDays = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dow = d => new Date(d + "T12:00:00Z").getUTCDay();
const DOW = ["S", "M", "T", "W", "T", "F", "S"], DOWL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dLabel = d => d ? `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}` : "—";
const dLong = d => d ? `${DOWL[dow(d)]} ${dLabel(d)}` : "—";
const fDT = t => t ? `${dLabel(dayOf(t))}, ${timeOf(t)}` : "—";
const ago = t => { if (!t) return "never"; const m = Math.max(0, Math.round((Date.now() - new Date(t)) / 6e4)); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const rel = t => { const m = Math.max(0, Math.round((Date.now() - t) / 6e4)); return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : m < 1440 * 14 ? `${Math.round(m / 1440)}d` : dLabel(dayOf(t)); };
const dueIn = t => { if (!t) return null; const h = (new Date(t) - Date.now()) / 36e5, a = Math.abs(h), txt = a < 1 ? `${Math.max(1, Math.round(a * 60))} min` : a < 48 ? `${Math.round(a)} h` : `${Math.round(a / 24)} d`; return { late: h < 0, txt: h < 0 ? `${txt} late` : `due in ${txt}` }; };
const daysInMonth = d => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate();
const monday = d => addDays(d, -((dow(d) + 6) % 7));
const nowIso = () => new Date().toISOString();
const fmtMin = m => m == null || !isFinite(m) ? "—" : m < 60 ? `${Math.max(1, Math.round(m))} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`;
const med = a => { const s = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/* ---------------- numbers ---------------- */
const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd = v => "$" + nf0.format(Math.round(+v || 0));
const FMT = { int: v => nf0.format(Math.round(v)), usd: v => "$" + nf0.format(Math.round(v)), pct: v => Math.round(v) + "%", pct1: v => (Math.round(v * 10) / 10).toFixed(1) + "%", h1: v => (Math.round(v * 10) / 10).toFixed(1) + " h" };
const N = (v, f = "int") => v == null || !isFinite(v) ? "—" : `<span class="n" data-n="${+v}" data-f="${f}">${FMT[f](+v)}</span>`;
const PREV = new Map();
function countUp(card) {
  $$(".n[data-n]", card.el).forEach((el, i) => {
    const key = card.id + ":" + i, to = +el.dataset.n, f = FMT[el.dataset.f] || FMT.int, from = PREV.has(key) ? PREV.get(key) : 0;
    PREV.set(key, to);
    if (RM || from === to) { el.textContent = f(to); return; }
    el.textContent = f(from);
    const t0 = performance.now(), dur = 900;
    const step = now => { const k = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 3); el.textContent = f(from + (to - from) * e); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
function applyVars(root) {   // data-v="w:45%;k:2" -> CSS custom properties, one frame later so transitions run from 0
  const els = $$("[data-v]", root);
  els.forEach(el => el.dataset.v.split(";").forEach(pair => { const i = pair.indexOf(":"); if (i > 0 && /^(k|x|y|c|tx)$/.test(pair.slice(0, i))) el.style.setProperty("--" + pair.slice(0, i), pair.slice(i + 1)); }));
  const go = () => { els.forEach(el => el.dataset.v.split(";").forEach(pair => { const i = pair.indexOf(":"); if (i > 0) el.style.setProperty("--" + pair.slice(0, i), pair.slice(i + 1)); })); $$("[data-go]", root).forEach(el => el.classList.add("go")); };
  RM ? go() : requestAnimationFrame(() => requestAnimationFrame(go));
}

/* ---------------- state ---------------- */
let sb = null, ME = null, RAW = null, D = null, TIMER = null, LAST_OK = 0, OPENER = null, CH = null, RT = "off", RT_T = null, NAV = [], SEQ = 0;
const PLOT = {};   // interactive charts: id -> { n, i, paint(i), drill(i) }
const STATE = { owner: "All", period: "month", range: 14, att: "", day: "", hotAll: false, todayAll: false, q: "", sel: 0, sa: true, sb: true, rg: true, rp: true, hotSort: "wait", campSort: "sent", drill: null };
const must = async p => { const { data, error } = await p; if (error) throw error; return data; };
async function all(table, cols = "*", mod) {   // REST caps at 1,000 rows per call
  const out = [];
  for (let i = 0; ; i += 1000) { let q = sb.from(table).select(cols).range(i, i + 999); if (mod) q = mod(q); const rows = await must(q); out.push(...rows); if (rows.length < 1000) return out; }
}
async function fetchAll() {
  const t = today(), since60 = new Date(Date.now() - 60 * 864e5).toISOString();
  const [pipeline, payments, daily, camps, replies, attention, fu, inboxes, todayItems, sync, deliveries, clients, promises, profiles, sampleReq, videos, purchases, vnotes, leadAdds, tlite] = await Promise.all([
    all("pipeline", "*", q => q.order("email")),
    all("payments", "id,client_id,email,payer_name,amount,currency,package,refunded,paid_at", q => q.order("paid_at", { ascending: false })),
    all("campaign_daily", "campaign_id,day,sent,new_leads,replies,replies_auto,opportunities", q => q.gte("day", addDays(t, -75)).order("day").order("campaign_id")),
    all("campaign_live"),
    all("reply_queue", "lead_email,inbox,received_at,kind,answered,blocklisted,snippet", q => q.gte("received_at", since60).order("received_at", { ascending: false })),
    all("needs_attention"), all("fu_state"), all("inbox_live"),
    all("today_items", "*", q => q.eq("day", t)), all("sync_status"),
    all("deliveries", "id,client_id,title,delivered_at", q => q.order("id")), all("clients", "id,name,emails,source,instagram"),
    all("promises", "*", q => q.eq("status", "open")),
    all("profiles", "id,name,email,is_admin,created_at,channel,sells,frequency,phone"),
    all("sample_requests", "*", q => q.order("created_at", { ascending: false })),
    all("videos", "id,user_id,purchase_id,title,notes,footage,status,result_url,created_at,delivered_at,due_at,version", q => q.order("created_at", { ascending: false })),
    all("purchases", "id,user_id,pack_id,videos,amount,created_at,expires_at"),
    all("video_notes", "id,video_id,user_id,at,text,created_at,round,done_at", q => q.order("created_at", { ascending: false })),
    all("lead_adds", "day,tab,n", q => q.gte("day", addDays(t, -21))),
    all("threads", "lead_email,at,direction", q => q.order("at").order("msg_id")),   // light copy of every message: counts per lead + speed to reply
  ]);
  return { pipeline, payments, daily, camps, replies, attention, fu, inboxes, todayItems, sync, deliveries, clients, promises, profiles, sampleReq, videos, purchases, vnotes, leadAdds, tlite };
}

/* ---------------- derive ---------------- */
const isBuyer = p => /^(WON|DONE)$/i.test(p.status || "") || !!(p.paid && String(p.paid).trim());
function mood(p) {
  const s = (p.status || "").toUpperCase(), f = (p.fu_stage || "").toLowerCase();
  if (isBuyer(p)) return "buyer";
  if (s === "LOST") return "lost";
  if (s === "HOT" || f === "said_yes") return "hot";
  if (f === "asked_price") return "asked";
  if (s === "REPLIED") return "talking";
  if (f === "thinking") return "thinking";
  if (f === "parked") return "quiet";
  if (/^(YES|CLAIMED|BUILT|PUBLIC)$/.test(s)) return "edit";
  if (/^(DELIVERED|FU1|FU2)$/.test(s) || f === "sample_sent") return "watching";
  return "quiet";
}
const MOODS = [["hot", "Hot", "c-red"], ["asked", "Asked price", "c-orange"], ["talking", "Talking", "c-blue"], ["thinking", "Thinking", "c-purple"], ["edit", "Sample in edit", "c-blue2"], ["watching", "Watching sample", "c-green"], ["quiet", "Quiet", "c-grey"], ["lost", "Lost", "c-ink"]];
const MOOD_LABEL = Object.fromEntries(MOODS.map(m => [m[0], m[1]]).concat([["buyer", "Buyer"]]));
const initials = p => { const s = (p.name || p.email || p.lead_email || "?").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/); return ((s[0]?.[0] || "?") + (s[1]?.[0] || s[0]?.[1] || "")).toUpperCase(); };
const campName = n => String(n || "").replace(/^TEST\s*[—-]\s*/i, "").replace(/\s*[—-]\s*(V\d.*|test.*)$/i, "").replace(/\s*\(\d\d-\d\d\)\s*$/, "").trim();
const PACK = { short_5: "5 Shorts", short_3: "3 Shorts", short_1: "1 Short", short_5_150: "Starter, 5 Shorts", monthly_growth_300: "Growth, monthly", monthly_daily_500: "Daily, monthly", dfy_daily_600: "Done For You", dfy_max_growth_1000: "Max Growth" };
const PER = { today: ["Today", 1], "7d": ["Last 7 days", 7], "30d": ["Last 30 days", 30], month: ["This month", 0] };
const nameOf = e => { const p = RAW && RAW.pipeline.find(x => lc(x.email) === lc(e)); return p && p.name ? p.name : e; };
const payKey = p => p.client_id ? "c:" + p.client_id : p.email ? "e:" + lc(p.email) : "p:" + p.id;

function derive() {
  const R = RAW, t = today(), own = r => STATE.owner === "All" || (r.owner || "") === STATE.owner, ownLoose = r => STATE.owner === "All" || !r.owner || r.owner === STATE.owner;
  const d = { t };
  /* money */
  const pays = R.payments.filter(p => !p.refunded && p.paid_at).map(p => ({ ...p, amount: +p.amount || 0, day: dayOf(p.paid_at) }));
  d.pays = pays;
  const ym = t.slice(0, 7), dom = +t.slice(8, 10), dim = daysInMonth(t), prevEnd = addDays(ym + "-01", -1), pym = prevEnd.slice(0, 7);
  d.ym = ym; d.pym = pym;
  d.month = sum(pays.filter(p => p.day.slice(0, 7) === ym), p => p.amount);
  d.monthN = pays.filter(p => p.day.slice(0, 7) === ym).length;
  d.prevSame = sum(pays.filter(p => p.day.slice(0, 7) === pym && +p.day.slice(8, 10) <= dom), p => p.amount);
  d.prevFull = sum(pays.filter(p => p.day.slice(0, 7) === pym), p => p.amount);
  d.monthDelta = d.prevSame > 0 ? (d.month - d.prevSame) / d.prevSame * 100 : null;
  d.cum = []; { let c = 0; for (let i = 1; i <= dom; i++) { const dd = `${ym}-${String(i).padStart(2, "0")}`; c += sum(pays.filter(p => p.day === dd), p => p.amount); d.cum.push(c); } }
  d.goalPct = d.month / GOAL * 100; d.dom = dom; d.dim = dim; d.daysLeft = dim - dom + 1;
  d.perDay = Math.max(0, GOAL - d.month) / d.daysLeft; d.projected = d.month / dom * dim; d.monthName = MON[+ym.slice(5, 7) - 1]; d.prevName = MON[+pym.slice(5, 7) - 1];
  d.allTime = sum(pays, p => p.amount); d.payN = pays.length; d.avgOrder = pays.length ? d.allTime / pays.length : null;
  d.nextMs = (Math.floor(d.allTime / 1000) + 1) * 1000; d.msPct = (d.allTime - (d.nextMs - 1000)) / 10;
  const byMonth = {}; pays.forEach(p => { byMonth[p.day.slice(0, 7)] = (byMonth[p.day.slice(0, 7)] || 0) + p.amount; });
  const best = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0]; d.bestMonth = best ? { ym: best[0], name: MON[+best[0].slice(5, 7) - 1], v: best[1] } : null;
  d.recentPays = pays.slice(0, 5); d.clients = R.clients.length;
  /* outreach */
  const byDay = {}; R.daily.forEach(r => { const x = byDay[r.day] || (byDay[r.day] = { sent: 0, nw: 0, rep: 0, auto: 0, opp: 0 }); x.sent += r.sent || 0; x.nw += r.new_leads || 0; x.rep += r.replies || 0; x.auto += r.replies_auto || 0; x.opp += r.opportunities || 0; });
  d.series = []; for (let i = 59; i >= 0; i--) { const dd = addDays(t, -i); d.series.push({ day: dd, ...(byDay[dd] || { sent: 0, nw: 0, rep: 0, auto: 0, opp: 0 }) }); }
  const tgt = (R.sync.find(s => s.name === "new_lead_target") || {}).detail; d.target = parseInt(tgt, 10) > 0 ? parseInt(tgt, 10) : 150;
  d.todayNew = d.series[59].nw; d.todaySent = d.series[59].sent; d.yNew = d.series[58].nw; d.ySent = d.series[58].sent;
  d.streak = d.todayNew >= 150 ? 1 : 0; for (let i = 58; i >= 0 && d.series[i].nw >= 150; i--) d.streak++;
  d.queued = sum(R.camps, c => c.uncontacted); d.sentAll = sum(R.camps, c => c.emails_sent); d.contacted = sum(R.camps, c => c.new_contacted); d.loaded = sum(R.camps, c => c.leads_total);
  d.repAll = sum(R.camps, c => c.replies); d.autoAll = sum(R.camps, c => c.replies_auto); d.oppAll = sum(R.camps, c => c.opportunities); d.bounced = sum(R.camps, c => c.bounced);
  d.replyRate = d.contacted ? d.repAll / d.contacted * 100 : null; d.posRate = d.contacted ? d.oppAll / d.contacted * 100 : null;
  const win = (a, b) => { const s = d.series.slice(a, b), nw = sum(s, x => x.nw); return nw ? sum(s, x => x.rep) / nw * 100 : null; };
  const r7 = win(52, 59), p7 = win(45, 52); d.rate7 = r7; d.rateDelta = r7 != null && p7 != null ? r7 - p7 : null;
  const newest = Math.max(0, ...R.camps.map(c => +new Date(c.updated_at || 0)));
  const rr = c => c.new_contacted ? (c.replies || 0) / c.new_contacted * 100 : -1;
  d.camps = R.camps.filter(c => newest - +new Date(c.updated_at || 0) < 3 * 36e5).sort(STATE.campSort === "rate" ? (a, b) => rr(b) - rr(a) : (a, b) => (b.emails_sent || 0) - (a.emails_sent || 0));
  d.campsOld = R.camps.length - d.camps.length;
  /* inboxes */
  d.inb = { n: R.inboxes.filter(i => i.status === 1).length, total: R.inboxes.length, cap: sum(R.inboxes, i => i.daily_limit), sent: sum(R.inboxes, i => i.sent_today), warm: R.inboxes.length ? sum(R.inboxes, i => i.warmup_score) / R.inboxes.length : null };
  /* pipeline */
  const pipe = R.pipeline.filter(own); d.pipe = pipe;
  const counts = {}; pipe.forEach(p => { const m = mood(p); counts[m] = (counts[m] || 0) + 1; });
  d.buyers = counts.buyer || 0; d.moodTotal = pipe.length - d.buyers;
  d.moods = MOODS.map(([k, label, c]) => ({ k, label, c, n: counts[k] || 0 })).filter(m => m.n);
  const waitUs = new Set(R.attention.filter(a => a.kind === "reply").map(a => lc(a.lead_email)));
  const fuBy = Object.fromEntries(R.fu.map(f => [lc(f.email), f]));
  d.hot = pipe.filter(p => (p.status || "").toUpperCase() === "HOT" || /^(said_yes|asked_price)$/.test(p.fu_stage || "")).map(p => {
    const e = lc(p.email), f = fuBy[e], lr = p.last_reply_at ? +new Date(p.last_reply_at) : 0, lo = f && f.last_out ? +new Date(f.last_out) : 0;
    const us = waitUs.has(e) || (lr && lo && lr > lo);
    const tag = p.fu_stage === "said_yes" ? ["said yes", "g"] : p.fu_stage === "asked_price" ? ["asked price", "o"] : isBuyer(p) ? ["hot client", "b"] : ["hot", "r"];
    const days = lr ? (Date.now() - lr) / 864e5 : null;
    return { p, us, tag, lr, days, hl: days == null ? 3 : days <= 2 ? 0 : days <= 5 ? 1 : days <= 10 ? 2 : 3, na: p.next_action_at ? +new Date(p.next_action_at) : Infinity, sort: (us ? 1e15 : 0) + lr };
  }).sort(STATE.hotSort === "next" ? (a, b) => a.na - b.na : STATE.hotSort === "reply" ? (a, b) => b.lr - a.lr : (a, b) => b.sort - a.sort);
  d.hotStatus = pipe.filter(p => (p.status || "").toUpperCase() === "HOT").length;
  /* samples */
  const delivered = pipe.filter(p => p.delivered_at), wk = monday(t);
  d.delivered = delivered; d.wk = wk;
  const hrs = delivered.filter(p => p.yes_at && dayOf(p.delivered_at) >= addDays(t, -30)).map(p => (new Date(p.delivered_at) - new Date(p.yes_at)) / 36e5).filter(h => h >= 0 && h < 24 * 30).sort((a, b) => a - b);
  const paidOfDelivered = delivered.filter(isBuyer).length;
  d.samples = { total: delivered.length, week: delivered.filter(p => dayOf(p.delivered_at) >= wk).length, wip: pipe.filter(p => /^(YES|CLAIMED|BUILT)$/i.test(p.status || "")).length,
    median: hrs.length ? (hrs.length % 2 ? hrs[(hrs.length - 1) / 2] : (hrs[hrs.length / 2 - 1] + hrs[hrs.length / 2]) / 2) : null, buyers: paidOfDelivered, conv: delivered.length ? paidOfDelivered / delivered.length * 100 : null };
  /* attention */
  const att = {}; R.attention.filter(ownLoose).forEach(a => { (att[a.kind] || (att[a.kind] = [])).push({ email: a.lead_email, name: a.name || a.lead_email, detail: a.detail, due: a.due_at }); });
  const late = R.promises.filter(p => p.due_at && new Date(p.due_at) < new Date() && ownLoose(p)).map(p => ({ email: p.lead_email, name: p.lead_email, detail: p.promise, due: p.due_at }));
  if (late.length) att.promises = late;
  d.att = att; d.attTotal = Object.entries(att).filter(([k]) => k !== "followup_done").reduce((s, [, v]) => s + v.length, 0); d.promisesOpen = R.promises.filter(ownLoose).length;
  /* away */
  const wkAgo = Date.now() - 7 * 864e5, d14 = Date.now() - 14 * 864e5; d.away = R.replies.filter(r => r.kind === "AUTO" && !r.answered && +new Date(r.received_at) >= wkAgo);
  d.realOpen = R.replies.filter(r => r.kind === "REAL" && !r.answered && !r.blocklisted && +new Date(r.received_at) >= d14); d.realWaiting = d.realOpen.length;
  /* follow-ups */
  const fu = R.fu.filter(f => f.state === "active" && f.due_at && own(f)).map(f => ({ ...f, day: dayOf(f.due_at) }));
  d.fuDays = []; for (let i = 0; i < 7; i++) { const dd = addDays(t, i); d.fuDays.push({ day: dd, list: fu.filter(f => f.day === dd) }); }
  d.fuOver = fu.filter(f => f.day < t); d.fuWeek = sum(d.fuDays, x => x.list.length);
  if (!STATE.day || STATE.day < t || STATE.day > addDays(t, 6)) STATE.day = t;
  /* today */
  const ord = { call: 0, payment_failed: 1, action: 2, partner: 3 };
  d.todayItems = [...R.todayItems].sort((a, b) => (ord[a.kind] ?? 9) - (ord[b.kind] ?? 9) || String(a.at || "").localeCompare(String(b.at || "")));
  /* funnel + deliveries */
  const allDelivered = R.pipeline.filter(p => p.delivered_at).length, allBuyers = R.pipeline.filter(isBuyer).length;
  d.funnel = [["Leads contacted", d.contacted, "c-blue"], ["Real replies", d.repAll, "c-blue2"], ["Positive replies", d.oppAll, "c-orange"], ["Samples delivered", allDelivered, "c-green"], ["Buyers", allBuyers, "c-ink"]];
  const dl = R.deliveries.filter(x => x.delivered_at).map(x => String(x.delivered_at).slice(0, 10));
  d.vid = { total: R.deliveries.length, month: dl.filter(x => x.slice(0, 7) === ym).length, weeks: [] };
  for (let w = 7; w >= 0; w--) { const s = addDays(wk, -7 * w), e = addDays(s, 7); d.vid.weeks.push({ s, n: dl.filter(x => x >= s && x < e).length }); }
  /* portal + sync */
  d.portal = { signups: R.profiles.filter(p => !p.is_admin).length, req: R.sampleReq.length, reqOpen: R.sampleReq.filter(s => s.status === "requested").length, edit: R.videos.filter(v => /^(received|editing|revision)$/.test(v.status || "")).length, ready: R.videos.filter(v => /^(ready|approved)$/.test(v.status || "")).length };
  d.sync = R.sync.filter(s => s.name !== "new_lead_target"); d.syncAt = Math.max(0, ...d.sync.map(s => +new Date(s.ran_at || 0))); d.syncOk = d.sync.every(s => s.ok);

  /* ---- v2: period (hero, money and outreach follow it) ---- */
  const per = STATE.period, pLen = per === "month" ? dom : PER[per][1], pStart = per === "month" ? ym + "-01" : addDays(t, -(pLen - 1)), qStart = addDays(pStart, -pLen);
  const inP = x => x >= pStart && x <= t, ser = d.series.filter(x => inP(x.day));
  const P = d.per = { key: per, start: pStart, len: pLen, label: per === "month" ? d.monthName : PER[per][0].toLowerCase(), chip: per === "month" ? d.monthName : per === "today" ? "Today" : per, days: ser };
  P.rev = sum(pays.filter(p => inP(p.day)), p => p.amount); P.revN = pays.filter(p => inP(p.day)).length;
  P.prev = per === "month" ? d.prevSame : sum(pays.filter(p => p.day >= qStart && p.day < pStart), p => p.amount);
  P.delta = P.prev > 0 ? (P.rev - P.prev) / P.prev * 100 : null; P.vs = per === "month" ? "vs same days last month" : `vs the ${pLen === 1 ? "day" : pLen + " days"} before`;
  P.cum = []; { let c = 0; for (let i = 0; i < pLen; i++) { const dd = addDays(pStart, i); c += sum(pays.filter(p => p.day === dd), p => p.amount); P.cum.push(c); } }
  P.nw = sum(ser, x => x.nw); P.sent = sum(ser, x => x.sent); P.rep = sum(ser, x => x.rep); P.opp = sum(ser, x => x.opp);
  P.samples = delivered.filter(p => inP(dayOf(p.delivered_at))).length;

  /* ---- v2: client portal ---- */
  const users = Object.fromEntries(R.profiles.map(p => [p.id, p]));
  const usedBy = {}; R.videos.forEach(v => { if (v.purchase_id) usedBy[v.purchase_id] = (usedBy[v.purchase_id] || 0) + 1; });
  const pipeBy = Object.fromEntries(R.pipeline.map(p => [lc(p.email), p]));
  const paidBy = {}; pays.forEach(p => { if (p.email) paidBy[lc(p.email)] = (paidBy[lc(p.email)] || 0) + p.amount; });
  const who = id => { const u = users[id] || {}; return { id, name: u.name || u.email || "Unknown client", email: u.email || "" }; };
  const hist = email => { const p = pipeBy[lc(email)]; return { lead: !!p, sample: p && p.delivered_at ? dayOf(p.delivered_at) : "", paid: paidBy[lc(email)] || 0 }; };
  d.pClients = R.profiles.filter(p => !p.is_admin).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).map(p => {
    const packs = R.purchases.filter(x => x.user_id === p.id), live = packs.filter(x => new Date(x.expires_at) > new Date());
    return { ...p, packs, left: sum(live, x => Math.max(0, (x.videos || 0) - (usedBy[x.id] || 0))), exp: live.map(x => x.expires_at).sort()[0] || "", hist: hist(p.email), req: R.sampleReq.find(s => s.user_id === p.id) || null, vids: R.videos.filter(v => v.user_id === p.id) };
  });
  const SORD = { requested: 0, accepted: 1, building: 2, ready: 3, declined: 4 }, VORD = { revision: 0, received: 1, editing: 2, ready: 3, approved: 4 };
  d.pSamples = R.sampleReq.map(s => ({ ...s, who: who(s.user_id), hist: hist((users[s.user_id] || {}).email) })).sort((a, b) => (SORD[a.status] ?? 9) - (SORD[b.status] ?? 9) || +new Date(b.created_at) - +new Date(a.created_at));
  const openNotes = R.vnotes.filter(n => !n.done_at);
  d.pVideos = R.videos.map(v => ({ ...v, who: who(v.user_id), open: openNotes.filter(n => n.video_id === v.id).length })).sort((a, b) => (VORD[a.status] ?? 9) - (VORD[b.status] ?? 9) || +new Date(b.created_at) - +new Date(a.created_at));
  const groups = {}; openNotes.forEach(n => { const k = n.video_id + ":" + (n.round || 1); (groups[k] || (groups[k] = { video: R.videos.find(v => v.id === n.video_id) || { id: n.video_id, title: "Video" }, round: n.round || 1, who: who(n.user_id), notes: [] })).notes.push(n); });
  d.pNotes = Object.values(groups).map(g => ({ ...g, notes: g.notes.sort((a, b) => (+a.at || 0) - (+b.at || 0)) }));
  d.pOpen = d.pSamples.filter(s => /^(requested|accepted|building)$/.test(s.status)).length + d.pVideos.filter(v => /^(received|editing|revision)$/.test(v.status)).length;

  /* ---- v2: activity feed (newest first) ---- */
  const ev = [];
  pays.slice(0, 40).forEach(p => ev.push({ t: +new Date(p.paid_at), icon: "cash", c: "c-green", title: `+${usd(p.amount)} from ${p.payer_name || p.email || "a client"}`, sub: PACK[p.package] || "Payment", k: "client", a: payKey(p) }));
  R.replies.filter(r => r.kind === "REAL").slice(0, 60).forEach(r => ev.push({ t: +new Date(r.received_at), icon: "mail", c: "c-blue", title: `Reply from ${nameOf(r.lead_email)}`, sub: r.snippet || "", email: r.lead_email }));
  R.pipeline.filter(p => p.delivered_at).forEach(p => ev.push({ t: +new Date(p.delivered_at), icon: "film", c: "c-orange", title: `Sample delivered to ${p.name || p.email}`, sub: p.show || "", email: p.email }));
  R.profiles.filter(p => !p.is_admin).forEach(p => ev.push({ t: +new Date(p.created_at), icon: "user", c: "c-purple", title: `Portal sign-up: ${p.name || p.email}`, sub: p.email || "", k: "client", a: "e:" + lc(p.email) }));
  R.sampleReq.forEach(s => ev.push({ t: +new Date(s.created_at), icon: "film", c: "c-purple", title: `Portal sample request from ${who(s.user_id).name}`, sub: s.video_url || "", k: "psamples", a: "" }));
  R.videos.forEach(v => ev.push({ t: +new Date(v.created_at), icon: "play", c: "c-purple", title: `Portal video request: ${v.title || "Untitled"}`, sub: who(v.user_id).name, k: "pvideos", a: "" }));
  const adds = {}; R.leadAdds.forEach(a => { (adds[a.day] || (adds[a.day] = { n: 0, tabs: [] })).n += +a.n || 0; adds[a.day].tabs.push(`${a.tab} ${a.n}`); });
  Object.entries(adds).forEach(([day, x]) => ev.push({ t: Math.min(Date.now() - 1000, +new Date(day + "T16:00:00Z")), dateOnly: true, icon: "bolt", c: "c-ink", title: `${nf0.format(x.n)} new leads loaded`, sub: x.tabs.join(" · "), k: "day", a: day }));
  d.feed = ev.filter(e => e.t > 0).sort((a, b) => b.t - a.t).slice(0, 80);

  /* ---- v2: heatmap (8 weeks), reply clock, scoreboard ---- */
  const hs = addDays(wk, -49), serBy = Object.fromEntries(d.series.map(x => [x.day, x]));
  d.heat = { rows: [], max: 1, weeks: [] };
  for (let w = 0; w < 8; w++) d.heat.weeks.push(addDays(hs, w * 7));
  for (let r = 0; r < 7; r++) { const row = []; for (let w = 0; w < 8; w++) { const day = addDays(hs, w * 7 + r), x = serBy[day]; row.push({ day, n: x ? x.nw : 0, fut: day > t }); d.heat.max = Math.max(d.heat.max, x ? x.nw : 0); } d.heat.rows.push(row); }
  const hrsN = Array(24).fill(0); R.replies.filter(r => r.kind === "REAL").forEach(r => { hrsN[hourOf(r.received_at)]++; });
  d.clock = { h: hrsN, max: Math.max(1, ...hrsN), total: sum(hrsN, x => x), peak: hrsN.indexOf(Math.max(...hrsN)) };
  const of = o => R.pipeline.filter(p => p.owner === o), cnt = (o, f) => of(o).filter(f).length, wait = o => R.attention.filter(a => a.kind === "reply" && a.owner === o).length;
  d.score = [["Hot leads", "hot", p => (p.status || "").toUpperCase() === "HOT"], ["Samples delivered", "samples", p => !!p.delivered_at], ["Buyers", "buyers", isBuyer]].map(([label, k, f]) => ({ label, k, a: cnt("Simas", f), b: cnt("Benas", f) }))
    .concat([{ label: "Replies waiting", k: "waiting", a: wait("Simas"), b: wait("Benas") }]);

  /* ---- v2: conversations (message counts) + speed to reply (an estimate: threads do not say which inbound mails are auto-replies, the reply queue does for the last 60 days) ---- */
  const byLead = {}; R.tlite.forEach(m => { (byLead[lc(m.lead_email)] || (byLead[lc(m.lead_email)] = [])).push(m); });
  d.tc = Object.fromEntries(Object.entries(byLead).map(([k, v]) => [k, v.length]));
  d.cEmails = Object.fromEntries(R.clients.map(c => [c.id, (c.emails || []).map(lc)]));
  d.emailsOf = p => [...new Set([lc(p.email), ...((p.client_id && d.cEmails[p.client_id]) || [])].filter(Boolean))];
  d.cn = emails => sum(emails, e => d.tc[lc(e)] || 0);
  const minute = x => new Date(x).toISOString().slice(0, 16), autoK = new Set(R.replies.filter(r => r.kind === "AUTO").map(r => lc(r.lead_email) + "|" + minute(r.received_at)));
  const gaps = []; Object.entries(byLead).forEach(([e, ms]) => { let wait = null; ms.forEach(m => { if (m.direction !== "out") { if (wait == null && !autoK.has(e + "|" + minute(m.at))) wait = +new Date(m.at); } else if (wait != null) { const g = (+new Date(m.at) - wait) / 6e4; if (g >= 0 && g < 14 * 1440) gaps.push({ t: wait, g, e }); wait = null; } }); });
  const w7 = Date.now() - 7 * 864e5, w14 = Date.now() - 14 * 864e5;
  d.speed = { gaps, n: gaps.length, all: med(gaps.map(x => x.g)), w: med(gaps.filter(x => x.t >= w7).map(x => x.g)), pw: med(gaps.filter(x => x.t >= w14 && x.t < w7).map(x => x.g)), h1: gaps.length ? gaps.filter(x => x.g <= 60).length / gaps.length * 100 : null, max: gaps.length ? Math.max(...gaps.map(x => x.g)) : null, weeks: [] };
  for (let w = 7; w >= 0; w--) { const s = addDays(wk, -7 * w), e = addDays(s, 7), g = gaps.filter(x => { const dd = dayOf(x.t); return dd >= s && dd < e; }); d.speed.weeks.push({ s, n: g.length, med: med(g.map(x => x.g)) }); }
  d.hot.forEach(h => { h.msgs = d.tc[lc(h.p.email)] || 0; });

  /* ---- v2: top clients, deliverability, sample turnaround, per-inbox bars, period deltas ---- */
  const groups2 = {}; pays.forEach(p => { const k = payKey(p), g = groups2[k] || (groups2[k] = { key: k, name: "", total: 0, n: 0, last: "", emails: new Set() }); g.total += p.amount; g.n++; if (p.day > g.last) g.last = p.day; d.emailsOf(p).forEach(e => g.emails.add(e)); if (!g.name) g.name = (p.client_id && (R.clients.find(c => c.id === p.client_id) || {}).name) || p.payer_name || p.email || "Client"; });
  const buyersL = Object.values(groups2).map(g => ({ ...g, msgs: d.cn([...g.emails]) })).sort((x, y) => y.total - x.total);
  d.top = buyersL.slice(0, 5); d.buyersN = buyersL.length; d.repeat = buyersL.length ? buyersL.filter(g => g.n > 1).length / buyersL.length * 100 : null; d.ltv = buyersL.length ? d.allTime / buyersL.length : null; d.buyersL = buyersL;
  d.deliv = { rate: d.sentAll ? d.bounced / d.sentAll * 100 : 0, unsub: sum(R.camps, c => c.unsubscribed), worst: R.camps.filter(c => (c.emails_sent || 0) >= 100).map(c => ({ ...c, rate: (c.bounced || 0) / c.emails_sent * 100 })).sort((x, y) => y.rate - x.rate).slice(0, 3) };
  d.turn = []; for (let w = 7; w >= 0; w--) { const s = addDays(wk, -7 * w), e = addDays(s, 7), hs2 = delivered.filter(p => p.yes_at && dayOf(p.delivered_at) >= s && dayOf(p.delivered_at) < e).map(p => (new Date(p.delivered_at) - new Date(p.yes_at)) / 36e5).filter(h => h >= 0 && h < 24 * 30); d.turn.push({ s, n: hs2.length, med: med(hs2) }); }
  d.inbList = [...R.inboxes].sort((x, y) => String(x.email).localeCompare(String(y.email)));
  const sumDays = (from, to, k) => { let s = 0; for (let x = from; x < to; x = addDays(x, 1)) s += (byDay[x] || {})[k] || 0; return s; }, chg = (now, was) => was > 0 ? (now - was) / was * 100 : null;
  P.dNw = chg(P.nw, sumDays(qStart, pStart, "nw")); P.dRep = chg(P.rep, sumDays(qStart, pStart, "rep")); P.dSamples = chg(P.samples, delivered.filter(p => { const dd = dayOf(p.delivered_at); return dd >= qStart && dd < pStart; }).length);

  /* ---- v2: "do next": the highest-value open actions, best first ---- */
  const nx = [], seenN = new Set(), push = x => { const k = (x.email || x.k) + "|" + x.title; if (!seenN.has(k)) { seenN.add(k); nx.push(x); } };
  (att.paid_waiting || []).forEach(x => push({ w: 100, icon: "cash", c: "c-green", title: `Deliver to ${x.name}`, sub: x.detail || "Paid and still waiting for the videos", email: x.email }));
  d.pVideos.filter(v => /^(received|revision)$/.test(v.status)).forEach(v => { const du = dueIn(v.due_at); push({ w: du && du.late ? 97 : 82, icon: "play", c: "c-purple", title: `${v.status === "revision" ? "Changes asked" : "New video request"}: ${v.title || "Untitled"}`, sub: `${v.who.name}${du ? " · " + du.txt : ""}`, k: "pvideos", a: "" }); });
  (att.promises || []).forEach(x => push({ w: 92, icon: "flag", c: "c-ink", title: `Keep the promise to ${nameOf(x.email)}`, sub: x.detail || "", email: x.email }));
  d.hot.filter(h => h.us).forEach(h => push({ w: 90, icon: "mail", c: "c-red", title: `Reply to ${h.p.name || h.p.email}`, sub: `Hot lead waiting on us · ${h.tag[0]}`, email: h.p.email }));
  d.pSamples.filter(s => s.status === "requested").forEach(s => push({ w: 80, icon: "film", c: "c-purple", title: `Answer ${s.who.name}'s sample request`, sub: "Accept or decline it in the portal queue", k: "psamples", a: "" }));
  (att.reply || []).forEach(x => push({ w: 70, icon: "mail", c: "c-blue", title: `Reply to ${x.name}`, sub: x.detail || "A reply is waiting", email: x.email }));
  (att.overdue || []).forEach(x => push({ w: 60, icon: "alert", c: "c-orange", title: `Overdue: ${x.name}`, sub: x.detail || "", email: x.email }));
  d.fuDays[0].list.forEach(f => push({ w: 40, icon: "clock", c: "c-grey", title: `Follow up with ${f.name || f.email}`, sub: `touch ${Math.min((f.touches_done || 0) + 1, f.touches_total || 99)} of ${f.touches_total || "?"} · due today`, email: f.email }));
  d.nextAll = nx.sort((x, y) => y.w - x.w); d.next = d.nextAll.slice(0, 5); d.nextN = nx.length;
  return d;
}

/* ---------------- svg + html helpers ---------------- */
function smooth(pts, top, bot) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}h.01` : "";
  let s = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, k = 0.17;
    const c1y = clamp(p1[1] + (p2[1] - p0[1]) * k, top, bot), c2y = clamp(p2[1] - (p3[1] - p1[1]) * k, top, bot);
    s += `C${(p1[0] + (p2[0] - p0[0]) * k).toFixed(1)},${c1y.toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * k).toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return s;
}
const lineXY = (vals, W, H, pad, max) => vals.map((v, i) => [vals.length === 1 ? W / 2 : i / (vals.length - 1) * W, H - pad - (max ? v / max : 0) * (H - pad * 2)]);
const webUrl = u => { try { const x = new URL(String(u).trim()); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };   // only http/https ever becomes a link
const short = u => cut(String(u).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), 44);
const ext = (u, label) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label || short(u))}</a>`;
const linkify = (text, max = 4) => String(text || "").split(/\s+/).map(webUrl).filter(Boolean).slice(0, max).map(u => ext(u)).join(" · ");
const head = (title, right = "", strong = false) => `<header class="ch"><span class="ct${strong ? " strong" : ""}">${title}</span>${right ? `<span class="cx">${right}</span>` : ""}</header>`;
const bar = (pct, c = "") => `<div class="bar ${c}"><i data-v="w:${clamp(pct || 0, 0, 100).toFixed(1)}%"></i></div>`;
const relA = t => { const r = rel(t); return r === "now" ? "just now" : /^[A-Z]/.test(r) ? "on " + r : r + " ago"; };
const empty = t => `<p class="empty">${t}</p>`;
/* every number and row is a real control: dB = "drill button" (opens the list behind it in the modal) */
const dB = (k, a, inner, cls = "", label = "") => `<button type="button" class="${cls}" data-act="drill" data-k="${k}" data-a="${esc(a ?? "")}"${label ? ` aria-label="${esc(label)}" title="${esc(label)}"` : ""}>${inner}</button>`;
const big = (k, a, inner, label, cls = "") => dB(k, a, inner, "big tapn " + cls, label);
const tri = (label, val, k, a) => k ? dB(k, a, `<span>${label}</span><b>${val}</b>`, "", `${label}: open the list`) : `<div><span>${label}</span><b>${val}</b></div>`;
const kv = (label, val, k, a, cls = "") => k ? dB(k, a, `<span>${label}</span><span>${val}</span>`, "kv " + cls) : `<div class="kv ${cls}"><span>${label}</span><span>${val}</span></div>`;
const leadBtn = (email, inner, cls = "tile row") => `<button type="button" class="${cls}" data-act="lead" data-email="${esc(email)}">${inner}</button>`;
const lrow = (p, sub, end = "") => leadBtn(p.email || p.lead_email, `<span class="av">${esc(initials(p))}</span><span class="row-main"><b>${esc(p.name || p.email || p.lead_email)}</b><small>${esc(cut(sub, 90))}</small></span>${end}`);
const cvChip = n => `<span class="chip cvn${n ? "" : " z"}" title="${n ? n + " messages in the conversation" : "No email conversation synced for this address yet"}">💬 ${n}</span>`;
const dl = v => v == null || !isFinite(v) ? "" : `<em class="dl ${v >= 0 ? "up" : "dn"}" title="Against the same length of time just before">${v >= 0 ? "▲" : "▼"} ${Math.abs(v) >= 1000 ? "999+" : Math.abs(v).toFixed(0)}%</em>`;
const sortB = (key, cur, opts) => `<button type="button" class="sortb" data-act="sort" data-key="${key}" title="Change the order" aria-label="Order: ${opts[cur]}. Change the order.">${ic("sort")}${opts[cur]}</button>`;

/* ---------------- client-portal tiles (cards and modals share them) ---------------- */
const SCHIP = { requested: "o", accepted: "b", building: "b", ready: "g", declined: "r" }, VCHIP = { received: "o", editing: "b", revision: "r", ready: "g", approved: "g" };
const histChips = h => `${h.sample ? `<span class="chip w" title="One free sample per person, ever">had a sample ${dLabel(h.sample)}</span>` : h.lead ? `<span class="chip" title="This email is a lead in the samples pipeline">in the pipeline</span>` : ""}${h.paid ? `<span class="chip g">paid ${usd(h.paid)} before</span>` : ""}`;
const act = (op, id, label, cls = "") => `<button type="button" class="act ${cls}" data-act="pop" data-op="${op}" data-id="${esc(id)}">${label}</button>`;
const dueChip = t => { const x = dueIn(t); return x ? `<span class="due${x.late ? " late" : ""}">${x.txt}</span>` : ""; };
const whoBtn = w => dB("client", "e:" + lc(w.email), `<span class="av">${esc(initials(w))}</span><span class="row-main"><b>${esc(w.name || w.email)}</b><small>${esc(w.email || "")}</small></span>`, "row np0", "Open this client");
const clientTile = c => `<div class="tile pt" id="pc-${esc(c.id)}"><div class="pt-top">${whoBtn(c)}<span class="due" title="Joined ${fDT(c.created_at)}">${rel(+new Date(c.created_at))}</span></div>
  <div class="pt-meta">${dB("client", "e:" + lc(c.email), `${c.left} credit${c.left === 1 ? "" : "s"} left`, `chip ${c.left ? "g" : ""}`, "Open this client: packs, videos, payments, conversation")}${c.exp ? dB("client", "e:" + lc(c.email), `until ${dLabel(dayOf(c.exp))}`, "chip", "Credits are valid until this day. Open this client.") : ""}${c.req ? `<button type="button" class="chip ${SCHIP[c.req.status] || ""}" data-act="jump" data-id="psamples" title="Jump to the sample requests">sample ${esc(c.req.status)}</button>` : ""}${histChips(c.hist)}</div>
  <div class="pt-lines">${c.channel ? `<span><b>Channel</b> ${linkify(c.channel, 1) || esc(cut(c.channel, 60))}</span>` : ""}${c.sells ? `<span><b>Sells</b> ${esc(cut(c.sells, 90))}</span>` : ""}${c.frequency ? `<span><b>Posts</b> ${esc(cut(c.frequency, 40))}</span>` : ""}<span><b>Phone</b> ${c.phone ? "yes" : "no"}</span></div>
  <div class="acts">${act("pack", c.id, "Add a pack")}</div></div>`;
const sampleTile = s => { const A = { requested: [["s-accept", "Accept", "go"], ["s-decline", "Decline", "no"]], accepted: [["s-building", "Building"], ["s-ready", "Ready, send link", "go"], ["s-decline", "Decline", "no"]], building: [["s-ready", "Ready, send link", "go"]] }[s.status] || [], pv = webUrl(s.preview_url), vu = webUrl(s.video_url);
  return `<div class="tile pt"><div class="pt-top">${whoBtn(s.who)}${dB("client", "e:" + lc(s.who.email), esc(s.status), `chip ${SCHIP[s.status] || ""}`, "Open this client")}</div>
  <div class="pt-meta">${dueChip(s.status === "ready" || s.status === "declined" ? null : s.due_at)}<span class="due">asked ${relA(+new Date(s.created_at))}</span>${histChips(s.hist)}</div>
  <div class="pt-lines"><span><b>Video</b> ${vu ? ext(vu) : esc(cut(s.video_url, 70))}</span>${s.moment ? `<span><b>Moment</b> ${esc(cut(s.moment, 140))}</span>` : ""}${s.style ? `<span><b>Style</b> ${esc(cut(s.style, 160))}</span>` : ""}${s.goal ? `<span><b>Goal</b> ${esc(cut(s.goal, 140))}</span>` : ""}${s.note ? `<span><b>Our note</b> ${esc(cut(s.note, 160))}</span>` : ""}${pv ? `<span><b>Preview</b> ${ext(pv)}</span>` : ""}</div>
  ${A.length ? `<div class="acts">${A.map(a => act(a[0], s.id, a[1], a[2] || "")).join("")}</div>` : ""}</div>`; };
const videoTile = v => { const A = { received: [["v-editing", "Mark editing"], ["v-deliver", "Deliver", "go"]], editing: [["v-deliver", "Deliver", "go"]], revision: [["v-editing", "Mark editing"], ["v-deliver", "Deliver new version", "go"]], ready: [["v-deliver", "Deliver new version"]] }[v.status] || [], ru = webUrl(v.result_url), links = linkify(v.footage);
  return `<div class="tile pt"><div class="pt-top">${dB("client", "e:" + lc(v.who.email), `<span class="it c-purple"><svg><use href="#i-play"/></svg></span>`, "itb", "Open this client")}<span class="row-main">${dB("client", "e:" + lc(v.who.email), esc(v.title || "Untitled video"), "vtb", "Open this client")}<small>${dB("client", "e:" + lc(v.who.email), esc(v.who.name), "lk", "Open this client")}</small></span>${dB("client", "e:" + lc(v.who.email), `${esc(v.status)}${v.version ? ` · v${+v.version}` : ""}`, `chip ${VCHIP[v.status] || ""}`, "Open this client")}</div>
  <div class="pt-meta">${dueChip(/^(ready|approved)$/.test(v.status) ? null : v.due_at)}<span class="due">asked ${relA(+new Date(v.created_at))}</span>${v.open ? `<span class="chip r">${v.open} open change${v.open === 1 ? "" : "s"}</span>` : ""}</div>
  <div class="pt-lines"><span><b>Footage</b> ${links || esc(cut(v.footage || "none sent", 80))}</span>${v.notes ? `<span><b>Notes</b> ${esc(cut(v.notes, 200))}</span>` : ""}${ru ? `<span><b>Delivered</b> ${ext(ru)}${v.delivered_at ? ` · ${fDT(v.delivered_at)}` : ""}</span>` : ""}</div>
  ${A.length ? `<div class="acts">${A.map(a => act(a[0], v.id, a[1], a[2] || "")).join("")}</div>` : ""}</div>`; };
const mmss = s => { s = Math.max(0, Math.round(+s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const noteTile = g => `<div class="tile pt"><div class="pt-top">${dB("pvideos", "", `<span class="it c-red"><svg><use href="#i-alert"/></svg></span>`, "itb", "Open the video requests")}<span class="row-main">${dB("pvideos", "", esc(g.video.title || "Untitled video"), "vtb", "Open the video requests")}<small>${dB("client", "e:" + lc(g.who.email), esc(g.who.name), "lk", "Open this client")} · round ${g.round}</small></span>${dB("pvideos", "", g.notes.length, "chip r", "Open the video requests")}</div>
  <div class="pt-lines">${g.notes.map(n => `<span><b>${mmss(n.at)}</b> ${esc(cut(n.text, 220))} <b>· ${fDT(n.created_at)}</b></span>`).join("")}</div>
  <div class="acts">${act("v-editing", g.video.id, "Mark editing")}${act("v-deliver", g.video.id, "Deliver new version", "go")}</div></div>`;
const feedSeen = new Set();
const feedRow = (e, fresh) => { const inner = `<span class="it ${e.c}"><svg><use href="#i-${e.icon}"/></svg></span><span class="fe-m"><b>${esc(cut(e.title, 64))}</b><small>${esc(cut(e.sub, 80))}</small></span><time>${e.dateOnly ? dLabel(dayOf(e.t)) : rel(e.t)}</time>`;
  return e.email ? `<button type="button" class="fe${fresh ? " new" : ""}" data-act="lead" data-email="${esc(e.email)}">${inner}</button>` : `<button type="button" class="fe${fresh ? " new" : ""}" data-act="drill" data-k="${e.k}" data-a="${esc(e.a)}">${inner}</button>`; };

/* ---------------- cards ---------------- */
const CARDS = [
{ id: "brand", cls: "brand", title: "Status", mount(el) {
    el.innerHTML = `<div class="brand-top"><button type="button" class="brandrow" data-act="drill" data-k="me" data-a="" title="Your login and the shortcuts"><span class="logo"><img src="../beju-mark-sm.png" alt="" width="34" height="20"></span><span class="bt"><b>BEJÚ</b><small>Founder CRM</small></span></button>
      <div class="brand-tools"><button type="button" class="icon-btn" data-act="refresh" id="b-refresh" aria-label="Refresh now" title="Refresh now"><svg><use href="#i-refresh"/></svg></button><button type="button" class="icon-btn" data-act="signout" aria-label="Sign out" title="Sign out"><svg><use href="#i-out"/></svg></button></div></div>
      <button type="button" class="live" data-act="drill" data-k="sync" data-a="" title="Open the sync details"><span class="pulse" id="b-pulse"></span><span id="b-live">Live</span></button>
      <div class="wave"><svg viewBox="0 0 1200 96" preserveAspectRatio="none" aria-hidden="true"><path class="w2" d="M0,40 C100,10 200,10 300,40 S500,70 600,40 S800,10 900,40 S1100,70 1200,40 V96 H0Z"/><path class="w1" d="M0,52 C100,30 200,30 300,52 S500,74 600,52 S800,30 900,52 S1100,74 1200,52 V96 H0Z"/></svg>
      <div class="brand-me"><button type="button" id="b-me" data-act="drill" data-k="me" data-a="" title="Your login and the shortcuts"></button><button type="button" class="brand-date" id="b-date" data-act="drill" data-k="day" title="Open today's sends"></button></div></div>`;
  }, update(d) {
    $("#b-live").textContent = d.syncAt ? `${RT === "live" ? "Live" : "Polling"} · synced ${ago(d.syncAt)}` : "Live";
    $("#b-pulse").classList.toggle("off", !d.syncOk || Date.now() - d.syncAt > 45 * 6e4);
    $("#b-me").textContent = ME ? (ME.name || ME.email) : ""; $("#b-date").textContent = dLong(d.t); $("#b-date").dataset.a = d.t;
  } },
{ id: "next", title: "Do next", focus: ["next", ""], render: d => `${head(`Do <em class="sf">next</em>`, dB("next", "", d.nextN, `chip ${d.nextN ? "o" : "g"}`, "Open every open action"), true)}<div class="stack">${d.next.map((x, i) => { const inner = `<span class="it ${x.c}"><svg><use href="#i-${x.icon}"/></svg></span><span class="row-main"><b>${esc(cut(x.title, 48))}</b><small>${esc(cut(x.sub, 70))}</small></span><span class="row-end"><small>#${i + 1}</small></span>`; return x.email ? leadBtn(x.email, inner) : dB(x.k, x.a, inner, "tile row"); }).join("") || empty("Nothing is waiting on you. Go find new leads.")}</div>
    <p class="sub">Ranked: paid clients first, then promises, hot leads waiting on us, portal requests, replies, overdue actions.</p>` },
{ id: "money", title: "Money", render: d => { const P = d.per;
    return `${head(`Money · ${P.label}`, `<button type="button" class="chip" data-act="pernext" title="Change the period: today, 7 days, 30 days, month">${P.chip}</button>`)}
    ${big("pays", "period", N(P.rev, "usd"), `Open the payments of ${P.label}`)}
    <p class="sub">${P.delta == null ? `<span class="mut">nothing in the period before to compare</span>` : `<span class="${P.delta >= 0 ? "up" : "dn"} mono">${P.delta >= 0 ? "▲" : "▼"} ${Math.abs(P.delta).toFixed(1)}%</span> ${P.vs}`}</p>
    <button type="button" class="spark" data-act="drill" data-k="pays" data-a="period" aria-label="Money day by day in this period. Open the payments." title="Open the payments"><svg viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="g-spark" x1="0" y1="0" x2="0" y2="1"><stop class="stop-a" offset="0"/><stop class="stop-b" offset="1"/></linearGradient></defs>${(() => { const pts = lineXY(P.cum.length > 1 ? P.cum : [0, P.cum[0] || 0], 300, 64, 6, Math.max(1, ...P.cum)); const p = smooth(pts, 6, 58); return `<path class="ar" d="${p}L300,64L0,64Z"/><path class="ln" d="${p}"/>`; })()}</svg></button>
    <div class="trio">${tri("Payments", N(P.revN), "pays", "period")}${tri(`${d.prevName} total`, N(d.prevFull, "usd"), "pays", d.pym)}${tri("Avg order", N(d.avgOrder, "usd"), "pays", "all")}</div>`; } },
{ id: "outreach", cls: "w2 chart-card", title: "Outreach", focus: ["days", ""], render: d => {
    const days = d.series.slice(-STATE.range), W = 600, H = 200, pad = 10, max = Math.max(1, ...days.map(x => Math.max(STATE.sa ? x.sent : 0, STATE.sb ? x.nw : 0)));
    const pa = lineXY(days.map(x => x.sent), W, H, pad, max), pb = lineXY(days.map(x => x.nw), W, H, pad, max), part = days.length > 2 && days[days.length - 1].day === d.t, n = part ? -1 : undefined,
      A = smooth(pa.slice(0, n), pad, H - pad), B = smooth(pb.slice(0, n), pad, H - pad), ax = part ? pa[pa.length - 2][0].toFixed(1) : W,
      dash = (q, c) => part ? `<line class="${c} part" x1="${q[q.length - 2][0].toFixed(1)}" y1="${q[q.length - 2][1].toFixed(1)}" x2="${q[q.length - 1][0].toFixed(1)}" y2="${q[q.length - 1][1].toFixed(1)}"/>` : "";
    PLOT.out = { n: days.length, i: days.length - 1, paint: i => paintOut(days, max, H, pad, i), drill: i => openDrill("day", days[i].day) };
    const ticks = [...new Set([0, .25, .5, .75, 1].map(f => Math.round(f * (days.length - 1))))], lg = (s, c, label) => `<button type="button" class="lgt${STATE[s] ? "" : " off"}" data-act="series" data-s="${s}" aria-pressed="${STATE[s]}" title="Show or hide this line"><i class="dot round ${c}"></i>${label}</button>`;
    return `${head("Outreach", `<span class="lgd">${lg("sa", "c-blue", "Emails sent")}${lg("sb", "c-orange", "New leads")}</span><span class="rng" role="group" aria-label="Range">${[7, 14, 30].map(r => `<button type="button" data-act="range" data-r="${r}" class="${STATE.range === r ? "on" : ""}" aria-pressed="${STATE.range === r}">${r}d</button>`).join("")}</span>`, true)}
    <div class="chart plot" id="chart" data-plot="out" tabindex="0" role="group" aria-label="Emails sent and new leads per day. Arrow keys move through the days, Enter opens the day."><svg class="lines" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="g-chart" x1="0" y1="0" x2="0" y2="1"><stop class="stop-a" offset="0"/><stop class="stop-b" offset="1"/></linearGradient></defs>
      ${[.25, .5, .75].map(f => `<line class="gl" x1="0" x2="${W}" y1="${(H * f).toFixed(0)}" y2="${(H * f).toFixed(0)}"/>`).join("")}${STATE.sa ? `<path class="aa" d="${A}L${ax},${H}L0,${H}Z"/>` : ""}${STATE.sb ? `<path class="lb" d="${B}"/>${dash(pb, "lb")}` : ""}${STATE.sa ? `<path class="la" d="${A}"/>${dash(pa, "la")}` : ""}</svg>
      <i class="cur"></i><i class="cdot a c-blue"></i><i class="cdot b c-orange"></i><div class="tip"></div></div>
    <div class="xl">${ticks.map(i => `<span class="${i === days.length - 1 ? "on" : ""}">${i === days.length - 1 ? "Today" : dLabel(days[i].day)}</span>`).join("")}</div>
    <div class="trio quad">${tri(`Sent, ${STATE.range} d`, N(sum(days, x => x.sent)), "days", "")}${tri("New leads", N(sum(days, x => x.nw)), "days", "")}${tri("Real replies", N(sum(days, x => x.rep)), "replies", "real")}${tri("Positive", `<span class="up">${N(sum(days, x => x.opp))}</span>`, "funnel", "2")}</div>`;
  } },
{ id: "goal", cls: "feat tilt", title: "Road to the goal", render: d => { const c1 = 2 * Math.PI * 62, c2 = 2 * Math.PI * 45, p = clamp(d.goalPct, 0, 100), mp = d.dom / d.dim * 100;
    return `${head(`Road to $${nf0.format(GOAL / 1000)}k / <em class="sf">month</em>`)}
    ${dB("goal", "", `<svg viewBox="0 0 150 150" aria-hidden="true"><circle class="tr" cx="75" cy="75" r="62"/><circle class="tr2" cx="75" cy="75" r="45"/><circle class="pr" cx="75" cy="75" r="62" data-v="p:${(c1 * p / 100).toFixed(1)}"/><circle class="pr2" cx="75" cy="75" r="45" data-v="p:${(c2 * mp / 100).toFixed(1)}"/></svg>
      <span class="ring-mid"><span><b>${N(d.goalPct, d.goalPct < 10 ? "pct1" : "pct")}</b><small>of goal</small></span></span>`, "ring", "Outer ring: money this month against the goal. Inner ring: how much of the month has passed. Open the maths.")}
    ${kv(`${d.monthName} so far`, `${N(d.month, "usd")} / $${nf0.format(GOAL)}`, "pays", "month")}<hr>
    ${kv("Needed per day", N(d.perDay, "usd"), "goal", "")}${kv("On pace for", N(d.projected, "usd"), "goal", "")}${kv("Days left · month gone", `${N(d.daysLeft)} · ${N(mp, "pct")}`, "goal", "")}`; } },
{ id: "revchart", cls: "w2 chart-card", title: "Revenue this month", focus: ["pays", "month"], render: d => {
    const W = 600, H = 180, pad = 8, ymax = Math.max(GOAL, d.projected, d.month, 1), X = i => i / d.dim * W, Y = v => H - pad - v / ymax * (H - pad * 2), pc = (v, of) => (v / of * 100).toFixed(2) + "%";
    const line = "M" + [[0, Y(0)]].concat(d.cum.map((v, i) => [X(i + 1), Y(v)])).map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L"), paceNow = GOAL * d.dom / d.dim;
    PLOT.rev = { n: d.dim, i: d.dom - 1, paint: i => paintRev(d, ymax, H, pad, i), drill: i => { const day = `${d.ym}-${String(i + 1).padStart(2, "0")}`; openDrill("pays", day <= d.t ? day : "month"); } };
    const lg = (s, label) => `<button type="button" class="lgt${STATE[s] ? "" : " off"}" data-act="series" data-s="${s}" aria-pressed="${STATE[s]}" title="Show or hide this line"><i class="dash"></i>${label}</button>`;
    return `${head(`Revenue in ${d.monthName}`, `<span class="lgd">${lg("rg", "Goal pace")}${lg("rp", "Projection")}</span>`, true)}
    <div class="rev plot" id="rev" data-plot="rev" tabindex="0" role="group" aria-label="Money per day this month against the pace to the goal. Arrow keys move through the days, Enter opens the payments of that day."><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="g-rev" x1="0" y1="0" x2="0" y2="1"><stop class="stop-k" offset="0"/><stop class="stop-kb" offset="1"/></linearGradient></defs>
      ${[.25, .5, .75].map(f => `<line class="gl" x1="0" x2="${W}" y1="${Y(ymax * f).toFixed(1)}" y2="${Y(ymax * f).toFixed(1)}"/>`).join("")}
      ${STATE.rg ? `<line class="goal" x1="0" y1="${Y(0).toFixed(1)}" x2="${W}" y2="${Y(GOAL).toFixed(1)}"/>` : ""}<path class="ar" d="${line}L${X(d.dom).toFixed(1)},${H}L0,${H}Z"/>
      ${STATE.rp && d.dom < d.dim ? `<line class="proj" x1="${X(d.dom).toFixed(1)}" y1="${Y(d.month).toFixed(1)}" x2="${W}" y2="${Y(d.projected).toFixed(1)}"/>` : ""}<path class="act" d="${line}"/></svg>
      <i class="dotn" data-v="x:${pc(X(d.dom), W)};y:${pc(Y(d.month), H)}"></i>
      ${STATE.rg ? `<span class="lab" data-v="y:${pc(Y(GOAL), H)}">goal ${usd(GOAL)}</span>` : ""}${STATE.rp ? `<span class="lab k" data-v="y:${pc(Y(d.projected), H)}">on pace ${usd(d.projected)}</span>` : ""}
      <i class="cur"></i><i class="cdot a c-blue"></i><div class="tip"></div></div>
    <div class="xl"><span>${d.monthName} 1</span><span>${d.monthName} ${Math.round(d.dim / 2)}</span><span>${d.monthName} ${d.dim}</span></div>
    <div class="trio quad">${tri("So far", N(d.month, "usd"), "pays", "month")}${tri("Pace needed by today", N(paceNow, "usd"), "goal", "")}${tri("Behind pace", `<span class="${d.month >= paceNow ? "up" : "dn"}">${N(Math.abs(paceNow - d.month), "usd")}</span>`, "goal", "")}${tri("On pace for", N(d.projected, "usd"), "goal", "")}</div>`;
  } },
{ id: "newleads", title: "New leads today", render: d => { const on = clamp(Math.round(d.todayNew / d.target * 10), 0, 10);
    return `${head("New leads today", dB("sync", "", `target ${nf0.format(d.target)}`, "lk", "Where the target comes from"))}
    ${big("day", d.t, `${N(d.todayNew)}<small>contacted so far</small>`, "Open today's split per campaign")}
    ${dB("day", d.t, Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? "on" : ""}" data-v="k:${i}"></i>`).join(""), "pips", `${Math.round(d.todayNew / d.target * 100)}% of today's target of ${d.target}`).replace('class="pips"', 'class="pips" data-go')}
    <div class="trio">${tri("Yesterday", N(d.yNew), "day", addDays(d.t, -1))}${tri("Queued", N(d.queued), "queued", "")}${tri("Streak", N(d.streak), "days", "")}</div>
    <p class="sub">Sends run in US hours, so today fills up in the evening. Streak = days in a row with 150+.</p>`; } },
{ id: "owner", cls: "bare", title: "Owner filter", mount(el) { el.innerHTML = `<div class="seg" role="group" aria-label="Whose leads">${["All", "Simas", "Benas"].map(o => `<button type="button" data-act="owner" data-o="${o}">${o}</button>`).join("")}</div>`; },
  update() { $$("#c-owner button").forEach(b => { const on = b.dataset.o === STATE.owner; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); } },
{ id: "hot", title: "Hot leads", focus: ["hotlist", ""], render: d => { const list = STATE.hotAll ? d.hot : d.hot.slice(0, 6);
    return `${head("Hot leads", `${sortB("hotSort", STATE.hotSort, { wait: "waiting on us", next: "next action", reply: "last reply" })}${dB("hotlist", "", d.hot.length, "chip r", "Open all hot leads")}`, true)}<div class="stack">${list.map(({ p, us, tag, days, hl }) => leadBtn(p.email, `<span class="av${us ? " hot" : ""}" title="${esc(cut(p.show || "", 80))}">${esc(initials(p))}</span><span class="row-main"><b>${esc(p.name || p.email)}</b><span class="tagline"><span class="chip ${tag[1]}">${tag[0]}</span>${cvChip(d.tc[lc(p.email)] || 0)}<small>${us ? `<span class="dn">on us</span>` : p.next_action_at ? dLabel(dayOf(p.next_action_at)) : "on them"}</small></span></span><span class="heatd h${hl}" title="${days == null ? "No reply on record" : "Last reply " + (days < 1 ? "today" : Math.round(days) + " days ago")}">${days == null ? "–" : days < 1 ? "now" : Math.round(days) + "d"}</span>${p.owner ? `<span class="who" title="${esc(p.owner)}">${esc(p.owner[0])}</span>` : ""}`)).join("") || empty("No hot leads right now.")}</div>
    ${d.hot.length > 6 ? `<button type="button" class="more" data-act="hotall">${STATE.hotAll ? "Show fewer" : `Show all ${d.hot.length}`}</button>` : ""}`; } },
{ id: "activity", title: "Activity", focus: ["feed", ""], render: d => { const list = d.feed.slice(0, 9), html = `${head("Activity", `<span class="mut">${RT === "live" ? "live" : "every minute"}</span>`, true)}<div class="feed">${list.map(e => feedRow(e, feedSeen.size > 0 && !feedSeen.has(e.t + e.title))).join("") || empty("Nothing has happened yet.")}</div>`;
    d.feed.forEach(e => feedSeen.add(e.t + e.title)); return html; } },
{ id: "moods", title: "Buyer moods", render: d => `${head("Buyer moods", dB("mood", "buyer", `Buyers ${d.buyers}`, "chip g", "Open the buyers"))}
    <div class="tile row-pad"><div class="segbar">${d.moods.map(m => `<button type="button" class="${m.c}" data-act="drill" data-k="mood" data-a="${m.k}" data-v="g:${m.n}" title="${m.label}: ${m.n}" aria-label="${m.label}: ${m.n} leads. Open them."></button>`).join("")}</div>
    <div class="legend">${d.moods.map(m => dB("mood", m.k, `<i class="dot ${m.c}"></i><span>${m.label}</span><b>${m.n}</b><em>${Math.round(m.n / Math.max(1, d.moodTotal) * 100)}%</em>`, "lg")).join("") || empty("No leads.")}</div></div>
    <p class="sub">${dB("mood", "all", `${N(d.moodTotal)} warm leads`, "lk")} without the buyers.</p>` },
{ id: "score", title: "Scoreboard", render: d => `${head("Scoreboard", "all time")}<div class="vs"><button type="button" data-act="owner" data-o="Simas" title="Show only Simas's leads">Simas</button><span>vs</span><button type="button" data-act="owner" data-o="Benas" title="Show only Benas's leads">Benas</button></div><div class="sc">${d.score.map(s => { const m = Math.max(1, s.a, s.b);
      return `<div class="sc-r"><div class="sc-l">${dB("owner", "Simas|" + s.k, N(s.a), "scb", `Simas, ${s.label}: ${s.a}. Open them.`)}<span>${s.label}</span>${dB("owner", "Benas|" + s.k, N(s.b), "scb r", `Benas, ${s.label}: ${s.b}. Open them.`)}</div><div class="sc-b"><span><i data-v="w:${(s.a / m * 100).toFixed(1)}%"></i></span><span><i data-v="w:${(s.b / m * 100).toFixed(1)}%"></i></span></div></div>`; }).join("")}</div>` },
{ id: "attention", title: "Needs attention", render: d => { const K = { reply: ["Replies waiting", "mail", "c-blue"], followup: ["Follow-ups due", "clock", "c-orange"], overdue: ["Overdue actions", "alert", "c-red"], paid_waiting: ["Paid, not delivered", "cash", "c-green"], promises: ["Promises past due", "flag", "c-ink"], brief: ["Said yes, no brief", "film", "c-purple"], followup_done: ["Finished, park", "check", "c-grey"] };
    const kinds = Object.keys(K).filter(k => d.att[k]?.length).concat(Object.keys(d.att).filter(k => !K[k]));
    return `${head("Needs attention", dB("att", "all", d.attTotal, `chip ${d.attTotal ? "o" : "g"}`, "Open everything that needs attention"), true)}<div class="stack">${kinds.map(k => { const [label, icon, c] = K[k] || [k, "alert", "c-grey"], list = d.att[k], open = STATE.att === k;
      return `<div class="tile"><button type="button" class="row" data-act="att" data-k="${esc(k)}" aria-expanded="${open}"><span class="it ${c}"><svg><use href="#i-${icon}"/></svg></span><span class="row-main"><b>${esc(label)}</b><small>${esc(cut(list.slice(0, 3).map(x => x.name).join(", "), 44))}</small></span><span class="row-end">${list.length}</span></button>
        ${open ? `<div class="names">${list.slice(0, 10).map(x => `<button type="button" data-act="lead" data-email="${esc(x.email)}" title="${esc(cut(x.detail, 140))}">${esc(cut(x.name, 30))}${x.due ? ` · <span class="mut">${dLabel(dayOf(x.due))}</span>` : ""}</button>`).join("")}${list.length > 10 ? dB("att", k, `+${list.length - 10} more`, "lk") : ""}</div>` : ""}</div>`; }).join("") || empty("Nothing waiting. All clear.")}</div>`; } },
{ id: "total", title: "Sent in total", render: d => `${head("Sent in total")}${big("sent", "", `${N(d.sentAll)}<small>emails</small>`, "Open the totals per campaign")}
    <div class="stack sp">${kv("Leads contacted", N(d.contacted), "sent", "")}${kv("Leads loaded", N(d.loaded), "sent", "")}${kv("Still queued", N(d.queued), "queued", "")}</div>
    ${dB("queued", "", bar(d.loaded ? d.contacted / d.loaded * 100 : 0), "barb", "Leads contacted out of leads loaded. Open what is still queued.")}<p class="sub">${dB("queued", "", `${N(d.loaded ? d.contacted / d.loaded * 100 : null, "pct")} of loaded leads`, "lk")} already contacted.</p>` },
{ id: "week", title: "New leads, 7 days", render: d => { const s = d.series.slice(-7), max = Math.max(1, ...s.map(x => x.nw));
    return `${head("New leads, last 7 days")}${big("days", "", N(sum(s, x => x.nw)), "Open the last 30 days", "sm")}
    <div class="wk">${s.map((x, i) => `<button type="button" class="${i === 6 ? "on" : ""}" data-act="drill" data-k="day" data-a="${x.day}" data-v="h:${(x.nw / max * 100).toFixed(1)}%;k:${i}" title="${dLong(x.day)}: ${nf0.format(x.nw)} new leads" aria-label="${dLong(x.day)}: ${nf0.format(x.nw)} new leads. Open the day."></button>`).join("")}</div>
    <div class="wkl">${s.map((x, i) => `<span class="${i === 6 ? "on" : ""}">${DOW[dow(x.day)]}</span>`).join("")}</div>`; } },
{ id: "heat", title: "Lead heatmap", render: d => { const flat = []; for (let w = 0; w < 8; w++) for (let r = 0; r < 7; r++) flat.push(d.heat.rows[r][w]); const live = flat.filter(c => !c.fut);
    PLOT.heat = { n: live.length, i: live.length - 1, paint: i => { const c = live[i]; $$("#heat .hc").forEach(el => el.classList.toggle("sel", el.dataset.a === c.day)); const cap = $("#heat-cap"); if (cap) cap.textContent = `${dLong(c.day)} · ${nf0.format(c.n)} new leads`; }, drill: i => openDrill("day", live[i].day) };
    const pk = live.reduce((m, x) => x.n > m.n ? x : m, live[0] || { n: 0, day: d.t });
    return `${head("New leads, 8 weeks", dB("day", pk.day, `peak ${nf0.format(d.heat.max)}`, "lk", "Open the best day"))}<div class="heat plot" id="heat" data-plot="heat" tabindex="0" role="group" aria-label="New leads per day for 8 weeks. Arrow keys move through the days, Enter opens the day.">${d.heat.rows.map((row, r) => `<small>${"MTWTFSS"[r]}</small>` + row.map((c, w) => c.fut ? `<i class="fut"></i>` : `<i class="hc${c.day === d.t ? " now" : ""}" data-i="${live.indexOf(c)}" data-a="${c.day}" data-v="o:${(c.n / d.heat.max).toFixed(2)};k:${w * 7 + r}" title="${dLong(c.day)}: ${nf0.format(c.n)} new leads"></i>`).join("")).join("")}</div>
    <div class="heat-l"><span>${dLabel(d.heat.weeks[0])}</span><span id="heat-cap">tap a day</span><span>this week</span></div>`; } },
{ id: "samples", title: "Samples done", render: d => { const L = Math.PI * 75, p = clamp(d.samples.conv || 0, 0, 100), a = Math.PI - Math.PI * p / 100, kx = 85 + 75 * Math.cos(a), ky = 90 - 75 * Math.sin(a);
    return `${head("Samples done", dB("samples", "week", `this week ${d.samples.week}`, "lk"))}${big("samples", "", `${N(d.samples.total)}<small>delivered</small>`, "Open the delivered samples")}
    ${dB("samples", "buyers", `<svg viewBox="0 0 170 96" aria-hidden="true"><path class="tr" d="M10,90 A75,75 0 0 1 160,90"/><path class="pr" d="M10,90 A75,75 0 0 1 160,90" data-v="p:${(L * p / 100).toFixed(1)}"/><circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="5.5" class="knob"/></svg>
      <span class="gauge-mid"><b>${N(d.samples.conv, "pct1")}</b><span class="sub">sample → buyer</span></span>`, "gauge", `${d.samples.buyers} of ${d.samples.total} samples became buyers. Open them.`)}
    <div class="trio">${tri("Buyers", N(d.samples.buyers), "samples", "buyers")}${tri("In edit", N(d.samples.wip), "samples", "wip")}${tri("Median", N(d.samples.median, "h1"), "samples", "recent")}</div>`; } },
{ id: "turn", title: "Sample turnaround", render: d => { const T = d.turn, max = Math.max(1, ...T.map(w => w.med || 0)), cur = [...T].reverse().find(w => w.med != null);
    return `${head("Sample turnaround", "yes → delivered")}${big("samples", cur ? "w:" + cur.s : "recent", cur ? `${N(cur.med, "h1")}<small>median, week of ${dLabel(cur.s)}</small>` : "—", "Open the samples of that week")}
    <div class="wk mini">${T.map((w, i) => `<button type="button" class="${i === 7 ? "on" : ""}" data-act="drill" data-k="samples" data-a="w:${w.s}" data-v="h:${(w.med == null ? 0 : w.med / max * 100).toFixed(1)}%;k:${i}" title="Week of ${dLabel(w.s)}: ${w.med == null ? "no samples" : w.med.toFixed(1) + " h median, " + w.n + " samples"}" aria-label="Week of ${dLabel(w.s)}: ${w.med == null ? "no samples" : w.med.toFixed(1) + " hours median"}. Open them."></button>`).join("")}</div>
    <p class="sub">Median hours from the lead's yes to the delivered sample, per week. Lower is better; the promise is "a couple of hours".</p>`; } },
{ id: "followups", title: "Follow-ups", render: d => { const sel = d.fuDays.find(x => x.day === STATE.day) || d.fuDays[0];
    return `${head("Follow-ups", dB("fu", "week", `${d.fuWeek} due this week`, "lk"), true)}
    <div class="days">${d.fuDays.map(x => `<button type="button" data-act="day" data-d="${x.day}" class="${x.day === sel.day ? "on" : ""}${x.list.length ? " has" : ""}" aria-pressed="${x.day === sel.day}" aria-label="${dLabel(x.day)}: ${x.list.length} due"><small>${DOW[dow(x.day)]}</small><b>${+x.day.slice(8)}</b><i></i></button>`).join("")}</div>
    <div class="stack duelist">${sel.list.slice(0, 6).map(f => leadBtn(f.email, `<span class="av">${esc(initials(f))}</span><span class="row-main"><b>${esc(f.name || f.email)}</b><small>touch ${Math.min((f.touches_done || 0) + 1, f.touches_total || 99)} of ${f.touches_total || "?"} · ${esc((f.fu_stage || "").replace(/_/g, " "))}</small></span>${f.owner ? `<span class="who" title="${esc(f.owner)}">${esc(f.owner[0])}</span>` : ""}`)).join("") || empty(`Nobody due on ${dLabel(sel.day)}.`)}${sel.list.length > 6 ? dB("fu", sel.day, `+${sel.list.length - 6} more`, "lk") : ""}</div>
    ${d.fuOver.length ? `<p class="sub">${dB("fu", "over", `${d.fuOver.length} overdue`, "lk dn")} from earlier days.</p>` : ""}`; } },
{ id: "rate", title: "Reply rate", render: d => `${head("Reply rate")}<div class="hrow">${big("sent", "rate", N(d.replyRate, "pct1"), "Open the reply rate per campaign")}${d.rateDelta == null ? "" : dB("days", "", `<i class="tri"></i>${d.rateDelta >= 0 ? "+" : "−"}${Math.abs(d.rateDelta).toFixed(1)} pts`, `delta ${d.rateDelta >= 0 ? "up" : "dn"}`, "Last 7 days against the 7 before. Open the days.")}</div>
    <p class="sub">Real replies per lead contacted, all time. The chip compares the last 7 days with the 7 before.</p>
    <div class="trio">${tri("Positive", `<span class="up">${N(d.posRate, "pct1")}</span>`, "funnel", "2")}${tri("Real", N(d.repAll), "replies", "real")}${tri("Auto", N(d.autoAll), "away", "")}</div>` },
{ id: "speed", title: "Speed to reply", render: d => { const S = d.speed, max = Math.max(1, ...S.weeks.map(w => w.med || 0)), better = S.w != null && S.pw != null ? S.w <= S.pw : null;
    return `${head("Speed to reply", better == null ? "median" : `<span class="${better ? "up" : "dn"}">${better ? "faster" : "slower"} than last week</span>`)}${big("speed", "", S.all == null ? "—" : esc(fmtMin(S.all)), "Open every answered reply with its waiting time")}
    <p class="sub">From a lead's email to our next email in that thread. ${nf0.format(S.n)} answered replies. An estimate: auto-replies are only left out where the reply queue marks them.</p>
    <div class="wk mini">${S.weeks.map((w, i) => `<button type="button" class="${i === 7 ? "on" : ""}" data-act="drill" data-k="speed" data-a="${w.s}" data-v="h:${(w.med == null ? 0 : w.med / max * 100).toFixed(1)}%;k:${i}" title="Week of ${dLabel(w.s)}: ${w.med == null ? "no answered replies" : fmtMin(w.med) + " median, " + w.n + " replies"}" aria-label="Week of ${dLabel(w.s)}: ${w.med == null ? "no answered replies" : fmtMin(w.med) + " median"}. Open them."></button>`).join("")}</div>
    <div class="trio">${tri("Last 7 days", esc(fmtMin(S.w)), "speed", "7")}${tri("Within 1 h", S.h1 == null ? "—" : N(S.h1, "pct"), "speed", "fast")}${tri("Slowest", esc(fmtMin(S.max)), "speed", "slow")}</div>`; } },
{ id: "clock", title: "Reply clock", render: d => { const C = d.clock, R0 = 46, LEN = 40, pos = (h, r) => { const a = h / 24 * 2 * Math.PI - Math.PI / 2; return [(100 + r * Math.cos(a)).toFixed(1), (100 + r * Math.sin(a)).toFixed(1)]; };
    PLOT.clock = { n: 24, i: C.peak, paint: i => { $$("#clock .cb").forEach(el => el.classList.toggle("on", +el.dataset.h === i)); const m = $("#clock-mid"); if (m) m.innerHTML = `<span><b>${String(i).padStart(2, "0")}:00</b><small>${C.h[i]} repl${C.h[i] === 1 ? "y" : "ies"}</small></span>`; }, drill: i => openDrill("hour", i) };
    return `${head("Reply clock", "when leads answer")}<div class="clock plot" id="clock" data-plot="clock" tabindex="0" role="group" aria-label="Real replies by hour of the day, ${esc(TZ)} time. Arrow keys move through the hours, Enter opens the replies of that hour.">
      <svg viewBox="0 0 200 200" aria-hidden="true"><circle class="cr" cx="100" cy="100" r="${R0 - 5}"/>${C.h.map((n, h) => { const [x1, y1] = pos(h, R0), [x2, y2] = pos(h, R0 + LEN), l = n ? Math.max(3, n / C.max * LEN) : 0;
        return `<line class="cb${h === C.peak && n ? " pk" : ""}" data-h="${h}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" data-v="l:${l.toFixed(1)};k:${h}"/><line class="hit" data-i="${h}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><title>${String(h).padStart(2, "0")}:00 · ${n} repl${n === 1 ? "y" : "ies"}</title></line>`; }).join("")}
        ${[0, 6, 12, 18].map(h => { const [x, y] = pos(h, R0 + LEN + 10); return `<text x="${x}" y="${y}">${String(h).padStart(2, "0")}</text>`; }).join("")}</svg>
      <div class="clock-mid" id="clock-mid"><span><b>${String(C.peak).padStart(2, "0")}:00</b><small>busiest hour</small></span></div></div>
    <p class="sub">${dB("replies", "real", `${N(C.total)} real replies`, "lk")} in the last 60 days, ${esc(TZ.split("/")[1] || TZ)} time.</p>`; } },
{ id: "camps", title: "Campaigns", render: d => `${head("Campaigns", `${sortB("campSort", STATE.campSort, { sent: "most sent", rate: "best reply %" })}${dB("sent", "", `${d.camps.length} live`, "lk")}`, true)}<div class="stack">${d.camps.map(c => { const rr = c.new_contacted ? (c.replies || 0) / c.new_contacted * 100 : null;
      return dB("camp", c.campaign_id, `<span class="row"><span class="av">${esc(initials({ name: campName(c.name) }))}</span><span class="row-main"><b title="${esc(c.name)}">${esc(campName(c.name))}</b><small>${nf0.format(c.emails_sent || 0)} sent · ${nf0.format(c.uncontacted || 0)} queued</small></span><span class="row-end">${rr == null ? "—" : rr.toFixed(1) + "%"}<small>${+c.opportunities || 0} pos.</small></span></span>${bar(c.leads_total ? (c.new_contacted || 0) / c.leads_total * 100 : 0)}`, "tile camp"); }).join("") || empty("No campaign data.")}</div>
    ${d.campsOld ? `<p class="sub">${dB("sent", "", `${d.campsOld} older campaigns`, "lk")} are not shown (no fresh sync).</p>` : ""}` },
{ id: "deliv", title: "Deliverability", render: d => `${head("Deliverability", "all time")}${big("deliv", "", `${N(d.deliv.rate, "pct1")}<small>bounced</small>`, "Open bounces per campaign")}
    ${dB("deliv", "", bar(clamp(d.deliv.rate / 3 * 100, 0, 100), d.deliv.rate > 2 ? "c-red" : "c-green"), "barb", "Bounce rate against the 3% danger line")}<p class="sub">${d.deliv.rate > 2 ? "Above 2%: clean the lists before pushing more." : "Under 2% is healthy."} The bar is full at 3%.</p>
    <div class="stack sp">${d.deliv.worst.map(c => dB("camp", c.campaign_id, `<span>${esc(cut(campName(c.name), 22))}</span><span>${c.rate.toFixed(1)}% · ${nf0.format(c.bounced || 0)}</span>`, "kv")).join("")}</div>
    <div class="trio">${tri("Bounced", N(d.bounced), "deliv", "")}${tri("Unsubscribed", N(d.deliv.unsub), "deliv", "")}${tri("Sent", N(d.sentAll), "sent", "")}</div>` },
{ id: "buyers", title: "Buyers", focus: ["pays", "all"], render: d => `${head("Buyers", dB("clients", "", `${d.clients} clients`, "lk"), true)}<div class="stack">${d.recentPays.map(p => dB("client", payKey(p), `<span class="av">${esc(initials({ name: p.payer_name, email: p.email }))}</span><span class="row-main"><b>${esc(cut(p.payer_name || p.email || "Payment", 26))}</b><span class="tagline">${cvChip(d.cn(d.emailsOf(p)))}<small>${esc(PACK[p.package] || (p.package ? p.package : "Custom"))}</small></span></span><span class="row-end up">+$${nf0.format(p.amount)}<small>${dLabel(p.day)}</small></span>`, "tile row")).join("") || empty("No payments yet.")}</div>
    <div class="trio">${tri("Payments", N(d.payN), "pays", "all")}${tri("Avg order", N(d.avgOrder, "usd"), "pays", "all")}${tri(`Best, ${d.bestMonth ? d.bestMonth.name : "—"}`, d.bestMonth ? N(d.bestMonth.v, "usd") : "—", d.bestMonth ? "pays" : "", d.bestMonth ? d.bestMonth.ym : "")}</div>` },
{ id: "topc", title: "Top clients", focus: ["clients", ""], render: d => `${head("Top clients", dB("clients", "", `${d.buyersN} buyers`, "lk"), true)}<div class="stack">${d.top.map((x, i) => dB("client", x.key, `<span class="av">${i + 1}</span><span class="row-main"><b>${esc(cut(x.name, 26))}</b><span class="tagline">${cvChip(x.msgs)}<small>${x.n} payment${x.n === 1 ? "" : "s"} · last ${dLabel(x.last)}</small></span></span><span class="row-end up">${usd(x.total)}</span>`, "tile row")).join("") || empty("No payments yet.")}</div>
    <div class="trio">${tri("Repeat buyers", d.repeat == null ? "—" : N(d.repeat, "pct"), "clients", "repeat")}${tri("Avg lifetime", N(d.ltv, "usd"), "clients", "")}${tri("Avg order", N(d.avgOrder, "usd"), "pays", "all")}</div>` },
{ id: "alltime", title: "All-time money", render: d => `${dB("pays", "all", `<span class="it c-blue"><svg><use href="#i-flag"/></svg></span><span class="row-main"><b>Next milestone $${nf0.format(d.nextMs)}</b><small>$${nf0.format(d.allTime)} of $${nf0.format(d.nextMs)}</small></span><span class="big sm">${N(d.msPct, "pct")}</span>`, "row np", "Open every payment")}
    ${dB("pays", "all", bar(d.msPct), "barb", "Progress to the next $1,000 milestone")}
    <div class="tile row-pad sp2">${kv("Money generated, all time", N(d.allTime, "usd"), "pays", "all")}${kv("To go", N(d.nextMs - d.allTime, "usd"), "pays", "all")}${kv("Payments", N(d.payN), "pays", "all")}</div>` },
{ id: "funnel", title: "Funnel", render: d => { const max = Math.max(1, d.funnel[0][1]);
    return `${head("Funnel, all time", "", true)}<div class="fun">${d.funnel.map(([label, v, c], i) => dB("funnel", i, `<span class="fl"><span>${label}</span><b>${N(v)}</b></span><span class="fb"><i class="${c}" data-v="w:${clamp(Math.sqrt(v / max) * 100, v ? 5 : 0, 100).toFixed(1)}%;k:${i}"></i></span>${i ? `<span class="fs">${d.funnel[i - 1][1] ? (v / d.funnel[i - 1][1] * 100).toFixed(1) : "—"}% of the step before</span>` : ""}`, "fr", `${label}: ${nf0.format(v)}. Open them.`)).join("")}</div>`; } },
{ id: "away", title: "Away leads", render: d => `${head("Away / auto-replies", "last 7 days")}${big("away", "", `${N(d.away.length)}<small>leads away</small>`, "Open every lead that is away")}
    <div class="stack sp">${d.away.slice(0, 3).map(r => leadBtn(r.lead_email, `<span class="it c-grey"><svg><use href="#i-moon"/></svg></span><span class="row-main"><b>${esc(cut(r.lead_email, 30))}</b><small>${esc(cut(r.snippet, 46))}</small></span>`)).join("") || empty("No auto-replies this week.")}</div>
    <p class="sub">${dB("replies", "waiting", `${N(d.realWaiting)} real replies`, "lk")} still unanswered in the last 14 days.</p>` },
{ id: "today", title: "Today", render: d => { const I = { call: ["phone", "c-blue"], payment_failed: ["alert", "c-red"], action: ["check", "c-green"], partner: ["flag", "c-orange"] }, list = STATE.todayAll ? d.todayItems : d.todayItems.slice(0, 5);
    return `${head("Today", dB("todaylist", "", `${d.todayItems.filter(x => x.kind === "call").length} calls · ${d.todayItems.length} items`, "lk"), true)}<div class="stack">${list.map(x => { const [icon, c] = I[x.kind] || ["clock", "c-grey"]; const inner = `<span class="it ${c}"><svg><use href="#i-${icon}"/></svg></span><span class="row-main"><b>${esc(cut(x.title, 60))}</b><small>${esc(cut(x.detail || x.kind, 60))}</small></span>${x.kind === "call" && x.at ? `<span class="row-end">${timeOf(x.at)}</span>` : ""}`;
      return x.lead_email ? leadBtn(x.lead_email, inner) : dB("item", x.id, inner, "tile row"); }).join("") || empty("Nothing on the list for today.")}</div>
    ${d.todayItems.length > 5 ? `<button type="button" class="more" data-act="todayall">${STATE.todayAll ? "Show fewer" : `Show all ${d.todayItems.length}`}</button>` : ""}`; } },
{ id: "inboxes", title: "Inboxes", render: d => `${dB("inboxes", "", `<span class="av">@</span><span class="row-main"><b>${d.inb.n} inboxes active</b><small>${d.inb.total} connected · warm-up ${d.inb.warm == null ? "—" : Math.round(d.inb.warm)}</small></span>`, "row np", "Open every inbox")}
    ${kv("Sent today", `${N(d.inb.sent)} / ${nf0.format(d.inb.cap)}`, "inboxes", "", "sp")}
    <div class="wk mini ib">${d.inbList.map((i, k) => `<button type="button" class="${i.status === 1 ? "" : "off"}" data-act="drill" data-k="inbox" data-a="${esc(i.email)}" data-v="h:${(i.daily_limit ? clamp((i.sent_today || 0) / i.daily_limit * 100, 0, 100) : 0).toFixed(1)}%;k:${k / 2}" title="${esc(i.email)}: ${i.sent_today || 0} of ${i.daily_limit || 0} sent today" aria-label="${esc(i.email)}: ${i.sent_today || 0} of ${i.daily_limit || 0} sent today. Open this inbox."></button>`).join("")}</div>
    <p class="sub">One bar per inbox, filled to today's limit. ${dB("inboxes", "", `Capacity ${N(d.inb.cap)} a day`, "lk")} · ${dB("deliv", "", `${N(d.bounced)} bounced`, "lk")} all time.</p>` },
{ id: "videos", title: "Videos delivered", render: d => { const max = Math.max(1, ...d.vid.weeks.map(w => w.n));
    return `${head("Videos delivered", dB("vids", d.ym, `${d.monthName} ${d.vid.month}`, "lk"))}${big("vids", "all", N(d.vid.total), "Open the delivered videos")}
    <div class="wk mini">${d.vid.weeks.map((w, i) => `<button type="button" class="${i === 7 ? "on" : ""}" data-act="drill" data-k="vids" data-a="${w.s}" data-v="h:${(w.n / max * 100).toFixed(1)}%;k:${i}" title="Week of ${dLabel(w.s)}: ${w.n} videos" aria-label="Week of ${dLabel(w.s)}: ${w.n} videos. Open them."></button>`).join("")}</div><p class="sub">Per week, last 8 weeks.</p>`; } },
{ id: "search", cls: "bare", title: "Search leads", mount(el) { el.innerHTML = `<div class="tile"><label class="search">${ic("search")}<input id="q" type="search" placeholder="Search leads" autocomplete="off" spellcheck="false" aria-label="Search leads" aria-controls="res"><span class="kbd" aria-hidden="true">/</span></label><div class="res" id="res" role="listbox" aria-label="Results"></div></div>`; }, update() { renderSearch(); } },
{ id: "theme", title: "Theme", mount(el) { el.innerHTML = `<div class="center"><button type="button" class="thb" data-act="theme" tabindex="-1" aria-hidden="true">${ic("sun")}<b>Light theme</b></button><button type="button" class="sw" role="switch" id="sw-theme" data-act="theme" aria-checked="false" aria-label="Light theme"></button><span class="sub">BEJÚ dark is the default.</span></div>`; }, update() { $("#sw-theme").setAttribute("aria-checked", document.documentElement.dataset.theme !== "dark"); } },
{ id: "portal", title: "Client portal numbers", render: d => `${head("Client portal", `<button type="button" class="chip ${d.pOpen ? "o" : ""}" data-act="jump" data-id="psamples" title="Jump to the portal queues">${d.pOpen} open</button>`)}<button type="button" class="big tapn" data-act="jump" data-id="pclients" title="Jump to the portal sign-ups">${N(d.portal.signups)}<small>sign-ups</small></button>
    <div class="stack sp"><button type="button" class="kv" data-act="jump" data-id="psamples"><span>Sample requests</span><span>${N(d.portal.req)}${d.portal.reqOpen ? ` · ${d.portal.reqOpen} new` : ""}</span></button><button type="button" class="kv" data-act="jump" data-id="pvideos"><span>Videos in edit</span><span>${N(d.portal.edit)}</span></button><button type="button" class="kv" data-act="jump" data-id="pvideos"><span>Videos ready</span><span>${N(d.portal.ready)}</span></button></div>` },
{ id: "sync", title: "Sync status", render: d => `<div class="stack">${d.sync.map(s => dB("sync", s.name, `<span class="it ${s.ok ? "c-ink" : "c-red"}"><svg><use href="#i-${s.ok ? "check" : "alert"}"/></svg></span><span class="row-main"><b>${esc({ instantly: "Sending", replies: "Replies", sheet: "Samples" }[s.name] || s.name)}</b><small>${esc(cut(/^\{/.test(s.detail || "") ? "synced" : s.detail, 40))}</small></span><span class="row-end"><small>${ago(s.ran_at)}</small></span>`, "tile row")).join("") || empty("No sync info.")}</div>` },
{ id: "export", title: "Export", mount(el) { el.innerHTML = `<button type="button" class="export mag" id="export" data-act="export"><i></i><span id="export-t"><svg><use href="#i-down"/></svg>Export leads CSV</span></button>`; }, update() {} },
/* ---- client portal zone (second grid) ---- */
{ id: "psamples", grid: 2, title: "Portal: sample requests", focus: ["psamples", ""], render: d => `${head("Free sample requests", dB("psamples", "", d.pSamples.length, `chip ${d.pSamples.some(s => s.status === "requested") ? "o" : ""}`, "Open every sample request"), true)}<div class="stack">${d.pSamples.slice(0, 3).map(sampleTile).join("") || empty("No sample request yet. New ones land here the moment a client asks.")}</div>${d.pSamples.length > 3 ? dB("psamples", "", `Show all ${d.pSamples.length}`, "more") : ""}` },
{ id: "pvideos", grid: 2, cls: "w2", title: "Portal: video requests", focus: ["pvideos", ""], render: d => `${head("Video requests", dB("pvideos", "", d.pVideos.length, `chip ${d.pVideos.some(v => /^(received|revision)$/.test(v.status)) ? "o" : ""}`, "Open every video request"), true)}<div class="stack two">${d.pVideos.slice(0, 4).map(videoTile).join("") || empty("No video request yet. Paid clients send footage links from their portal and they show up here.")}</div>${d.pVideos.length > 4 ? dB("pvideos", "", `Show all ${d.pVideos.length}`, "more") : ""}` },
{ id: "pnotes", grid: 2, title: "Portal: change requests", focus: ["pnotes", ""], render: d => `${head("Change requests", dB("pnotes", "", sum(d.pNotes, g => g.notes.length), `chip ${d.pNotes.length ? "r" : ""}`, "Open every change request"), true)}<div class="stack">${d.pNotes.slice(0, 3).map(noteTile).join("") || empty("No open change request.")}</div>${d.pNotes.length > 3 ? dB("pnotes", "", `Show all ${d.pNotes.length}`, "more") : ""}` },
{ id: "pclients", grid: 2, title: "Portal: sign-ups", focus: ["pclients", ""], render: d => `${head("Sign-ups", dB("pclients", "", d.pClients.length, "chip", "Open every sign-up"), true)}<div class="stack">${d.pClients.slice(0, 3).map(clientTile).join("") || empty("No client has signed up yet.")}</div>${d.pClients.length > 3 ? dB("pclients", "", `Show all ${d.pClients.length}`, "more") : ""}` },
];
const byId = id => CARDS.find(c => c.id === id);
/* phone: five tabs, each shows only its cards (the desktop keeps the whole bento) */
const TABS = { home: ["next", "attention", "hot", "activity", "today", "followups"], money: ["money", "goal", "revchart", "buyers", "topc", "alltime"], leads: ["moods", "samples", "turn", "speed", "clock", "score", "away", "funnel", "search", "export"],
  outreach: ["outreach", "newleads", "total", "week", "heat", "rate", "camps", "deliv", "inboxes", "sync"], clients: ["portal", "psamples", "pvideos", "pnotes", "pclients", "videos"], none: ["brand", "owner", "theme"] };
const TABOF = {}; Object.entries(TABS).forEach(([t, ids]) => ids.forEach(id => { TABOF[id] = t; }));

/* ---------------- chart painters (hover, tap and arrow keys share them) ---------------- */
function paintOut(days, max, H, pad, i) {
  const box = $("#chart"); if (!box) return; const n = days.length, d = days[i];
  const x = n < 2 ? 50 : i / (n - 1) * 100, yy = v => (H - pad - v / max * (H - pad * 2)) / H * 100;
  $$(".cur,.cdot,.tip", box).forEach(el => el.style.setProperty("--x", x + "%"));
  const a = $(".cdot.a", box), b = $(".cdot.b", box); a.style.setProperty("--y", yy(d.sent) + "%"); b.style.setProperty("--y", yy(d.nw) + "%"); a.hidden = !STATE.sa; b.hidden = !STATE.sb;
  const tip = $(".tip", box); tip.style.setProperty("--tx", x < 22 ? "-8%" : x > 78 ? "-92%" : "-50%");
  tip.innerHTML = `<span class="tl">${dLong(d.day)}${d.day === today() ? " · so far" : ""}</span><b>${nf0.format(d.sent)} sent</b><div class="tr"><span><i class="dot round c-orange"></i>New leads</span><em>${nf0.format(d.nw)}</em></div><div class="tr"><span><i class="dot round c-blue"></i>Real replies</span><em>${nf0.format(d.rep)}</em></div><div class="tr"><span><i class="dot round c-green"></i>Positive</span><em>${nf0.format(d.opp)}</em></div><span class="tl">${HOVER ? "click" : "tap again"} to open the day</span>`;
}
function paintRev(d, ymax, H, pad, i) {
  const box = $("#rev"); if (!box) return; const day = i + 1, has = day <= d.dom, cum = has ? d.cum[i] : null, pace = GOAL * day / d.dim, proj = !has && d.dim > d.dom ? d.month + (d.projected - d.month) * (day - d.dom) / (d.dim - d.dom) : null;
  const x = day / d.dim * 100, v = has ? cum : proj ?? 0, y = (H - pad - v / ymax * (H - pad * 2)) / H * 100, dd = `${d.ym}-${String(day).padStart(2, "0")}`, got = has ? sum(d.pays.filter(p => p.day === dd), p => p.amount) : 0;
  $$(".cur,.cdot,.tip", box).forEach(el => el.style.setProperty("--x", x + "%")); $(".cdot", box).style.setProperty("--y", y + "%");
  const tip = $(".tip", box); tip.style.setProperty("--tx", x < 22 ? "-8%" : x > 78 ? "-92%" : "-50%");
  tip.innerHTML = `<span class="tl">${dLong(dd)}</span><b>${has ? usd(cum) + " so far" : usd(proj) + " projected"}</b>${has ? `<div class="tr"><span>Paid that day</span><em>${usd(got)}</em></div>` : ""}<div class="tr"><span>Goal pace</span><em>${usd(pace)}</em></div><div class="tr"><span>${has ? "Behind pace" : "Gap at this pace"}</span><em>${usd(Math.max(0, pace - v))}</em></div>${has ? `<span class="tl">${HOVER ? "click" : "tap again"} to open the payments</span>` : ""}`;
}

/* ---------------- hero band ---------------- */
const HERO = {};
function setOdo(el, str) {
  const sig = str.replace(/\d/g, "0");
  if (el.dataset.sig !== sig) { el.dataset.sig = sig; el.innerHTML = [...str].map(ch => /\d/.test(ch) ? `<span class="od"><span class="os">${"0123456789".split("").map(x => `<span>${x}</span>`).join("")}</span></span>` : `<span class="oc${ch === "$" ? " u" : ""}">${ch}</span>`).join(""); }
  const cols = $$(".od", el), digits = str.replace(/\D/g, ""), go = () => cols.forEach((c, i) => c.style.setProperty("--d", digits[i]));
  RM ? go() : requestAnimationFrame(() => requestAnimationFrame(go));
}
function mountHero() {
  const k = f => { const v = GOAL * f; return v >= 1000 ? `$${+(v / 1000).toFixed(1)}k` : usd(v); };
  $("#hero").innerHTML = `<div class="hero-top"><div><div class="hero-h"><button type="button" class="hero-t" data-act="drill" data-k="goal" data-a="" title="Open the maths">Road to <b>${usd(GOAL)}</b> a <em class="sf">month</em></button><span class="seg per" role="group" aria-label="Period for the numbers on this page">${Object.keys(PER).map(p => `<button type="button" data-act="period" data-p="${p}">${p === "month" ? "Month" : p === "today" ? "Today" : p}</button>`).join("")}</span></div>
      <button type="button" class="odo tapn" id="odo" data-act="drill" data-k="pays" data-a="month" aria-label="Money this month. Open the payments."></button>
      <button type="button" class="hero-sub" id="hero-sub" data-act="drill" data-k="goal" data-a="" title="Open the maths"></button></div>
    <div><div class="hero-facts" id="hero-facts"></div><div class="kpis" id="kpis"></div></div></div>
    <button type="button" class="trk-w" data-act="drill" data-k="goal" data-a="" aria-label="Progress to the monthly goal. Open the maths."><span class="trk" id="trk"><i class="fill"></i><i class="pace"></i><i class="head"></i></span><span class="tk t25">${k(.25)}</span><span class="tk t50">${k(.5)}</span><span class="tk t75">${k(.75)}</span><span class="tk t100">${k(1)}</span><span class="tk pc" id="trk-pc">where today's pace is</span></button>
    <div class="ticker" id="ticker" role="group" aria-label="Latest activity"><div class="ticker-t" id="ticker-t"></div></div>`;
  Object.keys(HERO).forEach(x => delete HERO[x]);
}
function part(id, html, cardKey) { if (HERO[id] === html) return; HERO[id] = html; const el = $("#" + id); el.innerHTML = html; if (cardKey) countUp({ id: cardKey, el }); }
function updateHero(d) {
  const P = d.per, mp = d.dom / d.dim * 100, w = clamp(d.goalPct, 0, 100).toFixed(2) + "%";
  setOdo($("#odo"), usd(d.month));
  part("hero-sub", `${d.monthName} so far: <span class="mono">${d.goalPct < 10 ? d.goalPct.toFixed(1) : Math.round(d.goalPct)}%</span> of the goal with <span class="mono">${Math.round(mp)}%</span> of the month gone. ${d.month >= GOAL * d.dom / d.dim ? "Ahead of pace." : `<span class="mono">${usd(GOAL * d.dom / d.dim - d.month)}</span> behind pace.`}`);
  part("hero-facts", `${dB("goal", "", `<span>Needed per day</span><b>${N(d.perDay, "usd")}</b>`, "hf")}${dB("goal", "", `<span>On pace for</span><b>${N(d.projected, "usd")}</b>`, "hf")}${dB("goal", "", `<span>Days left</span><b>${N(d.daysLeft)}</b>`, "hf")}`, "hero-facts");
  const isT = P.key === "today", nl = isT ? `${N(d.todayNew)}<small>/ ${nf0.format(d.target)}</small>` : N(P.nw) + dl(P.dNw);
  part("kpis", `${dB("pays", "period", `<span><i class="c-green"></i>Money · ${P.chip}</span><b>${N(P.rev, "usd")}${dl(P.delta)}</b>`, "kpi")}${dB(isT ? "day" : "days", isT ? d.t : "", `<span><i class="c-blue"></i>New leads · ${P.chip}</span><b>${nl}</b>`, "kpi")}${dB("replies", "real", `<span><i class="c-blue2"></i>Real replies · ${P.chip}</span><b>${N(P.rep)}${dl(P.dRep)}</b>`, "kpi")}${dB("samples", "period", `<span><i class="c-orange"></i>Samples · ${P.chip}</span><b>${N(P.samples)}${dl(P.dSamples)}</b>`, "kpi")}${dB("hotlist", "", `<span><i class="c-red"></i>Hot leads now</span><b>${N(d.hot.length)}</b>`, "kpi")}${dB("att", "reply", `<span><i class="c-purple"></i>Replies waiting</span><b>${N((d.att.reply || []).length)}</b>`, "kpi")}`, "hero-kpis");
  const trk = $("#trk"); $(".fill", trk).style.setProperty("--w", w); $(".head", trk).style.setProperty("--w", w); $(".pace", trk).style.setProperty("--x", mp + "%"); $("#trk-pc").style.setProperty("--x", clamp(mp, 12, 88) + "%");
  const tk = hid => d.feed.slice(0, 12).map(e => `<button type="button" ${hid ? 'tabindex="-1" aria-hidden="true" ' : ""}${e.email ? `data-act="lead" data-email="${esc(e.email)}"` : `data-act="drill" data-k="${e.k}" data-a="${esc(e.a)}"`}><i class="${e.c}"></i>${esc(cut(e.title, 52))}<em>${e.dateOnly ? dLabel(dayOf(e.t)) : rel(e.t)}</em></button>`).join(""), items = tk(false);
  if (HERO.tick !== items) { HERO.tick = items; const t = $("#ticker-t"); t.innerHTML = items + tk(true); t.style.setProperty("--dur", Math.max(30, d.feed.slice(0, 12).length * 6) + "s"); }
  $$("#hero .per button").forEach(b => { const on = b.dataset.p === STATE.period; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
}

/* ---------------- render ---------------- */
function build() {
  const g1 = $("#grid"), g2 = $("#grid2"); g1.innerHTML = g2.innerHTML = "";
  const ro = new ResizeObserver(es => es.forEach(e => fit(e.target)));
  CARDS.forEach((c, i) => {
    const el = document.createElement("section"); el.id = "c-" + c.id; el.className = "card " + (c.cls || ""); el.dataset.tab = TABOF[c.id] || "home"; el.style.setProperty("--i", c.grid === 2 ? i - 30 : i); el.setAttribute("aria-label", c.title || c.id);
    c.el = el; c.last = null; if (c.mount) c.mount(el); (c.grid === 2 ? g2 : g1).appendChild(el); ro.observe(el);
  });
}
function fit(el) { el.style.gridRowEnd = "span " + Math.ceil((el.offsetHeight + 16) / 4); }
function renderAll(fromData) {
  D = derive();
  CARDS.forEach(c => {
    if (c.render) { const html = c.render(D); if (html !== c.last) { c.last = html; c.el.innerHTML = html; if (c.focus) { const h = $(".ch", c.el); if (h) h.insertAdjacentHTML("beforeend", `<button type="button" class="xp" data-act="drill" data-k="${c.focus[0]}" data-a="${c.focus[1]}" aria-label="Expand ${esc(c.title)}" title="Expand">${ic("expand")}</button>`); } countUp(c); applyVars(c.el);
        const sig = $$(".n[data-n]", c.el).map(x => x.dataset.n).join("|"); if (fromData && c.sig !== undefined && c.sig !== sig && !RM) { c.el.classList.remove("chg"); void c.el.offsetWidth; c.el.classList.add("chg"); } c.sig = sig; } }
    if (c.update) c.update(D);
  });
  updateHero(D); paintStatus(); syncChrome(); Object.values(PLOT).forEach(p => { try { p.paint(clamp(p.i, 0, p.n - 1)); } catch {} }); refreshDrill();
  $("#zone-sub").textContent = D.pOpen ? `${D.pOpen} open request${D.pOpen === 1 ? "" : "s"} · what you do here shows in the client's portal at once` : "What you do here shows in the client's portal at once.";
}
function renderSearch() {
  const box = $("#res"); if (!box || !RAW) return;
  const q = STATE.q.trim().toLowerCase();
  if (!q) { box.innerHTML = ""; return; }
  const hits = RAW.pipeline.filter(p => [p.name, p.show, p.email].some(v => (v || "").toLowerCase().includes(q))).slice(0, 6);
  STATE.sel = clamp(STATE.sel, 0, Math.max(0, hits.length - 1));
  box.innerHTML = hits.map((p, i) => `<button type="button" role="option" aria-selected="${i === STATE.sel}" class="${i === STATE.sel ? "sel" : ""}" data-act="lead" data-email="${esc(p.email)}"><span>${esc(p.name || p.email)} <span class="mut">· ${esc(cut(p.show || p.email, 26))}</span></span><span>${esc(MOOD_LABEL[mood(p)])}</span></button>`).join("") || empty(`No lead matches “${esc(cut(STATE.q, 30))}”.`);
}
function paintStatus() {
  const t = $("#stat-t"); if (!t || !D) return;
  t.textContent = RT === "live" ? "Live" : "Polling"; $("#stat-s").textContent = D.syncAt ? `synced ${ago(D.syncAt)}` : "";
  $("#stat").title = RT === "live" ? "Live: changes arrive the moment they happen. A full refresh also runs every minute." : "Polling: the page refreshes every minute. The live connection is not up.";
  $("#stat-p").classList.toggle("off", RT !== "live" || !D.syncOk);
}
function jump(id) {
  const el = $("#c-" + id); if (!el) return;
  if (PHONE.matches) { if (el.dataset.tab === "none") return; setTab(el.dataset.tab, true); }
  el.scrollIntoView({ block: "center", behavior: RM ? "auto" : "smooth" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  const f = $("button,input,[tabindex]", el); if (f) f.focus({ preventScroll: true });
}
function syncChrome() {   // header owner switch + tab badges
  $$("#top-owner button").forEach(b => { const on = b.dataset.o === STATE.owner; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
  const bd = { home: D.nextN, clients: D.pOpen, leads: D.realWaiting }; $$("#tabs button").forEach(b => { const n = bd[b.dataset.t] || 0, i = $("i", b); i.hidden = !n; i.textContent = n > 99 ? "99+" : n; });
}
function setTab(t, quiet) {
  if (!TABS[t] || t === "none") t = "home"; STATE.tab = t; document.documentElement.dataset.tab = t; store.set("beju-crm-tab", t);
  $$("#tabs button").forEach(b => { const on = b.dataset.t === t; b.classList.toggle("on", on); b.setAttribute("aria-current", on ? "page" : "false"); });
  if (!quiet) scrollTo(0, 0);
  requestAnimationFrame(() => { CARDS.forEach(c => { if (c.el) fit(c.el); }); Object.values(PLOT).forEach(p => { try { p.paint(clamp(p.i, 0, p.n - 1)); } catch {} }); });
}
function setPeriod(p) { STATE.period = p; STATE.range = p === "30d" ? 30 : p === "month" ? clamp(+today().slice(8, 10), 7, 30) : 7; renderAll(); }

/* ---------------- drill-downs: every number, mark and row opens the list behind it ---------------- */
const tbl = (heads, rows) => `<div class="tblw"><table class="tbl"><thead><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const stackOf = (rows, none) => rows.length ? `<div class="stack">${rows.join("")}</div>` : empty(none || "Nothing here.");
const grp = (label, right = "") => `<div class="grp"><span>${label}</span><b>${right}</b></div>`;
const facts = arr => `<div class="hero-facts mfacts">${arr.map(([l, v]) => `<div class="hf"><span>${l}</span><b>${v}</b></div>`).join("")}</div>`;
const campBy = () => Object.fromEntries(RAW.camps.map(c => [c.campaign_id, c]));
const cname = (cb, id) => esc(campName((cb[id] || {}).name || id));
const payRow = p => dB("client", payKey(p), `<span class="av">${esc(initials({ name: p.payer_name, email: p.email }))}</span><span class="row-main"><b>${esc(cut(p.payer_name || p.email || "Payment", 40))}</b><span class="tagline">${cvChip(D.cn(D.emailsOf(p)))}<small>${esc(PACK[p.package] || p.package || "Custom")} · ${esc(p.email || "no email")}</small></span></span><span class="row-end up">+${usd(p.amount)}<small>${dLabel(p.day)}</small></span>`, "tile row");
const replyRow = r => leadBtn(r.lead_email, `<span class="it ${r.kind === "AUTO" ? "c-grey" : r.answered ? "c-green" : "c-blue"}"><svg><use href="#i-${r.kind === "AUTO" ? "moon" : "mail"}"/></svg></span><span class="row-main"><b>${esc(nameOf(r.lead_email))}</b><small>${esc(cut(r.snippet, 110))}</small></span><span class="row-end"><small>${fDT(r.received_at)}</small><small>${r.blocklisted ? "blocklisted" : r.answered ? "answered" : r.kind === "AUTO" ? "auto" : "waiting"}</small></span>`);
const leadList = (list, sub) => stackOf(list.map(p => lrow(p, sub ? sub(p) : [p.show, p.next_action].filter(Boolean).join(" · "), `<span class="row-end">${isBuyer(p) || (p.status || "").toUpperCase() === "HOT" ? cvChip(D.tc[lc(p.email)] || 0) : `<small>${esc(MOOD_LABEL[mood(p)])}</small>`}${p.owner ? `<small>${esc(p.owner)}</small>` : ""}</span>`)), "No leads in this list.");
const DR = {
  day(a) { const day = a || D.t, cb = campBy(), rows = RAW.daily.filter(r => r.day === day).sort((x, y) => (y.sent || 0) - (x.sent || 0)), T = k => nf0.format(sum(rows, r => r[k])), adds = RAW.leadAdds.filter(x => x.day === day);
    return { title: `${dLong(day)}${day === D.t ? " · so far" : ""}`, sub: "What was sent that day, per campaign", html: `${rows.length ? tbl(["Campaign", "Sent", "New leads", "Replies", "Positive"], rows.map(r => `<tr><td>${dB("camp", r.campaign_id, cname(cb, r.campaign_id), "lk")}</td><td>${nf0.format(r.sent || 0)}</td><td>${nf0.format(r.new_leads || 0)}</td><td>${nf0.format(r.replies || 0)}</td><td>${nf0.format(r.opportunities || 0)}</td></tr>`).concat(`<tr class="tot"><td>Total</td><td>${T("sent")}</td><td>${T("new_leads")}</td><td>${T("replies")}</td><td>${T("opportunities")}</td></tr>`)) : empty("Nothing was sent on this day, or the sending sync has not run yet.")}
      ${adds.length ? grp("Leads loaded that day", nf0.format(sum(adds, x => x.n))) + `<p class="sub">${adds.map(x => `${esc(x.tab)} ${+x.n}`).join(" · ")}</p>` : ""}
      <div class="acts sp">${dB("day", addDays(day, -1), `← ${dLabel(addDays(day, -1))}`, "act")}${day < D.t ? dB("day", addDays(day, 1), `${dLabel(addDays(day, 1))} →`, "act") : ""}${dB("days", "", "All 30 days", "act")}</div>` }; },
  days() { const s = D.series.slice(-30).reverse(), max = Math.max(1, ...s.map(x => x.sent));
    return { title: "Last 30 days", sub: "Click a day for its campaigns", html: tbl(["Day", "Sent", "New leads", "Replies", "Positive"], s.map(x => `<tr><td>${dB("day", x.day, dLong(x.day), "lk")}<i class="mb" data-v="w:${(x.sent / max * 100).toFixed(1)}%"></i></td><td>${nf0.format(x.sent)}</td><td>${nf0.format(x.nw)}</td><td>${nf0.format(x.rep)}</td><td>${nf0.format(x.opp)}</td></tr>`)) }; },
  sent(a) { const rr = c => c.new_contacted ? (c.replies || 0) / c.new_contacted * 100 : -1, list = [...RAW.camps].sort(a === "rate" ? (x, y) => rr(y) - rr(x) : (x, y) => (y.emails_sent || 0) - (x.emails_sent || 0));
    return { title: a === "rate" ? "Reply rate per campaign" : "Sent in total, per campaign", sub: `${nf0.format(D.sentAll)} emails · ${nf0.format(D.contacted)} leads contacted · click a campaign`, html: tbl(["Campaign", "Sent", "Contacted", "Queued", "Reply %", "Positive"], list.map(c => `<tr><td>${dB("camp", c.campaign_id, esc(campName(c.name)), "lk")}</td><td>${nf0.format(c.emails_sent || 0)}</td><td>${nf0.format(c.new_contacted || 0)}</td><td>${nf0.format(c.uncontacted || 0)}</td><td>${rr(c) < 0 ? "—" : rr(c).toFixed(1) + "%"}</td><td>${nf0.format(c.opportunities || 0)}</td></tr>`)) }; },
  queued() { const list = [...RAW.camps].filter(c => c.uncontacted).sort((x, y) => y.uncontacted - x.uncontacted);
    return { title: "Leads still queued", sub: `${nf0.format(D.queued)} loaded leads not contacted yet`, html: list.length ? tbl(["Campaign", "Queued", "Daily cap", "Days of sends"], list.map(c => `<tr><td>${dB("camp", c.campaign_id, esc(campName(c.name)), "lk")}</td><td>${nf0.format(c.uncontacted)}</td><td>${c.daily_max_leads ? nf0.format(c.daily_max_leads) : "—"}</td><td>${c.daily_max_leads ? (c.uncontacted / c.daily_max_leads).toFixed(1) : "—"}</td></tr>`)) : empty("No lead is queued. Push new leads today.") }; },
  camp(id) { const c = RAW.camps.find(x => x.campaign_id === id) || { name: id }, rows = RAW.daily.filter(r => r.campaign_id === id), by = Object.fromEntries(rows.map(r => [r.day, r])), s = []; for (let i = 29; i >= 0; i--) { const day = addDays(D.t, -i); s.push({ day, ...(by[day] || {}) }); }
    const max = Math.max(1, ...s.map(x => x.sent || 0)), rr = c.new_contacted ? (c.replies || 0) / c.new_contacted * 100 : null;
    return { title: campName(c.name) || "Campaign", sub: c.name || "", html: `${facts([["Sent", nf0.format(c.emails_sent || 0)], ["Reply rate", rr == null ? "—" : rr.toFixed(1) + "%"], ["Positive", nf0.format(c.opportunities || 0)]])}${facts([["Contacted", nf0.format(c.new_contacted || 0)], ["Queued", nf0.format(c.uncontacted || 0)], ["Bounced", nf0.format(c.bounced || 0)]])}
      ${grp("Sent per day, last 30 days", `${c.inboxes || 0} inboxes · cap ${c.daily_max_leads || "—"}/day`)}<div class="wk">${s.map((x, i) => `<button type="button" class="${i === 29 ? "on" : ""}" data-act="drill" data-k="day" data-a="${x.day}" data-v="h:${((x.sent || 0) / max * 100).toFixed(1)}%;k:${i / 3}" title="${dLong(x.day)}: ${x.sent || 0} sent, ${x.new_leads || 0} new" aria-label="${dLong(x.day)}: ${x.sent || 0} sent. Open the day."></button>`).join("")}</div>
      ${tbl(["Day", "Sent", "New leads", "Replies", "Positive"], s.slice(-14).reverse().map(x => `<tr><td>${dB("day", x.day, dLong(x.day), "lk")}</td><td>${nf0.format(x.sent || 0)}</td><td>${nf0.format(x.new_leads || 0)}</td><td>${nf0.format(x.replies || 0)}</td><td>${nf0.format(x.opportunities || 0)}</td></tr>`))}` }; },
  samples(a) { let list = [...D.delivered].sort((x, y) => +new Date(y.delivered_at) - +new Date(x.delivered_at)), title = "Samples delivered";
    if (a === "week") { list = list.filter(p => dayOf(p.delivered_at) >= D.wk); title = "Samples delivered this week"; } else if (a === "buyers") { list = list.filter(isBuyer); title = "Samples that became buyers"; }
    else if (a === "wip") { list = D.pipe.filter(p => /^(YES|CLAIMED|BUILT)$/i.test(p.status || "")); title = "Samples in edit"; } else if (a === "recent") { list = list.filter(p => dayOf(p.delivered_at) >= addDays(D.t, -30)); title = "Samples of the last 30 days"; }
    else if (a === "period") { list = list.filter(p => dayOf(p.delivered_at) >= D.per.start); title = `Samples delivered, ${D.per.label}`; }
    else if (/^w:/.test(a)) { const s0 = a.slice(2); list = list.filter(p => dayOf(p.delivered_at) >= s0 && dayOf(p.delivered_at) < addDays(s0, 7)); title = `Samples delivered, week of ${dLabel(s0)}`; }
    return { title, sub: `${list.length} lead${list.length === 1 ? "" : "s"}${STATE.owner === "All" ? "" : " · " + STATE.owner}`, html: leadList(list, p => `${p.delivered_at ? "delivered " + fDT(p.delivered_at) : "said yes " + fDT(p.yes_at)}${p.yes_at && p.delivered_at ? ` · ${((new Date(p.delivered_at) - new Date(p.yes_at)) / 36e5).toFixed(1)} h after the yes` : ""}`) }; },
  away() { return { title: "Leads away", sub: "Auto-replies of the last 7 days, not answered", html: stackOf(D.away.map(replyRow), "No auto-replies this week.") }; },
  replies(a) { const list = a === "waiting" ? D.realOpen : RAW.replies.filter(r => r.kind === "REAL"); return { title: a === "waiting" ? "Real replies still waiting" : "Real replies, last 60 days", sub: `${list.length} repl${list.length === 1 ? "y" : "ies"}`, html: stackOf(list.slice(0, 150).map(replyRow), "No replies in this list.") }; },
  hour(h) { h = +h; const list = RAW.replies.filter(r => r.kind === "REAL" && hourOf(r.received_at) === h); return { title: `Replies around ${String(h).padStart(2, "0")}:00`, sub: `${list.length} real repl${list.length === 1 ? "y" : "ies"} in the last 60 days, ${TZ} time`, html: stackOf(list.map(replyRow), "No reply came in at this hour.") + `<div class="acts sp">${dB("hour", (h + 23) % 24, `← ${String((h + 23) % 24).padStart(2, "0")}:00`, "act")}${dB("hour", (h + 1) % 24, `${String((h + 1) % 24).padStart(2, "0")}:00 →`, "act")}</div>` }; },
  pays(a) { let list = D.pays, title = "Every payment";
    if (a === "period") { list = list.filter(p => p.day >= D.per.start); title = `Payments, ${D.per.label}`; } else if (a === "month") { list = list.filter(p => p.day.slice(0, 7) === D.ym); title = `Payments in ${D.monthName}`; }
    else if (/^\d{4}-\d\d$/.test(a)) { list = list.filter(p => p.day.slice(0, 7) === a); title = `Payments in ${MON[+a.slice(5) - 1]} ${a.slice(0, 4)}`; } else if (/^\d{4}-\d\d-\d\d$/.test(a)) { list = list.filter(p => p.day === a); title = `Payments on ${dLong(a)}`; }
    const months = {}; list.forEach(p => { (months[p.day.slice(0, 7)] || (months[p.day.slice(0, 7)] = [])).push(p); });
    return { title, sub: `${list.length} payment${list.length === 1 ? "" : "s"} · ${usd(sum(list, p => p.amount))} · click one for the client`, html: list.length ? Object.entries(months).map(([m, ps]) => grp(`${MON[+m.slice(5) - 1]} ${m.slice(0, 4)}`, usd(sum(ps, p => p.amount))) + `<div class="stack">${ps.map(payRow).join("")}</div>`).join("") : empty("No payment in this period yet.") }; },
  goal() { const paceNow = GOAL * D.dom / D.dim, mp = D.pays.filter(p => p.day.slice(0, 7) === D.ym);
    return { title: `Road to ${usd(GOAL)} a month`, sub: `${D.monthName}: day ${D.dom} of ${D.dim}`, html: `${facts([["So far", usd(D.month)], ["Goal", usd(GOAL)], ["Still to go", usd(Math.max(0, GOAL - D.month))]])}${facts([["Needed per day", usd(D.perDay)], ["Pace needed by today", usd(paceNow)], ["On pace for", usd(D.projected)]])}
      <p class="sub sp">Needed per day = what is left, split over the ${D.daysLeft} days that remain (today included). On pace for = money so far ÷ days gone × days in the month. A ${usd(150)} Starter pack every day adds ${usd(150 * D.daysLeft)}; one ${usd(500)} monthly plan adds ${usd(500)}.</p>
      ${grp(`Payments in ${D.monthName}`, usd(D.month))}${stackOf(mp.map(payRow), "No payment this month yet.")}` }; },
  mood(a) { const list = a === "all" ? D.pipe.filter(p => !isBuyer(p)) : D.pipe.filter(p => mood(p) === a); return { title: a === "all" ? "Warm leads" : a === "buyer" ? "Buyers" : `Mood: ${MOOD_LABEL[a] || a}`, sub: `${list.length} lead${list.length === 1 ? "" : "s"}${STATE.owner === "All" ? "" : " · " + STATE.owner} · click one to open it`, html: leadList([...list].sort((x, y) => +new Date(y.last_reply_at || 0) - +new Date(x.last_reply_at || 0)), p => [p.show, p.last_reply_at ? "last reply " + dLabel(dayOf(p.last_reply_at)) : ""].filter(Boolean).join(" · ")) }; },
  hotlist() { return { title: "Hot leads", sub: `${D.hot.length} lead${D.hot.length === 1 ? "" : "s"} · ordered by ${{ wait: "who waits on us", next: "next action date", reply: "last reply" }[STATE.hotSort]}`, html: stackOf(D.hot.map(({ p, us, tag }) => lrow(p, `${us ? "WAITING ON US · " : ""}${p.next_action || "no next action set"}`, `<span class="row-end"><span class="chip ${tag[1]}">${tag[0]}</span>${cvChip(D.tc[lc(p.email)] || 0)}<small>${p.next_action_at ? "next " + dLabel(dayOf(p.next_action_at)) : p.last_reply_at ? "replied " + dLabel(dayOf(p.last_reply_at)) : ""}</small></span>`)), "No hot leads right now.") }; },
  att(a) { const L = { reply: "Replies waiting", followup: "Follow-ups due", overdue: "Overdue actions", paid_waiting: "Paid, not delivered", promises: "Promises past due", brief: "Said yes, no brief", followup_done: "Finished, park" }, kinds = a === "all" ? Object.keys(D.att) : [a];
    return { title: a === "all" ? "Needs attention" : L[a] || a, sub: "Click a name to open the lead", html: kinds.filter(k => D.att[k]).map(k => grp(L[k] || k, D.att[k].length) + `<div class="stack">${D.att[k].map(x => lrow({ email: x.email, name: x.name }, x.detail || "", x.due ? `<span class="row-end"><small>${fDT(x.due)}</small></span>` : "")).join("")}</div>`).join("") || empty("Nothing waiting. All clear.") }; },
  fu(a) { const list = a === "over" ? D.fuOver : a === "week" ? D.fuDays.flatMap(x => x.list) : (D.fuDays.find(x => x.day === a) || { list: [] }).list;
    return { title: a === "over" ? "Follow-ups overdue" : a === "week" ? "Follow-ups due this week" : `Follow-ups due ${dLong(a)}`, sub: `${list.length} lead${list.length === 1 ? "" : "s"}`, html: stackOf(list.map(f => lrow(f, `touch ${Math.min((f.touches_done || 0) + 1, f.touches_total || 99)} of ${f.touches_total || "?"} · ${(f.fu_stage || "").replace(/_/g, " ")} · ${f.show || ""}`, `<span class="row-end"><small>${dLabel(f.day)}</small>${f.owner ? `<small>${esc(f.owner)}</small>` : ""}</span>`)), "Nobody is due.") }; },
  funnel(i) { i = +i; if (i === 0) return DR.sent(""); if (i === 1) return DR.replies("real"); if (i === 3) { const list = RAW.pipeline.filter(p => p.delivered_at).sort((x, y) => +new Date(y.delivered_at) - +new Date(x.delivered_at)); return { title: "Samples delivered, everyone", sub: `${list.length} leads`, html: leadList(list, p => "delivered " + fDT(p.delivered_at)) }; }
    if (i === 4) { const list = RAW.pipeline.filter(isBuyer); return { title: "Buyers", sub: `${list.length} leads from the samples pipeline bought`, html: leadList(list, p => cut(p.paid || p.show || "", 90)) }; }
    const list = [...RAW.camps].filter(c => c.opportunities).sort((x, y) => y.opportunities - x.opportunities); return { title: "Positive replies per campaign", sub: `${nf0.format(D.oppAll)} positive replies · ${D.posRate == null ? "—" : D.posRate.toFixed(1) + "%"} of the leads contacted`, html: tbl(["Campaign", "Positive", "Real replies", "Contacted", "Positive %"], list.map(c => `<tr><td>${dB("camp", c.campaign_id, esc(campName(c.name)), "lk")}</td><td>${nf0.format(c.opportunities)}</td><td>${nf0.format(c.replies || 0)}</td><td>${nf0.format(c.new_contacted || 0)}</td><td>${c.new_contacted ? (c.opportunities / c.new_contacted * 100).toFixed(1) + "%" : "—"}</td></tr>`)) }; },
  inboxes() { const list = [...RAW.inboxes].sort((x, y) => (y.sent_today || 0) - (x.sent_today || 0)); return { title: "Inboxes", sub: `${D.inb.n} active · ${nf0.format(D.inb.sent)} of ${nf0.format(D.inb.cap)} sent today · click one for its last 14 days`, html: tbl(["Inbox", "Sent today", "Daily limit", "Warm-up", "Status"], list.map(i => `<tr><td>${dB("inbox", i.email, esc(i.email), "lk")}</td><td>${nf0.format(i.sent_today || 0)}</td><td>${nf0.format(i.daily_limit || 0)}</td><td>${i.warmup_score ?? "—"}</td><td>${i.status === 1 ? "active" : "paused"}</td></tr>`)) }; },
  async inbox(email) { const rows = await must(sb.from("inbox_daily").select("day,sent,new_leads,replies,bounced").eq("email", email).gte("day", addDays(D.t, -14)).order("day", { ascending: false })), ib = RAW.inboxes.find(i => i.email === email) || {};
    return { title: email, sub: "One sending inbox, last 14 days", html: `${facts([["Sent today", `${ib.sent_today || 0} / ${ib.daily_limit || 0}`], ["Warm-up", ib.warmup_score ?? "—"], ["Status", ib.status === 1 ? "active" : "paused"]])}${rows.length ? tbl(["Day", "Sent", "New leads", "Replies", "Bounced"], rows.map(r => `<tr><td>${dB("day", r.day, dLong(r.day), "lk")}</td><td>${nf0.format(r.sent || 0)}</td><td>${nf0.format(r.new_leads || 0)}</td><td>${nf0.format(r.replies || 0)}</td><td>${nf0.format(r.bounced || 0)}</td></tr>`)) : empty("No sends recorded for this inbox in the last 14 days.")}<div class="acts sp">${dB("inboxes", "", "← All inboxes", "act")}</div>` }; },
  clients(a) { const list = a === "repeat" ? D.buyersL.filter(g => g.n > 1) : D.buyersL, paidKeys = new Set(D.buyersL.map(g => g.key)), rest = a === "repeat" ? [] : RAW.clients.filter(c => !paidKeys.has("c:" + c.id));
    return { title: a === "repeat" ? "Repeat buyers" : "Clients by money paid", sub: `${D.buyersN} buyers · ${D.repeat == null ? "—" : Math.round(D.repeat) + "%"} bought more than once · average lifetime ${usd(D.ltv)}`, html: stackOf(list.map((g, n) => dB("client", g.key, `<span class="av">${n + 1}</span><span class="row-main"><b>${esc(cut(g.name, 44))}</b><span class="tagline">${cvChip(g.msgs)}<small>${g.n} payment${g.n === 1 ? "" : "s"} · last ${dLabel(g.last)} · ${esc(cut([...g.emails].join(", "), 50))}</small></span></span><span class="row-end up">${usd(g.total)}</span>`, "tile row")), "No buyer in this list.")
      + (rest.length ? grp("On the clients list, no payment matched", rest.length) + `<div class="stack">${rest.map(c => dB("client", "c:" + c.id, `<span class="av">${esc(initials({ name: c.name }))}</span><span class="row-main"><b>${esc(c.name || "Client")}</b><small>${esc(cut((c.emails || []).join(", "), 70))}</small></span>`, "tile row")).join("")}</div>` : "") }; },
  async client(key) { const t = key.slice(0, 1), v = key.slice(2); let cl = null, email = "";
    if (t === "c") cl = RAW.clients.find(c => c.id === v); else if (t === "e") { email = v; cl = RAW.clients.find(c => (c.emails || []).some(e => lc(e) === v)) || null; }
    const emails = new Set([email, ...((cl && cl.emails) || []).map(lc)].filter(Boolean));
    const pays = D.pays.filter(p => (cl && p.client_id === cl.id) || (p.email && emails.has(lc(p.email))) || (t === "p" && String(p.id) === v));
    pays.forEach(p => { if (p.email) emails.add(lc(p.email)); if (!cl && p.client_id) cl = RAW.clients.find(c => c.id === p.client_id) || null; });
    ((cl && cl.emails) || []).forEach(e => emails.add(lc(e)));
    const dels = cl ? RAW.deliveries.filter(x => x.client_id === cl.id).sort((x, y) => String(y.delivered_at || "").localeCompare(String(x.delivered_at || ""))) : [];
    const acct = D.pClients.find(c => emails.has(lc(c.email))), leads = RAW.pipeline.filter(p => emails.has(lc(p.email)));
    const name = (cl && cl.name) || (acct && acct.name) || (pays[0] && pays[0].payer_name) || (leads[0] && leads[0].name) || email || "Client";
    const msgs = await loadConv([...emails]), ig = cl && cl.instagram ? String(cl.instagram).replace(/^https?:\/\/(www\.)?instagram\.com\//i, "@").replace(/\/$/, "") : "";
    return { title: name, sub: [...emails].join(" · ") || "No email on file", html: `${facts([["Paid in total", usd(sum(pays, p => p.amount))], ["Payments", pays.length], ["Videos delivered", dels.length]])}
      ${grp("Conversation", emails.size > 1 ? `${emails.size} addresses merged` : "")}${convBlock(msgs, "m", emails.size ? `No email conversation synced for ${emails.size > 1 ? "these addresses" : "this address"} yet.${ig ? ` Conversation is on Instagram (${ig}).` : ""}` : `No email on file for this client, so no conversation can be matched.${ig ? ` Conversation is on Instagram (${ig}).` : ""}`)}
      ${grp("Client portal account")}${acct ? clientTile(acct) + (acct.vids.length ? `<div class="stack sp">${acct.vids.map(x => videoTile(D.pVideos.find(z => z.id === x.id) || { ...x, who: acct, open: 0 })).join("")}</div>` : "") : empty("No portal account with this email yet.")}
      ${leads.length ? grp("In the samples pipeline") + `<div class="stack">${leads.map(p => lrow(p, [p.status, p.show, p.next_action].filter(Boolean).join(" · "))).join("")}</div>` : ""}
      ${grp("Payments", usd(sum(pays, p => p.amount)))}${stackOf(pays.map(p => `<div class="tile row"><span class="it c-green"><svg><use href="#i-cash"/></svg></span><span class="row-main"><b>${esc(PACK[p.package] || p.package || "Custom payment")}</b><small>${fDT(p.paid_at)}${p.email ? " · " + esc(p.email) : ""}</small></span><span class="row-end up">+${usd(p.amount)}</span></div>`), "No payment matched to this client.")}
      ${grp("Videos delivered", dels.length)}${stackOf(dels.slice(0, 40).map(x => `<div class="tile row"><span class="it c-orange"><svg><use href="#i-film"/></svg></span><span class="row-main"><b>${esc(cut(x.title || "Video", 70))}</b><small>${x.delivered_at ? dLong(String(x.delivered_at).slice(0, 10)) : "no date"}</small></span></div>`), cl ? "No delivery indexed for this client." : "Deliveries are matched through the clients list; this email is not on it.")}${dels.length > 40 ? `<p class="sub">+${dels.length - 40} older videos.</p>` : ""}` }; },
  owner(a) { const [o, k] = a.split("|"), F = { hot: p => (p.status || "").toUpperCase() === "HOT", samples: p => !!p.delivered_at, buyers: isBuyer }, L = { hot: "hot leads", samples: "samples delivered", buyers: "buyers", waiting: "replies waiting" };
    if (k === "waiting") { const list = RAW.attention.filter(x => x.kind === "reply" && x.owner === o); return { title: `${o}: replies waiting`, sub: `${list.length} lead${list.length === 1 ? "" : "s"}`, html: stackOf(list.map(x => lrow({ email: x.lead_email, name: x.name || x.lead_email }, x.detail || "")), "Nobody is waiting on a reply.") }; }
    const list = RAW.pipeline.filter(p => p.owner === o && F[k](p)); return { title: `${o}: ${L[k]}`, sub: `${list.length} lead${list.length === 1 ? "" : "s"}`, html: leadList(list) }; },
  vids(a) { const all = RAW.deliveries.filter(x => x.delivered_at).map(x => ({ ...x, day: String(x.delivered_at).slice(0, 10) })).sort((x, y) => y.day.localeCompare(x.day)), cn = Object.fromEntries(RAW.clients.map(c => [c.id, c]));
    let list = all, title = "Videos delivered";
    if (/^\d{4}-\d\d$/.test(a)) { list = all.filter(x => x.day.slice(0, 7) === a); title = `Videos delivered in ${MON[+a.slice(5) - 1]}`; } else if (/^\d{4}-\d\d-\d\d$/.test(a)) { list = all.filter(x => x.day >= a && x.day < addDays(a, 7)); title = `Videos delivered, week of ${dLabel(a)}`; }
    return { title, sub: `${list.length} video${list.length === 1 ? "" : "s"}${list.length > 120 ? " · newest 120 shown" : ""} · click one for the client`, html: stackOf(list.slice(0, 120).map(x => dB("client", "c:" + x.client_id, `<span class="it c-orange"><svg><use href="#i-film"/></svg></span><span class="row-main"><b>${esc(cut(x.title || "Video", 70))}</b><small>${esc((cn[x.client_id] || {}).name || "Unknown client")}</small></span><span class="row-end"><small>${dLabel(x.day)}</small></span>`, "tile row")), "No video delivered in this period.") }; },
  item(id) { const x = RAW.todayItems.find(z => String(z.id) === String(id)); if (!x) return { title: "Today", html: empty("This item is gone.") }; return { title: x.title || "Today", sub: `${x.kind}${x.at ? " · " + fDT(x.at) : ""}`, html: `<p class="dr-txt">${esc(x.detail || "No more detail.")}</p>${x.lead_email ? `<div class="stack sp">${lrow({ email: x.lead_email, name: nameOf(x.lead_email) }, "Open the lead")}</div>` : ""}` }; },
  sync() { return { title: "Where the numbers come from", sub: RT === "live" ? "Live connection is up; a full refresh also runs every minute" : "The page refreshes every minute", html: stackOf(RAW.sync.map(s => `<div class="tile pt"><div class="pt-top"><span class="it ${s.ok ? "c-green" : "c-red"}"><svg><use href="#i-${s.ok ? "check" : "alert"}"/></svg></span><span class="row-main"><b>${esc({ instantly: "Sending (Instantly → campaigns, inboxes)", replies: "Replies (mail → reply queue, threads)", sheet: "Samples sheet → pipeline", new_lead_target: "New-lead target" }[s.name] || s.name)}</b><small>ran ${ago(s.ran_at)} · ${fDT(s.ran_at)}</small></span><span class="chip ${s.ok ? "g" : "r"}">${s.ok ? "ok" : "failed"}</span></div><div class="pt-lines"><span>${esc(cut(s.detail, 300))}</span></div></div>`)) }; },
  me() { return { title: ME ? (ME.name || ME.email) : "You", sub: ME ? ME.email : "", html: `${facts([["Role", "Founder"], ["Connection", RT === "live" ? "Live" : "Polling"], ["Theme", document.documentElement.dataset.theme === "dark" ? "BEJÚ dark" : "Light"]])}
      ${grp("Shortcuts")}<div class="stack">${[["⌘K / Ctrl K", "Search leads and clients, jump to a card, run an action"], ["/", "Search leads"], ["← →", "In a chart: move through the days. In a lead: previous and next lead of the list"], ["Enter", "Open what is selected"], ["Esc", "Close the top layer"], ["W", "Wall mode"]].map(x => `<div class="tile row"><span class="kbd">${x[0]}</span><span class="row-main"><small>${x[1]}</small></span></div>`).join("")}</div>
      <div class="acts sp"><a class="act" href="${esc(PORTAL)}">${ic("link")}Client portal</a><a class="act" href="${esc(SITE)}">${ic("link")}Website</a><button type="button" class="act" data-act="theme">${ic("sun")}Switch theme</button><button type="button" class="act" data-act="refresh">${ic("refresh")}Refresh now</button><button type="button" class="act" data-act="chpw">${ic("user")}Change password</button><button type="button" class="act no" data-act="signout">${ic("out")}Sign out</button></div>` }; },
  todaylist() { const I = { call: ["phone", "c-blue"], payment_failed: ["alert", "c-red"], action: ["check", "c-green"], partner: ["flag", "c-orange"] };
    return { title: `Today, ${dLong(D.t)}`, sub: `${D.todayItems.length} items`, html: stackOf(D.todayItems.map(x => { const [icon, c] = I[x.kind] || ["clock", "c-grey"], inner = `<span class="it ${c}"><svg><use href="#i-${icon}"/></svg></span><span class="row-main"><b>${esc(cut(x.title, 90))}</b><small>${esc(cut(x.detail || x.kind, 160))}</small></span>${x.at ? `<span class="row-end"><small>${timeOf(x.at)}</small></span>` : ""}`; return x.lead_email ? leadBtn(x.lead_email, inner) : dB("item", x.id, inner, "tile row"); }), "Nothing on the list for today.") }; },
  next() { return { title: "Do next", sub: `${D.nextN} open action${D.nextN === 1 ? "" : "s"}, best first`, html: stackOf(D.nextAll.map((x, i) => { const inner = `<span class="it ${x.c}"><svg><use href="#i-${x.icon}"/></svg></span><span class="row-main"><b>${esc(cut(x.title, 90))}</b><small>${esc(cut(x.sub, 160))}</small></span><span class="row-end"><small>#${i + 1}</small></span>`; return x.email ? leadBtn(x.email, inner) : dB(x.k, x.a, inner, "tile row"); }), "Nothing is waiting on you.") }; },
  speed(a) { let list = [...D.speed.gaps], title = "Speed to reply";
    if (a === "slow") { list.sort((x, y) => y.g - x.g); title = "Slowest replies"; } else if (a === "fast") { list = list.filter(x => x.g <= 60).sort((x, y) => y.t - x.t); title = "Answered within an hour"; } else if (a === "7") { list = list.filter(x => x.t >= Date.now() - 7 * 864e5).sort((x, y) => y.t - x.t); title = "Replies answered in the last 7 days"; }
    else if (/^\d{4}-/.test(a)) { list = list.filter(x => dayOf(x.t) >= a && dayOf(x.t) < addDays(a, 7)).sort((x, y) => y.t - x.t); title = `Replies answered, week of ${dLabel(a)}`; } else list.sort((x, y) => y.t - x.t);
    return { title, sub: `${list.length} answered repl${list.length === 1 ? "y" : "ies"} · median ${fmtMin(med(list.map(x => x.g)))} · an estimate from the synced threads`, html: stackOf(list.slice(0, 150).map(x => lrow({ email: x.e, name: nameOf(x.e) }, `their email ${fDT(x.t)}`, `<span class="row-end ${x.g <= 60 ? "up" : x.g > 1440 ? "dn" : ""}">${fmtMin(x.g)}<small>until our reply</small></span>`)), "No answered reply in this list.") }; },
  deliv() { const list = [...RAW.camps].filter(c => c.emails_sent).map(c => ({ ...c, rate: (c.bounced || 0) / c.emails_sent * 100 })).sort((x, y) => y.rate - x.rate);
    return { title: "Deliverability", sub: `${nf0.format(D.bounced)} bounced of ${nf0.format(D.sentAll)} sent · ${D.deliv.rate.toFixed(2)}% · keep every campaign under 2%`, html: tbl(["Campaign", "Sent", "Bounced", "Bounce %", "Unsubscribed"], list.map(c => `<tr><td>${dB("camp", c.campaign_id, esc(campName(c.name)), "lk")}</td><td>${nf0.format(c.emails_sent)}</td><td>${nf0.format(c.bounced || 0)}</td><td class="${c.rate > 2 ? "dn" : ""}">${c.rate.toFixed(2)}%</td><td>${nf0.format(c.unsubscribed || 0)}</td></tr>`)) + `<div class="acts sp">${dB("inboxes", "", "Open the inboxes", "act")}</div>` }; },
  feed() { return { title: "Activity", sub: "Payments, replies, samples, portal and lead loads, newest first", html: `<div class="feed">${D.feed.map(e => feedRow(e, false)).join("")}</div>` }; },
  psamples() { return { title: "Free sample requests", sub: "One free sample per person, ever. Check the badges before accepting.", html: stackOf(D.pSamples.map(sampleTile), "No sample request yet.") }; },
  pvideos() { return { title: "Video requests", sub: "Deliver = the next numbered version; open change requests are marked done", html: stackOf(D.pVideos.map(videoTile), "No video request yet.") }; },
  pnotes() { return { title: "Change requests", sub: "Open notes, grouped by video and round", html: stackOf(D.pNotes.map(noteTile), "No open change request.") }; },
  pclients() { return { title: "Portal sign-ups", sub: `${D.pClients.length} client account${D.pClients.length === 1 ? "" : "s"}`, html: stackOf(D.pClients.map(clientTile), "No client has signed up yet.") }; },
};
const STACK = []; let M_OPENER = null, M_SRC = null;
function showDrill(r, seq, keep) { if (seq !== SEQ) return; $("#m-title").textContent = r.title || ""; $("#m-sub").textContent = r.sub || ""; const body = $("#m-body"), top = body.scrollTop; body.innerHTML = r.html || ""; applyVars(body); body.scrollTop = keep ? top : 0; $("#m-back").hidden = STACK.length < 2; }
function openDrill(k, a = "", opener, back) {
  if (!DR[k] || !D) return; a = String(a ?? "");
  const veil = $("#veil"), seq = ++SEQ, fresh = veil.hidden;
  if (fresh) { M_OPENER = opener || document.activeElement; STACK.length = 0; }
  if (!back) STACK.push({ k, a }); STATE.drill = { k, a };
  const run = () => { veil.hidden = false; let r; try { r = DR[k](a); } catch (e) { r = { title: "Couldn't open this", html: empty("Something went wrong building this list.") }; }
    if (r && typeof r.then === "function") { showDrill({ title: "Loading…", html: `<div class="boot-in"><span class="spin"></span> Loading…</div>` }, seq); r.then(x => showDrill(x, seq)).catch(() => showDrill({ title: "Couldn't load this", html: empty("Check your connection and try again.") }, seq)); } else showDrill(r, seq);
    if (fresh) $("#m-close").focus(); };
  const src = fresh && opener && opener.closest ? opener.closest(".card,.hero") : null;
  if (fresh && document.startViewTransition && !RM) { if (src) src.classList.add("vt-src"); M_SRC = src; document.startViewTransition(() => { if (src) src.classList.remove("vt-src"); run(); }); } else run();
}
function refreshDrill() { const s = STATE.drill; if (!s || $("#veil").hidden || s.k === "inbox" || s.k === "client") return; try { const r = DR[s.k](s.a); if (r && !r.then) showDrill(r, SEQ, true); } catch {} }
function closeDrill() { const veil = $("#veil"); if (veil.hidden) return; const src = M_SRC && M_SRC.isConnected ? M_SRC : null, go = () => { veil.hidden = true; STATE.drill = null; STACK.length = 0; SEQ++; CONVS.delete("m"); if (src) src.classList.add("vt-src"); };
  if (document.startViewTransition && !RM) { const vt = document.startViewTransition(go); const done = () => { if (src) src.classList.remove("vt-src"); }; vt.finished.then(done, done); } else { go(); if (src) src.classList.remove("vt-src"); } M_SRC = null; if (M_OPENER && M_OPENER.isConnected) M_OPENER.focus(); M_OPENER = null; }

/* ---------------- conversations: every message of a lead or client, oldest first ---------------- */
const CONVS = new Map();   // "dr" (drawer) / "m" (modal) -> messages
async function loadConv(emails) {
  const list = [...new Set(emails.flatMap(e => [String(e || "").trim(), lc(e)]).filter(Boolean))]; if (!list.length) return [];
  const run = async cols => { const out = []; for (let i = 0; ; i += 1000) { const rows = await must(sb.from("threads").select(cols).in("lead_email", list).order("at").order("msg_id").range(i, i + 999)); out.push(...rows); if (rows.length < 1000) return out; } };
  try { return await run("msg_id,lead_email,at,direction,inbox,subject,snippet,body,source"); } catch { return run("msg_id,lead_email,at,direction,inbox,subject,snippet"); }
}
const rich = t => String(t || "").split(/(https?:\/\/[^\s<>"')\]]+)/g).map((s, i) => { if (!(i % 2)) return esc(s); const u = webUrl(s); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(cut(s, 70))}</a>` : esc(s); }).join("");
function convMsgs(msgs, q) {
  q = lc(q); const shown = q ? msgs.filter(m => lc(`${m.body || m.snippet || ""} ${m.subject || ""} ${m.inbox || ""}`).includes(q)) : msgs; let day = "", subj = "", out = "";
  shown.forEach((m, i) => { const d0 = dayOf(m.at), sj = String(m.subject || "").replace(/^(\s*(re|fwd?|aw)\s*:\s*)+/i, "").trim(), txt = String(m.body || m.snippet || m.subject || "").trim(), long = txt.length > 700 || (txt.match(/\n/g) || []).length > 8, mine = m.direction === "out";
    if (d0 !== day) { day = d0; out += `<div class="cv-day"><span>${dLong(d0)}</span></div>`; }
    if (sj && lc(sj) !== lc(subj)) { subj = sj; out += `<div class="cv-subj">${esc(cut(sj, 120))}</div>`; }
    out += `<div class="cv-m ${mine ? "out" : "in"}"><div class="cv-meta">${mine ? "us" : "them"} · ${esc(mine ? (m.inbox || "") : (m.lead_email || ""))} · ${timeOf(m.at)}${m.source === "gmail" ? " · Gmail" : ""}${m.body ? "" : " · preview only, full text not synced yet"}</div><div class="cv-t${long ? " clamp" : ""}">${rich(txt)}</div>${long ? `<button type="button" class="lk" data-act="msgmore" aria-expanded="false">Show more</button>` : ""}</div>`; });
  return out || empty(`No message contains “${esc(cut(q, 30))}”.`);
}
function convBlock(msgs, id, none) {
  if (!msgs.length) { CONVS.delete(id); return `<p class="empty cv-none">${esc(none)}</p>`; }
  CONVS.set(id, msgs);
  const gaps = []; let wait = null; msgs.forEach(m => { if (m.direction !== "out") { if (wait == null) wait = +new Date(m.at); } else if (wait != null) { gaps.push((+new Date(m.at) - wait) / 6e4); wait = null; } });
  const mine = msgs.filter(m => m.direction === "out").length, full = msgs.filter(m => m.body).length;
  return `<div class="cvw" data-cv="${id}"><p class="cv-sum">${msgs.length} message${msgs.length === 1 ? "" : "s"} (${mine} ours, ${msgs.length - mine} theirs) · first contact ${dLabel(dayOf(msgs[0].at))} · last ${dLabel(dayOf(msgs[msgs.length - 1].at))}${gaps.length ? ` · we replied in ${fmtMin(med(gaps))} (median)` : ""}${full < msgs.length ? ` · ${msgs.length - full} shown as previews until the full text is synced` : ""}</p>
    <div class="cv-tools"><label class="search cv-s">${ic("search")}<input class="cv-q" type="search" placeholder="Find in this conversation" aria-label="Find in this conversation" autocomplete="off" spellcheck="false"></label><button type="button" class="act" data-act="convjump">Jump to latest ↓</button></div>
    <div class="conv">${convMsgs(msgs, "")}</div></div>`;
}

/* ---------------- lead drawer ---------------- */
const safeUrl = u => { try { const x = new URL(String(u).trim()); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } };
async function openLead(email, opener, keepNav) {
  email = lc(email); if (!email) return;
  const p = RAW.pipeline.find(x => lc(x.email) === email), f = RAW.fu.find(x => lc(x.email) === email), acct = D.pClients.find(c => lc(c.email) === email);
  if (!keepNav) { OPENER = opener || document.activeElement; const box = opener && opener.closest ? opener.closest(".stack,.feed,.names,.res,.modal-body") : null; NAV = box ? [...new Set($$('[data-act="lead"]', box).map(b => lc(b.dataset.email)))] : [email]; if (!NAV.includes(email)) NAV = [email]; }
  $("#dr-name").textContent = p ? (p.name || p.email) : email; $("#dr-sub").textContent = p ? [p.show, p.email].filter(Boolean).join(" · ") : "Not in the samples pipeline";
  const m = p ? mood(p) : "", link = p ? safeUrl(p.drive_link) : "", at = NAV.indexOf(email);
  const body = $("#dr-body");
  body.innerHTML = `<div class="dr-sec"><div class="acts"><button type="button" class="act" data-act="copy" data-t="${esc(email)}">${ic("copy")}Copy email</button><a class="act" href="mailto:${encodeURIComponent(email).replace(/%40/g, "@")}">${ic("mail")}Write email</a>${link ? `<a class="act" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${ic("link")}Open sample</a>` : ""}${acct ? dB("client", "e:" + email, `${ic("user")}Portal account`, "act") : ""}${p && isBuyer(p) ? dB("client", "e:" + email, `${ic("cash")}Payments`, "act") : ""}</div>
      ${NAV.length > 1 ? `<div class="dr-navr"><button type="button" class="act" data-act="nav" data-d="-1" ${at <= 0 ? "disabled" : ""} aria-label="Previous lead in the list">←</button><span class="mut mono">${at + 1} / ${NAV.length}</span><button type="button" class="act" data-act="nav" data-d="1" ${at >= NAV.length - 1 ? "disabled" : ""} aria-label="Next lead in the list">→</button><span class="mut">arrow keys move through the list</span></div>` : ""}</div>
    ${p ? `<div class="dr-sec"><div class="dr-chips"><span class="chip b">${esc(p.status || "—")}</span>${cvChip(D.tc[email] || 0)}${dB("mood", m, esc(MOOD_LABEL[m] || m), "chip", "Open every lead with this mood")}${p.owner ? `<span class="chip">${esc(p.owner)}</span>` : ""}${p.inbox ? `<span class="chip">${esc(p.inbox)}</span>` : ""}${f && f.touches_total ? `<span class="chip">follow-ups ${f.touches_done || 0}/${f.touches_total}</span>` : ""}</div></div>
    <div class="dr-sec"><h3>Next action${p.next_action_at ? ` · ${fDT(p.next_action_at)}` : ""}</h3><p class="dr-txt">${esc(p.next_action || "None set")}</p></div>
    <div class="dr-sec"><h3>Timeline</h3><div class="kv"><span>Said yes</span><span>${fDT(p.yes_at)}</span></div><div class="kv"><span>Sample delivered</span><span>${fDT(p.delivered_at)}</span></div><div class="kv"><span>Last reply</span><span>${fDT(p.last_reply_at)}</span></div>${p.paid ? `<div class="kv"><span>Paid</span><span class="up">${esc(cut(p.paid, 40))}</span></div>` : ""}</div>
    ${p.notes ? `<div class="dr-sec"><h3>Notes</h3><p class="dr-txt">${esc(cut(p.notes, 900))}</p></div>` : ""}` : ""}
    <div class="dr-sec" id="dr-more"><div class="boot-in"><span class="spin"></span> Loading the thread…</div></div>`;
  const dr = $("#drawer"), sc = $("#scrim"); dr.hidden = sc.hidden = false; dr.dataset.email = email;
  requestAnimationFrame(() => { dr.classList.add("on"); sc.classList.add("on"); if (!keepNav) $("#dr-close").focus(); });
  try {
    const [prom, notes, msgs] = await Promise.all([
      must(sb.from("promises").select("promise,due_at,status,owner").eq("lead_email", email).eq("status", "open").order("due_at")),
      must(sb.from("client_notes").select("kind,note,created_at").eq("lead_email", email).order("created_at", { ascending: false }).limit(5)),
      loadConv([email, p ? p.email : "", ...(((RAW.clients.find(c => (c.emails || []).some(e => lc(e) === email)) || {}).emails) || [])]),   // a buyer with several addresses: one merged conversation
    ]);
    if (dr.dataset.email !== email) return;
    $("#dr-more").outerHTML = `${prom.length ? `<div class="dr-sec"><h3>Open promises</h3><div class="stack">${prom.map(x => `<div class="tile note"><small>${esc(x.owner || "")} · due ${fDT(x.due_at)}</small>${esc(cut(x.promise, 300))}</div>`).join("")}</div></div>` : ""}
      ${notes.length ? `<div class="dr-sec"><h3>Client notes</h3><div class="stack">${notes.map(x => `<div class="tile note"><small>${esc(x.kind || "note")} · ${dLabel(dayOf(x.created_at))}</small>${esc(cut(x.note, 400))}</div>`).join("")}</div></div>` : ""}
      <div class="dr-sec"><h3>Conversation</h3>${convBlock(msgs, "dr", `No email conversation synced for this address yet.${igOf(email) ? ` Conversation is on Instagram (${igOf(email)}).` : ""}`)}</div>`;
    if (PHONE.matches) { const bd = $("#dr-body"); bd.scrollTop = bd.scrollHeight; }
  } catch (e) { const m2 = $("#dr-more"); if (m2) m2.innerHTML = empty("Couldn't load the thread. Try again."); }
}
const igOf = email => { const c = RAW.clients.find(x => (x.emails || []).some(e => lc(e) === lc(email))); return c && c.instagram ? String(c.instagram).replace(/^https?:\/\/(www\.)?instagram\.com\//i, "@").replace(/\/$/, "") : ""; };
function navLead(dir) { const dr = $("#drawer"); if (dr.hidden) return; const i = NAV.indexOf(dr.dataset.email) + dir; if (i >= 0 && i < NAV.length) openLead(NAV[i], null, true); }
function closeLead() {
  const dr = $("#drawer"), sc = $("#scrim"); if (dr.hidden) return;
  dr.classList.remove("on"); sc.classList.remove("on"); dr.dataset.email = ""; CONVS.delete("dr");
  setTimeout(() => { if (!dr.classList.contains("on")) dr.hidden = sc.hidden = true; }, RM ? 0 : 380);
  if (OPENER && OPENER.isConnected) OPENER.focus(); OPENER = null;
}

/* ---------------- toasts + confetti ---------------- */
function toast(title, icon = "check", c = "c-green", sub = "") {
  const box = $("#toasts"), el = document.createElement("button"); el.type = "button"; el.className = "toast"; el.title = "Dismiss";
  el.innerHTML = `<span class="it ${c}"><svg><use href="#i-${icon}"/></svg></span><span><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>`;
  const kill = () => { if (!el.isConnected) return; el.classList.add("out"); setTimeout(() => el.remove(), RM ? 0 : 300); };
  el.addEventListener("click", kill); box.appendChild(el); setTimeout(kill, 6500); while (box.children.length > 4) box.firstElementChild.remove();
}
function confetti() {
  if (RM) return; const cv = $("#fx"), ctx = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr;
  const cols = ["#FFD35C", "#44B874", "#F7F5EC", "#D9B45A", "#1C8A57"], ps = Array.from({ length: innerWidth < 600 ? 50 : 110 }, () => ({ x: W * (.5 + (Math.random() - .5) * .2), y: H * .62, vx: (Math.random() - .5) * 22 * dpr, vy: -(10 + Math.random() * 16) * dpr, s: (4 + Math.random() * 6) * dpr, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[Math.random() * cols.length | 0] }));
  const t0 = performance.now(); cv.hidden = false;
  const step = now => { const k = (now - t0) / 1900; ctx.clearRect(0, 0, W, H); if (k >= 1) { cv.hidden = true; return; }
    ps.forEach(p => { p.vy += .55 * dpr; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.globalAlpha = 1 - k * k; ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
    requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ---------------- client-portal actions (the only writes in this file; same fields and order as scripts/portal_ops.py) ---------------- */
let ASK = null;
function ask({ title, sees, warn = "", fields = [], cta = "Confirm", danger = false }) {
  return new Promise(resolve => {
    const d = $("#dlg"), prev = document.activeElement;
    $("#dlg-body").innerHTML = `<h2 id="dlg-title">${esc(title)}</h2>${warn ? `<p class="warn">${esc(warn)}</p>` : ""}<div class="sees"><small>What the client sees</small>${esc(sees)}</div>
      ${fields.map(f => `<label class="fld"><span>${esc(f.label)}</span>${f.type === "select" ? `<select data-k="${f.k}">${f.opts.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join("")}</select>` : f.type === "area" ? `<textarea data-k="${f.k}" maxlength="${f.max || 500}" placeholder="${esc(f.ph || "")}"></textarea>` : `<input data-k="${f.k}" type="${f.type === "num" ? "number" : f.type === "url" ? "url" : f.type === "pass" ? "password" : "text"}" ${f.type === "pass" ? 'autocomplete="new-password" autocapitalize="none" spellcheck="false"' : f.type === "url" ? 'inputmode="url" autocapitalize="none" autocomplete="off"' : ""} ${f.type === "num" ? `min="${f.min ?? 0}" step="1" inputmode="numeric"` : `maxlength="${f.max || 500}"`} value="${esc(f.val ?? "")}" placeholder="${esc(f.ph || "")}">`}</label>`).join("")}
      <p class="dlg-err" id="dlg-err" role="alert" hidden></p><div class="dlg-row"><button type="button" class="btn-ghost" data-act="dlg-no">Cancel</button><button type="submit" class="btn-go mag${danger ? " danger" : ""}">${esc(cta)}</button></div>`;
    ASK = { fields, done: v => { ASK = null; d.hidden = true; if (prev && prev.isConnected) prev.focus(); resolve(v); } };
    d.hidden = false; const first = $("input,select,textarea", d) || $(".btn-go", d); first.focus();
  });
}
function askSubmit() {
  if (!ASK) return; const out = {}, err = $("#dlg-err");
  for (const f of ASK.fields) { let v = ($(`[data-k="${f.k}"]`, $("#dlg")).value || "").trim();
    if (f.type === "url") { const u = webUrl(v); if (!u) { err.hidden = false; err.textContent = "Paste a full link that starts with https:// or http://."; return; } v = u; }
    if (f.type === "num") { v = Math.round(+v); if (!isFinite(v) || v < (f.min ?? 0)) { err.hidden = false; err.textContent = `${f.label}: enter a number of ${f.min ?? 0} or more.`; return; } }
    if (f.type === "pass") { v = $(`[data-k="${f.k}"]`, $("#dlg")).value; if (v.length < 10) { err.hidden = false; err.textContent = "Use at least 10 characters."; return; } if (f.same && v !== out[f.same]) { err.hidden = false; err.textContent = "The two passwords are not the same."; return; } }
    if (f.req && !v) { err.hidden = false; err.textContent = `${f.label} is needed.`; return; }
    out[f.k] = v; }
  ASK.done(out);
}
const upd = async (table, id, body) => { const rows = await must(sb.from(table).update(body).eq("id", id).select("id")); if (!rows.length) throw new Error("Nothing changed: the row is gone or this login may not edit it."); };
const PACKS = [["short_5_150", "Starter · 5 Shorts · $150", 5, 150], ["monthly_growth_300", "Growth · 15 a month · $300", 15, 300], ["monthly_daily_500", "Daily · 30 a month · $500", 30, 500], ["custom", "Custom pack", 5, 0]];
async function pOp(op, id, btn) {
  const s = D.pSamples.find(x => x.id === id), v = D.pVideos.find(x => x.id === id), c = D.pClients.find(x => x.id === id), noteF = { k: "note", label: "Note the client will read (optional)", type: "area", max: 300 };
  if (btn) btn.disabled = true;
  try {
    if (op === "s-accept" && s) { const h = s.hist, warn = h.sample ? `This email already had a free sample on ${dLabel(h.sample)}. One free sample per person, ever.` : h.paid ? `This email has already paid ${usd(h.paid)}. A paying client does not need a free sample.` : "";
      const r = await ask({ title: `Accept ${s.who.name}'s free sample?`, warn, sees: `Their portal shows "Accepted" with an expected-by time 24 hours from now.`, fields: [noteF], cta: warn ? "Accept anyway" : "Accept the sample" }); if (!r) return;
      const body = { status: "accepted", due_at: new Date(Date.now() + 864e5).toISOString() }; if (r.note) body.note = r.note; await upd("sample_requests", id, body); toast("Sample accepted", "check", "c-green", s.who.name); }
    else if (op === "s-building" && s) { const r = await ask({ title: `Mark ${s.who.name}'s sample as in edit?`, sees: `Their portal shows that the team is building the sample.`, fields: [noteF], cta: "Mark building" }); if (!r) return;
      const body = { status: "building" }; if (r.note) body.note = r.note; await upd("sample_requests", id, body); toast("Sample marked building", "check", "c-green", s.who.name); }
    else if (op === "s-decline" && s) { const r = await ask({ title: `Decline ${s.who.name}'s free sample?`, sees: `Their portal shows "Declined" and your note, if you write one. They are not emailed.`, fields: [noteF], cta: "Decline", danger: true }); if (!r) return;
      const body = { status: "declined" }; if (r.note) body.note = r.note; await upd("sample_requests", id, body); toast("Sample declined", "check", "c-grey", s.who.name); }
    else if (op === "s-ready" && s) { const r = await ask({ title: `Send ${s.who.name} the sample preview?`, sees: `Their portal shows "Ready" with this link as the watermarked preview. Check the link opens signed-out first.`, fields: [{ k: "link", label: "Preview link (Drive, anyone with the link)", type: "url", req: true, ph: "https://drive.google.com/…" }], cta: "Send the preview" }); if (!r) return;
      await upd("sample_requests", id, { status: "ready", preview_url: r.link, delivered_at: nowIso(), due_at: null }); toast("Sample preview sent", "check", "c-green", s.who.name); }
    else if (op === "v-editing" && v) { const r = await ask({ title: `Mark “${cut(v.title || "this video", 40)}” as in edit?`, sees: `${v.who.name}'s portal shows "In edit" for this video.`, cta: "Mark editing" }); if (!r) return;
      await upd("videos", id, { status: "editing" }); toast("Video marked in edit", "check", "c-green", v.title || ""); }
    else if (op === "v-deliver" && v) { const next = (+v.version || 0) + 1;
      const r = await ask({ title: `Deliver v${next} of “${cut(v.title || "this video", 40)}”?`, sees: `${v.who.name}'s portal shows "Ready for you" with version ${next} and this link.${v.open ? ` Their ${v.open} open change request${v.open === 1 ? " is" : "s are"} marked done.` : ""}`, fields: [{ k: "link", label: "Link to the finished video", type: "url", req: true, ph: "https://drive.google.com/…" }, { k: "note", label: "What changed (optional, the client reads it)", type: "area", max: 400 }], cta: `Deliver v${next}` }); if (!r) return;
      const cur = await must(sb.from("videos").select("version").eq("id", id).single()), n = (+cur.version || 0) + 1;
      await must(sb.from("video_versions").insert({ video_id: id, version: n, url: r.link, note: r.note || null }));
      await must(sb.from("video_notes").update({ done_at: nowIso() }).eq("video_id", id).is("done_at", null));
      await upd("videos", id, { status: "ready", result_url: r.link, delivered_at: nowIso(), version: n, due_at: null }); toast(`Delivered v${n}`, "check", "c-green", v.title || ""); }
    else if (op === "pack" && c) { const r = await ask({ title: `Add a pack for ${c.name || c.email}?`, sees: `Their portal shows the new credits at once, valid for 30 days. Use this only for someone who paid outside the portal; no money is charged here.`, fields: [{ k: "pack", label: "Pack", type: "select", opts: PACKS.map(p => [p[0], p[1]]) }, { k: "videos", label: "Videos (credits)", type: "num", min: 1, val: 5, req: true }, { k: "amount", label: "Amount paid, USD", type: "num", min: 0, val: 150, req: true }], cta: "Add the pack" }); if (!r) return;
      await must(sb.from("purchases").insert({ user_id: c.id, pack_id: r.pack, videos: r.videos, amount: r.amount })); toast(`${r.videos} credits added`, "check", "c-green", c.name || c.email); }
    else return;
    await refresh();
  } catch (e) { toast("That did not save", "alert", "c-red", cut(String(e && e.message || e), 140)); }
  finally { if (btn && btn.isConnected) btn.disabled = false; }
}

async function changePw() {   // own account only
  const r = await ask({ title: "Change your password", sees: "Nothing. This changes only your own login. Other devices stay signed in until their session ends.", fields: [{ k: "pw", label: "New password (10 characters or more)", type: "pass", req: true }, { k: "pw2", label: "The same password again", type: "pass", req: true, same: "pw" }], cta: "Change password" });
  if (!r) return;
  try { const { error } = await sb.auth.updateUser({ password: r.pw }); if (error) throw error; toast("Password changed", "check", "c-green", ME ? ME.email : ""); }
  catch (e) { toast("The password was not changed", "alert", "c-red", cut(String(e && e.message || e), 140)); }
}

/* ---------------- command palette ---------------- */
let PAL = null;
function toggleTheme() { setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true); renderAll(); }
function toggleWall() { document.documentElement.classList.toggle("wall"); requestAnimationFrame(() => CARDS.forEach(c => fit(c.el))); }
function palItems(q) {
  q = lc(q); const cmd = (label, hint, icon, run) => ({ g: "Actions", label, hint, icon, run });
  const cmds = [cmd("Refresh now", "", "refresh", () => refresh(true)), cmd(document.documentElement.dataset.theme === "dark" ? "Switch to the light theme" : "Switch to BEJÚ dark", "theme", "sun", toggleTheme),
    ...["All", "Simas", "Benas"].map(o => cmd(o === "All" ? "Show everyone's leads" : `Show only ${o}'s leads`, "owner filter", "user", () => { STATE.owner = o; STATE.att = ""; renderAll(); })),
    ...Object.keys(PER).map(p => cmd(`Period: ${PER[p][0]}`, "hero, money, outreach", "clock", () => setPeriod(p))),
    cmd("Export leads CSV", "download", "down", () => { jump("export"); exportCsv(); }), cmd("Open the website", "new tab", "link", () => window.open(SITE, "_blank", "noopener")), cmd("Open the client portal", "new tab", "link", () => window.open(PORTAL, "_blank", "noopener")),
    cmd("Wall mode on / off", "W", "expand", toggleWall), cmd("Celebrate", "confetti", "bolt", confetti), cmd("Sign out", "", "out", signOut)];
  const jumps = CARDS.filter(c => c.title && !(PHONE.matches && TABOF[c.id] === "none")).map(c => ({ g: "Jump to", label: c.title, hint: c.grid === 2 ? "client portal" : "card", icon: "chev", run: () => jump(c.id) }));
  const leads = q ? RAW.pipeline.filter(p => [p.name, p.show, p.email].some(v => lc(v).includes(q))).slice(0, 7).map(p => ({ g: "Leads", label: p.name || p.email, hint: cut(p.show || p.email, 40), icon: "user", run: () => openLead(p.email) })) : [];
  const cls = q ? D.pClients.filter(c => [c.name, c.email].some(v => lc(v).includes(q))).slice(0, 4).map(c => ({ g: "Portal clients", label: c.name || c.email, hint: c.email, icon: "user", run: () => openDrill("client", "e:" + lc(c.email)) })) : [];
  const f = x => !q || lc(x.label + " " + x.hint).includes(q);
  return [...leads, ...cls, ...cmds.filter(f), ...jumps.filter(f).slice(0, q ? 10 : 7)];
}
function palRender() { if (!PAL) return; PAL.items = palItems($("#pal-q").value); PAL.sel = clamp(PAL.sel, 0, Math.max(0, PAL.items.length - 1)); let g = "";
  $("#pal-list").innerHTML = PAL.items.map((x, i) => `${x.g !== g ? `<div class="pal-g">${g = x.g}</div>` : ""}<button type="button" role="option" id="pal-o${i}" aria-selected="${i === PAL.sel}" class="pal-i${i === PAL.sel ? " sel" : ""}" data-act="palrun" data-i="${i}" tabindex="-1">${ic(x.icon)}<span>${esc(x.label)}</span><small>${esc(x.hint || "")}</small></button>`).join("") || empty("Nothing matches. Try a lead's name, a card or an action.");
  $("#pal-q").setAttribute("aria-activedescendant", PAL.items.length ? "pal-o" + PAL.sel : ""); const sel = $(".pal-i.sel"); if (sel) sel.scrollIntoView({ block: "nearest" }); }
function openPal() { if (!D || PAL) return; PAL = { items: [], sel: 0, prev: document.activeElement }; $("#pal").hidden = false; const q = $("#pal-q"); q.value = ""; palRender(); q.focus(); }
function closePal() { if (!PAL) return; const prev = PAL.prev; PAL = null; $("#pal").hidden = true; if (prev && prev.isConnected) prev.focus(); }
function palRun(i) { const x = PAL && PAL.items[i]; if (!x) return; PAL.prev = null; closePal(); try { x.run(); } catch {} }

/* ---------------- export ---------------- */
function exportCsv() {
  const btn = $("#export"); if (!D || btn.classList.contains("busy")) return;
  const cols = ["email", "name", "show", "owner", "status", "mood", "fu_stage", "yes_at", "delivered_at", "last_reply_at", "next_action", "next_action_at", "paid", "source", "campaign"];
  const cell = v => { let s = String(v ?? "").replace(/\r?\n/g, " "); if (/^[=+\-@\t]/.test(s)) s = "'" + s; return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = D.pipe.map(p => cols.map(c => cell(c === "mood" ? MOOD_LABEL[mood(p)] : p[c])).join(","));
  const csv = "﻿" + cols.join(",") + "\n" + rows.join("\n") + "\n", label = $("#export-t"), t0 = performance.now(), dur = RM ? 1 : 900;
  btn.classList.add("busy");
  const tick = now => { const k = clamp((now - t0) / dur, 0, 1); btn.style.setProperty("--p", k); label.textContent = `Exporting ${Math.round(k * 100)}%`;
    if (k < 1) return requestAnimationFrame(tick);
    const a = document.createElement("a"), url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.href = url; a.download = `beju-leads-${STATE.owner.toLowerCase()}-${D.t}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    btn.classList.replace("busy", "done"); label.textContent = `Exported ${rows.length} leads`;
    setTimeout(() => { btn.classList.remove("done"); btn.style.setProperty("--p", 0); label.innerHTML = `<svg><use href="#i-down"/></svg>Export leads CSV`; }, 2200); };
  requestAnimationFrame(tick);
}

/* ---------------- refresh loop + realtime ---------------- */
function offline(on) { let el = $("#offline"); if (on && !el) { el = document.createElement("div"); el.id = "offline"; el.className = "offline"; el.setAttribute("role", "status"); el.textContent = "Offline, retrying…"; document.body.appendChild(el); } else if (!on && el) el.remove(); }
async function refresh(manual) {
  const btns = $$('[data-act="refresh"]'); if (manual) btns.forEach(b => b.classList.add("spinning"));
  const first = !RAW;
  try { RAW = await fetchAll(); LAST_OK = Date.now(); offline(false); renderAll(!first); }
  catch (e) { if (!RAW) throw e; offline(true); }
  finally { setTimeout(() => btns.forEach(b => b.classList.remove("spinning")), 500); }
}
function startLoop() { stopLoop(); TIMER = setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 60000); }
function stopLoop() { if (TIMER) clearInterval(TIMER); TIMER = null; }
document.addEventListener("visibilitychange", () => { if (!document.hidden && RAW && Date.now() - LAST_OK > 60000) refresh().catch(() => {}); });
function startRealtime() {
  stopRealtime();
  try { CH = sb.channel("crm-live");
    ["payments", "reply_queue", "sample_requests", "videos", "video_notes", "profiles"].forEach(tb => CH.on("postgres_changes", { event: "*", schema: "public", table: tb }, p => onChange(tb, p)));
    CH.subscribe(st => { RT = st === "SUBSCRIBED" ? "live" : "poll"; if (D) { paintStatus(); const b = byId("brand"); if (b && b.update) b.update(D); } });
  } catch { RT = "poll"; }
}
function stopRealtime() { clearTimeout(RT_T); if (CH) { try { sb.removeChannel(CH); } catch {} CH = null; } RT = "off"; }
function onChange(tb, p) {
  const n = p.new || {}, ins = p.eventType === "INSERT";
  if (tb === "payments" && ins && !n.refunded) { toast(`+${usd(n.amount)} from ${n.payer_name || n.email || "a client"}`, "cash", "c-green", PACK[n.package] || "New payment"); confetti(); }
  else if (tb === "reply_queue" && ins && n.kind === "REAL") toast(`New reply from ${nameOf(n.lead_email)}`, "mail", "c-blue", cut(n.snippet, 90));
  else if (tb === "profiles" && ins && !n.is_admin) toast(`Portal sign-up: ${n.name || n.email || "new client"}`, "user", "c-purple", n.email || "");
  else if (tb === "sample_requests" && ins) toast("New free-sample request", "film", "c-purple", cut(n.video_url, 70));
  else if (tb === "videos" && ins) toast(`New video request: ${cut(n.title || "Untitled", 40)}`, "play", "c-purple");
  else if (tb === "videos" && p.eventType === "UPDATE" && n.status === "revision") toast(`Changes asked on “${cut(n.title || "a video", 40)}”`, "alert", "c-red");
  else if (tb === "video_notes" && ins) toast("New change request", "alert", "c-red", cut(n.text, 90));
  clearTimeout(RT_T); RT_T = setTimeout(() => refresh().catch(() => {}), 1500);   // coalesce bursts into one refresh
}

/* ---------------- theme ---------------- */
function setTheme(t, save) { document.documentElement.dataset.theme = t; const tc = $('meta[name="theme-color"]'); if (tc) tc.content = t === "dark" ? "#070805" : "#ffffff"; if (save) store.set("beju-crm-skin", t); const sw = $("#sw-theme"); if (sw) sw.setAttribute("aria-checked", t !== "dark"); }
setTheme(store.get("beju-crm-skin") === "light" ? "light" : "dark");

/* ---------------- events ---------------- */
const layer = () => PAL ? $("#pal") : !$("#dlg").hidden ? $("#dlg") : !$("#drawer").hidden ? $("#drawer") : !$("#veil").hidden ? $("#veil") : null;
document.addEventListener("click", ev => {
  $$(".plot.hov").forEach(p => { if (!p.contains(ev.target) && document.activeElement !== p) { p.classList.remove("hov"); delete p.dataset.armed; } });
  const b = ev.target.closest("[data-act]");
  if (!b) { const id = ev.target.id; if (id === "scrim") closeLead(); else if (id === "veil") closeDrill(); else if (id === "pal") closePal(); else if (id === "dlg" && ASK) ASK.done(null);
    else { const pl = ev.target.closest(".plot"); if (pl) plotAt(pl, ev, true); } return; }
  const a = b.dataset.act;
  if (a === "lead") openLead(b.dataset.email, b);
  else if (a === "drill") openDrill(b.dataset.k, b.dataset.a, b);
  else if (a === "back") { if (STACK.length > 1) { STACK.pop(); const s = STACK[STACK.length - 1]; openDrill(s.k, s.a, null, true); } }
  else if (a === "mclose") closeDrill();
  else if (a === "owner") { STATE.owner = b.dataset.o; STATE.att = ""; renderAll(); }
  else if (a === "period") setPeriod(b.dataset.p);
  else if (a === "tab") setTab(b.dataset.t);
  else if (a === "chpw") changePw();
  else if (a === "pernext") { const o = Object.keys(PER); setPeriod(o[(o.indexOf(STATE.period) + 1) % o.length]); const nb = $('[data-act="pernext"]'); if (nb) nb.focus(); }
  else if (a === "msgmore") { const t = b.previousElementSibling, open = t.classList.toggle("clamp") === false; b.textContent = open ? "Show less" : "Show more"; b.setAttribute("aria-expanded", open); }
  else if (a === "convjump") { const w = b.closest(".cvw"), last = w && $(".conv", w).lastElementChild; if (last) { last.scrollIntoView({ block: "end", behavior: RM ? "auto" : "smooth" }); last.classList.remove("flashm"); void last.offsetWidth; last.classList.add("flashm"); } }
  else if (a === "range") { STATE.range = +b.dataset.r; renderAll(); }
  else if (a === "series") { STATE[b.dataset.s] = !STATE[b.dataset.s]; if (!STATE.sa && !STATE.sb) STATE[b.dataset.s === "sa" ? "sb" : "sa"] = true; renderAll(); }
  else if (a === "sort") { const k = b.dataset.key, o = k === "hotSort" ? ["wait", "next", "reply"] : ["sent", "rate"]; STATE[k] = o[(o.indexOf(STATE[k]) + 1) % o.length]; renderAll(); const nb = $(`[data-act="sort"][data-key="${k}"]`); if (nb) nb.focus(); }
  else if (a === "att") { STATE.att = STATE.att === b.dataset.k ? "" : b.dataset.k; renderAll(); const nb = $(`[data-act="att"][data-k="${CSS.escape(b.dataset.k)}"]`); if (nb) nb.focus(); }
  else if (a === "day") { STATE.day = b.dataset.d; renderAll(); const nb = $(`[data-act="day"][data-d="${b.dataset.d}"]`); if (nb) nb.focus(); }
  else if (a === "hotall") { STATE.hotAll = !STATE.hotAll; renderAll(); }
  else if (a === "todayall") { STATE.todayAll = !STATE.todayAll; renderAll(); }
  else if (a === "theme") toggleTheme();
  else if (a === "export") exportCsv();
  else if (a === "refresh") refresh(true).catch(() => {});
  else if (a === "signout") signOut();
  else if (a === "jump") jump(b.dataset.id);
  else if (a === "palette") openPal();
  else if (a === "palrun") palRun(+b.dataset.i);
  else if (a === "pop") pOp(b.dataset.op, b.dataset.id, b);
  else if (a === "dlg-no") { if (ASK) ASK.done(null); }
  else if (a === "nav") navLead(+b.dataset.d);
  else if (a === "copy") { const t = b.dataset.t; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast("Email copied", "copy", "c-green", t)).catch(() => toast("Copy did not work here", "alert", "c-red", t)); }
});
$("#dlg-form").addEventListener("submit", ev => { ev.preventDefault(); askSubmit(); });
$("#dlg").addEventListener("change", ev => { if (ev.target.dataset.k === "pack") { const p = PACKS.find(x => x[0] === ev.target.value); if (p) { $('[data-k="videos"]', $("#dlg")).value = p[2]; $('[data-k="amount"]', $("#dlg")).value = p[3]; } } });
/* charts: hover, tap and arrow keys all go through PLOT[id] */
function plotAt(box, ev, go) {
  const P = PLOT[box.dataset.plot]; if (!P) return; const hit = ev.target.closest ? ev.target.closest("[data-i]") : null; let i;
  if (hit && box.contains(hit)) i = +hit.dataset.i; else if (box.dataset.plot === "heat" || box.dataset.plot === "clock") return; else { const r = box.getBoundingClientRect(), x = clamp((ev.clientX - r.left) / r.width, 0, 1); i = box.dataset.plot === "rev" ? clamp(Math.round(x * P.n) - 1, 0, P.n - 1) : P.n < 2 ? 0 : Math.round(x * (P.n - 1)); }
  P.i = clamp(i, 0, P.n - 1); P.paint(P.i); box.classList.add("hov");
  if (go) { if ((ev.pointerType === "touch" || COARSE) && box.dataset.armed !== String(P.i)) { box.dataset.armed = P.i; return; } delete box.dataset.armed; P.drill(P.i); }
}
let PM = null, PMQ = false, LAST_T = null, LAST_M = null, LAST_P = null;
document.addEventListener("pointermove", ev => { PM = ev; if (PMQ) return; PMQ = true; requestAnimationFrame(() => { PMQ = false; const e = PM, tg = e.target; if (!tg || !tg.closest) return;
  const pl = tg.closest(".plot"); if (pl) { plotAt(pl, e); LAST_P = pl; } else if (LAST_P) { if (document.activeElement !== LAST_P) LAST_P.classList.remove("hov"); LAST_P = null; }
  if (!HOVER || RM) return;
  const c = tg.closest(".card,.hero"); if (c) { const r = c.getBoundingClientRect(); c.style.setProperty("--mx", (e.clientX - r.left).toFixed(0) + "px"); c.style.setProperty("--my", (e.clientY - r.top).toFixed(0) + "px"); }
  const t = c && c.classList.contains("tilt") ? c : null; if (LAST_T && LAST_T !== t) { LAST_T.style.setProperty("--rx", "0deg"); LAST_T.style.setProperty("--ry", "0deg"); }
  if (t) { const r = t.getBoundingClientRect(); t.style.setProperty("--ry", (((e.clientX - r.left) / r.width - .5) * 7).toFixed(2) + "deg"); t.style.setProperty("--rx", ((.5 - (e.clientY - r.top) / r.height) * 7).toFixed(2) + "deg"); } LAST_T = t;
  const m = tg.closest(".mag"); if (LAST_M && LAST_M !== m) { LAST_M.style.setProperty("--bx", "0px"); LAST_M.style.setProperty("--by", "0px"); }
  if (m) { const r = m.getBoundingClientRect(); m.style.setProperty("--bx", (((e.clientX - r.left) / r.width - .5) * 8).toFixed(1) + "px"); m.style.setProperty("--by", (((e.clientY - r.top) / r.height - .5) * 6).toFixed(1) + "px"); } LAST_M = m;
}); }, { passive: true });
document.addEventListener("pointerdown", ev => { const pl = ev.target.closest && ev.target.closest(".plot"); if (pl) plotAt(pl, ev); });
document.addEventListener("focusin", ev => { const pl = ev.target.classList && ev.target.classList.contains("plot") ? ev.target : null; if (pl && pl.matches(":focus-visible")) { const P = PLOT[pl.dataset.plot]; if (P) { P.paint(P.i); pl.classList.add("hov"); } } });
document.addEventListener("focusout", ev => { if (ev.target.classList && ev.target.classList.contains("plot")) ev.target.classList.remove("hov"); });
document.addEventListener("input", ev => { if (ev.target.classList && ev.target.classList.contains("cv-q")) { const w = ev.target.closest(".cvw"), ms = w && CONVS.get(w.dataset.cv); if (ms) $(".conv", w).innerHTML = convMsgs(ms, ev.target.value); return; }
  if (ev.target.id === "q") { STATE.q = ev.target.value; STATE.sel = 0; renderSearch(); } else if (ev.target.id === "pal-q" && PAL) { PAL.sel = 0; palRender(); } });
document.addEventListener("keydown", ev => {
  const ae = document.activeElement, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ae?.tagName || ""), L = layer();
  if ((ev.metaKey || ev.ctrlKey) && lc(ev.key) === "k") { ev.preventDefault(); if (!$("#app").hidden) PAL ? closePal() : openPal(); return; }
  if (ev.key === "Escape") { if (PAL) return closePal(); if (ASK) return ASK.done(null); if (!$("#drawer").hidden) return closeLead(); if (!$("#veil").hidden) return closeDrill(); if (ae && ae.id === "q") { STATE.q = ae.value = ""; renderSearch(); } return; }
  if (PAL) { if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); PAL.sel = clamp(PAL.sel + (ev.key === "ArrowDown" ? 1 : -1), 0, Math.max(0, PAL.items.length - 1)); palRender(); } else if (ev.key === "Enter") { ev.preventDefault(); palRun(PAL.sel); } else if (ev.key === "Tab") ev.preventDefault(); return; }
  if (ev.key === "Tab" && L) { const f = $$('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]', L).filter(x => x.offsetParent !== null); if (!f.length) return; const first = f[0], last = f[f.length - 1];
    if (!L.contains(ae)) { ev.preventDefault(); first.focus(); } else if (ev.shiftKey && ae === first) { ev.preventDefault(); last.focus(); } else if (!ev.shiftKey && ae === last) { ev.preventDefault(); first.focus(); } return; }
  if (ae && ae.classList && ae.classList.contains("plot")) { const P = PLOT[ae.dataset.plot]; if (P) { const step = ev.key === "ArrowRight" || ev.key === "ArrowDown" ? 1 : ev.key === "ArrowLeft" || ev.key === "ArrowUp" ? -1 : 0, jmp = ae.dataset.plot === "heat" && (ev.key === "ArrowLeft" || ev.key === "ArrowRight") ? 7 : 1;
      if (step) { ev.preventDefault(); P.i = ae.dataset.plot === "clock" ? (P.i + step + P.n) % P.n : clamp(P.i + step * jmp, 0, P.n - 1); P.paint(P.i); ae.classList.add("hov"); return; } if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); P.drill(P.i); return; } } }
  if (!$("#drawer").hidden && !typing && !ASK && (ev.key === "ArrowRight" || ev.key === "ArrowLeft")) { ev.preventDefault(); return navLead(ev.key === "ArrowRight" ? 1 : -1); }
  if (!typing && !L && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !$("#app").hidden) {
    if (ev.key === "/") { ev.preventDefault(); const q = $("#q"); if (q) { q.focus(); q.scrollIntoView({ block: "center", behavior: RM ? "auto" : "smooth" }); } return; }
    if (lc(ev.key) === "w") return toggleWall();
  }
  if (ae && ae.id === "q") {
    const opts = $$("#res button");
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); STATE.sel = clamp(STATE.sel + (ev.key === "ArrowDown" ? 1 : -1), 0, Math.max(0, opts.length - 1)); renderSearch(); }
    else if (ev.key === "Enter" && opts[STATE.sel]) { ev.preventDefault(); openLead(opts[STATE.sel].dataset.email, ae); }
  }
});
$("#dr-close").addEventListener("click", closeLead);

/* ---------------- phone: bottom sheets drag down to close, keyboard-safe height, paused when hidden ---------------- */
function sheet(handle, el, close) { let y0 = null, dy = 0;
  handle.addEventListener("touchstart", e => { if (!PHONE.matches) return; y0 = e.touches[0].clientY; dy = 0; el.classList.add("drag"); }, { passive: true });
  handle.addEventListener("touchmove", e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); el.style.setProperty("--dy", dy + "px"); }, { passive: true });
  const end = () => { if (y0 == null) return; y0 = null; el.classList.remove("drag"); el.style.setProperty("--dy", "0px"); if (dy > 110) close(); };
  handle.addEventListener("touchend", end); handle.addEventListener("touchcancel", end); }
sheet($("#drawer .dr-top"), $("#drawer"), closeLead); sheet($("#veil .modal-top"), $("#veil .modal"), closeDrill);
const VV = window.visualViewport, setVV = () => document.documentElement.style.setProperty("--vvh", Math.round(VV ? VV.height : innerHeight) + "px"); setVV(); if (VV) VV.addEventListener("resize", setVV); addEventListener("resize", setVV);
document.addEventListener("visibilitychange", () => document.documentElement.classList.toggle("paused", document.hidden));
setTab(store.get("beju-crm-tab") || "home", true);

/* ---------------- auth gate ---------------- */
const show = id => { ["boot", "gate", "wait", "app"].forEach(x => { $("#" + x).hidden = x !== id; }); $("#tabs").hidden = id !== "app"; };
let MODE = "in";
function setMode(m) {
  MODE = m; $("#tab-in").classList.toggle("on", m === "in"); $("#tab-up").classList.toggle("on", m === "up");
  $("#tab-in").setAttribute("aria-selected", m === "in"); $("#tab-up").setAttribute("aria-selected", m === "up");
  $("#fld-name").hidden = m !== "up"; $("#g-pass").autocomplete = m === "up" ? "new-password" : "current-password";
  $("#gate-go-t").textContent = m === "up" ? "Create login" : "Log in"; msg("");
}
function msg(t, ok) { const el = $("#gate-msg"); el.hidden = !t; el.textContent = t || ""; el.classList.toggle("ok", !!ok); }
$("#tab-in").addEventListener("click", () => setMode("in")); $("#tab-up").addEventListener("click", () => setMode("up"));
$("#gate-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const email = $("#g-email").value.trim().toLowerCase(), pass = $("#g-pass").value, name = $("#g-name").value.trim(), go = $("#gate-go");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return msg("Enter your email address.");
  if (pass.length < 8) return msg("The password needs at least 8 characters.");
  if (MODE === "up" && !name) return msg("Enter your name.");
  go.disabled = true; msg("");
  try {
    if (MODE === "up") {
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { name } } });
      if (error) throw error;
      if (!data.session) { setMode("in"); return msg("Login created. Check your email to confirm it, then log in.", true); }
      await enter(data.session.user);
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      await enter(data.user);
    }
    $("#g-pass").value = "";
  } catch (e) {
    const m = String(e && e.message || e);
    msg(/invalid login/i.test(m) ? "Wrong email or password." : /already registered/i.test(m) ? "That email already has a login. Use Log in." : /fetch|network/i.test(m) ? "No connection. Try again." : cut(m, 140));
  } finally { go.disabled = false; }
});
async function enter(user) {
  let p = null;
  for (let i = 0; i < 3 && !p; i++) {   // the profile row is created by a trigger right after sign-up
    p = await must(sb.from("profiles").select("id,name,email,is_admin").eq("id", user.id).maybeSingle());
    if (!p) await new Promise(r => setTimeout(r, 500));
  }
  if (!p || p.is_admin !== true) { ME = null; RAW = null; stopLoop(); stopRealtime(); $("#wait-email").textContent = user.email || ""; show("wait"); return; }   // not a founder: fetch nothing else
  ME = { ...p, email: user.email || p.email };
  $("#nav-site").href = $("#nav-web").href = SITE; $("#nav-portal").href = PORTAL;
  show("boot"); build(); mountHero();
  try { await refresh(); show("app"); startLoop(); startRealtime(); requestAnimationFrame(() => CARDS.forEach(c => fit(c.el))); }
  catch (e) { show("gate"); msg("Couldn't load the CRM data. Check your connection and log in again."); }
}
async function signOut() { stopLoop(); stopRealtime(); closePal(); if (ASK) ASK.done(null); closeLead(); closeDrill(); try { await sb.auth.signOut(); } catch {} ME = RAW = D = null; PREV.clear(); feedSeen.clear(); $("#grid").innerHTML = $("#grid2").innerHTML = $("#hero").innerHTML = ""; setMode("in"); show("gate"); }
$("#wait-out").addEventListener("click", signOut);
$("#wait-check").addEventListener("click", async () => { const { data } = await sb.auth.getSession(); if (data.session) enter(data.session.user).catch(() => {}); else show("gate"); });

/* ---------------- boot ---------------- */
(async () => {
  if (!window.supabase || !CFG.supabaseUrl || !CFG.supabaseAnonKey) { show("gate"); return msg("Couldn't load the page. Check your connection and refresh."); }
  sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT" && ME) setTimeout(signOut, 0); });   // no Supabase calls inside this callback
  try { const { data } = await sb.auth.getSession(); if (data.session) await enter(data.session.user); else show("gate"); }
  catch (e) { show("gate"); }
})();
})();
