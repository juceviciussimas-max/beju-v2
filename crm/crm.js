/* BEJÚ founder CRM: bento dashboard (2026-11-12, Simas). READ-ONLY: this file never inserts, updates or deletes.
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
const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const cut = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

/* ---------------- dates (all in CFG.timezone) ---------------- */
const fParts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const parts = t => Object.fromEntries(fParts.formatToParts(new Date(t)).map(p => [p.type, p.value]));
const dayOf = t => { if (!t) return ""; const p = parts(t); return `${p.year}-${p.month}-${p.day}`; };   // timestamp -> YYYY-MM-DD
const timeOf = t => { const p = parts(t); return `${p.hour === "24" ? "00" : p.hour}:${p.minute}`; };
const today = () => dayOf(Date.now());
const addDays = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dow = d => new Date(d + "T12:00:00Z").getUTCDay();
const DOW = ["S", "M", "T", "W", "T", "F", "S"], DOWL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dLabel = d => d ? `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}` : "—";
const fDT = t => t ? `${dLabel(dayOf(t))}, ${timeOf(t)}` : "—";
const ago = t => { if (!t) return "never"; const m = Math.max(0, Math.round((Date.now() - new Date(t)) / 6e4)); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const daysInMonth = d => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate();
const monday = d => addDays(d, -((dow(d) + 6) % 7));

/* ---------------- numbers ---------------- */
const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
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
let sb = null, ME = null, RAW = null, D = null, TIMER = null, LAST_OK = 0, CHART = null, OPENER = null;
const STATE = { owner: "All", range: 14, att: "", day: "", hotAll: false, todayAll: false, q: "", sel: 0 };
const must = async p => { const { data, error } = await p; if (error) throw error; return data; };
async function all(table, cols = "*", mod) {   // REST caps at 1,000 rows per call
  const out = [];
  for (let i = 0; ; i += 1000) { let q = sb.from(table).select(cols).range(i, i + 999); if (mod) q = mod(q); const rows = await must(q); out.push(...rows); if (rows.length < 1000) return out; }
}
async function fetchAll() {
  const t = today(), since14 = new Date(Date.now() - 14 * 864e5).toISOString();
  const [pipeline, payments, daily, camps, replies, attention, fu, inboxes, todayItems, sync, deliveries, clients, promises, profiles, sampleReq, videos] = await Promise.all([
    all("pipeline", "*", q => q.order("email")),
    all("payments", "id,email,payer_name,amount,currency,package,refunded,paid_at", q => q.order("paid_at", { ascending: false })),
    all("campaign_daily", "campaign_id,day,sent,new_leads,replies,replies_auto,opportunities", q => q.gte("day", addDays(t, -75)).order("day").order("campaign_id")),
    all("campaign_live"),
    all("reply_queue", "lead_email,inbox,received_at,kind,answered,blocklisted,snippet", q => q.gte("received_at", since14).order("received_at", { ascending: false })),
    all("needs_attention"), all("fu_state"), all("inbox_live"),
    all("today_items", "*", q => q.eq("day", t)), all("sync_status"),
    all("deliveries", "id,delivered_at", q => q.order("id")), all("clients", "id"),
    all("promises", "*", q => q.eq("status", "open")),
    all("profiles", "id,is_admin,created_at"), all("sample_requests", "id,status,created_at"), all("videos", "id,status"),
  ]);
  return { pipeline, payments, daily, camps, replies, attention, fu, inboxes, todayItems, sync, deliveries, clients, promises, profiles, sampleReq, videos };
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

function derive() {
  const R = RAW, t = today(), own = r => STATE.owner === "All" || (r.owner || "") === STATE.owner, ownLoose = r => STATE.owner === "All" || !r.owner || r.owner === STATE.owner;
  const d = { t };
  /* money */
  const pays = R.payments.filter(p => !p.refunded && p.paid_at).map(p => ({ ...p, amount: +p.amount || 0, day: dayOf(p.paid_at) }));
  const ym = t.slice(0, 7), dom = +t.slice(8, 10), dim = daysInMonth(t), prevEnd = addDays(ym + "-01", -1), pym = prevEnd.slice(0, 7);
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
  const best = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0]; d.bestMonth = best ? { name: MON[+best[0].slice(5, 7) - 1], v: best[1] } : null;
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
  d.camps = R.camps.filter(c => newest - +new Date(c.updated_at || 0) < 3 * 36e5).sort((a, b) => (b.emails_sent || 0) - (a.emails_sent || 0));
  d.campsOld = R.camps.length - d.camps.length;
  /* inboxes */
  d.inb = { n: R.inboxes.filter(i => i.status === 1).length, total: R.inboxes.length, cap: sum(R.inboxes, i => i.daily_limit), sent: sum(R.inboxes, i => i.sent_today), warm: R.inboxes.length ? sum(R.inboxes, i => i.warmup_score) / R.inboxes.length : null };
  /* pipeline */
  const pipe = R.pipeline.filter(own); d.pipe = pipe;
  const counts = {}; pipe.forEach(p => { const m = mood(p); counts[m] = (counts[m] || 0) + 1; });
  d.buyers = counts.buyer || 0; d.moodTotal = pipe.length - d.buyers;
  d.moods = MOODS.map(([k, label, c]) => ({ k, label, c, n: counts[k] || 0 })).filter(m => m.n);
  const waitUs = new Set(R.attention.filter(a => a.kind === "reply").map(a => (a.lead_email || "").toLowerCase()));
  const fuBy = Object.fromEntries(R.fu.map(f => [(f.email || "").toLowerCase(), f]));
  d.hot = pipe.filter(p => (p.status || "").toUpperCase() === "HOT" || /^(said_yes|asked_price)$/.test(p.fu_stage || "")).map(p => {
    const e = (p.email || "").toLowerCase(), f = fuBy[e], lr = p.last_reply_at ? +new Date(p.last_reply_at) : 0, lo = f && f.last_out ? +new Date(f.last_out) : 0;
    const us = waitUs.has(e) || (lr && lo && lr > lo);
    const tag = p.fu_stage === "said_yes" ? ["said yes", "g"] : p.fu_stage === "asked_price" ? ["asked price", "o"] : isBuyer(p) ? ["hot client", "b"] : ["hot", "r"];
    return { p, us, tag, sort: (us ? 1e15 : 0) + lr };
  }).sort((a, b) => b.sort - a.sort);
  d.hotStatus = pipe.filter(p => (p.status || "").toUpperCase() === "HOT").length;
  /* samples */
  const delivered = pipe.filter(p => p.delivered_at), wk = monday(t);
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
  const wkAgo = Date.now() - 7 * 864e5; d.away = R.replies.filter(r => r.kind === "AUTO" && !r.answered && +new Date(r.received_at) >= wkAgo);
  d.realWaiting = R.replies.filter(r => r.kind === "REAL" && !r.answered && !r.blocklisted).length;
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
  return d;
}

/* ---------------- svg helpers ---------------- */
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

/* ---------------- cards ---------------- */
const head = (title, right = "", strong = false) => `<header class="ch"><span class="ct${strong ? " strong" : ""}">${title}</span>${right ? `<span class="cx">${right}</span>` : ""}</header>`;
const bar = (pct, c = "") => `<div class="bar ${c}"><i data-v="w:${clamp(pct || 0, 0, 100).toFixed(1)}%"></i></div>`;
const leadBtn = (email, inner, cls = "tile row") => `<button type="button" class="${cls}" data-act="lead" data-email="${esc(email)}">${inner}</button>`;

const CARDS = [
{ id: "brand", cls: "brand", mount(el) {
    el.innerHTML = `<div class="brand-top"><div class="brandrow"><span class="logo"><img src="../beju-mark-sm.png" alt="" width="34" height="20"></span><div><b>BEJÚ</b><small>Founder CRM</small></div></div>
      <div class="brand-tools"><button type="button" class="icon-btn" data-act="refresh" id="b-refresh" aria-label="Refresh now" title="Refresh now"><svg><use href="#i-refresh"/></svg></button><button type="button" class="icon-btn" data-act="signout" aria-label="Sign out" title="Sign out"><svg><use href="#i-out"/></svg></button></div></div>
      <div class="live"><span class="pulse" id="b-pulse"></span><span id="b-live">Live</span></div>
      <div class="wave"><svg viewBox="0 0 1200 96" preserveAspectRatio="none" aria-hidden="true"><path class="w2" d="M0,40 C100,10 200,10 300,40 S500,70 600,40 S800,10 900,40 S1100,70 1200,40 V96 H0Z"/><path class="w1" d="M0,52 C100,30 200,30 300,52 S500,74 600,52 S800,30 900,52 S1100,74 1200,52 V96 H0Z"/></svg>
      <div class="brand-me"><b id="b-me"></b><span class="brand-date" id="b-date"></span></div></div>`;
  }, update(d) {
    $("#b-live").textContent = d.syncAt ? `Live · synced ${ago(d.syncAt)}` : "Live";
    $("#b-pulse").classList.toggle("off", !d.syncOk || Date.now() - d.syncAt > 45 * 6e4);
    $("#b-me").textContent = ME ? (ME.name || ME.email) : ""; $("#b-date").textContent = `${DOWL[dow(d.t)]} ${dLabel(d.t)}`;
  } },
{ id: "money", cls: "", render: d => `${head("Money this month", `<span class="chip">${d.monthName}</span>`)}
    <div class="big">${N(d.month, "usd")}</div>
    <p class="sub">${d.monthDelta == null ? `<span class="mut">no payments by day ${d.dom} last month</span>` : `<span class="${d.monthDelta >= 0 ? "up" : "dn"} mono">${d.monthDelta >= 0 ? "▲" : "▼"} ${Math.abs(d.monthDelta).toFixed(1)}%</span> vs same days last month`}</p>
    <div class="spark"><svg viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="g-spark" x1="0" y1="0" x2="0" y2="1"><stop class="stop-a" offset="0"/><stop class="stop-b" offset="1"/></linearGradient></defs>${(() => { const pts = lineXY(d.cum.length > 1 ? d.cum : [0, d.cum[0] || 0], 300, 64, 6, Math.max(1, ...d.cum)); const p = smooth(pts, 6, 58); return `<path class="ar" d="${p}L300,64L0,64Z"/><path class="ln" d="${p}"/>`; })()}</svg></div>
    <div class="trio"><div><span>Payments</span><b>${N(d.monthN)}</b></div><div><span>${d.prevName} total</span><b>${N(d.prevFull, "usd")}</b></div><div><span>Avg order</span><b>${N(d.avgOrder, "usd")}</b></div></div>` },
{ id: "outreach", cls: "w2 chart-card", render: d => {
    const days = d.series.slice(-STATE.range), W = 600, H = 200, pad = 10, max = Math.max(1, ...days.map(x => Math.max(x.sent, x.nw)));
    const pa = lineXY(days.map(x => x.sent), W, H, pad, max), pb = lineXY(days.map(x => x.nw), W, H, pad, max), part = days.length > 2 && days[days.length - 1].day === today(), n = part ? -1 : undefined,
      A = smooth(pa.slice(0, n), pad, H - pad), B = smooth(pb.slice(0, n), pad, H - pad), ax = part ? pa[pa.length - 2][0].toFixed(1) : W,
      dash = (q, c) => part ? `<line class="${c} part" x1="${q[q.length - 2][0].toFixed(1)}" y1="${q[q.length - 2][1].toFixed(1)}" x2="${q[q.length - 1][0].toFixed(1)}" y2="${q[q.length - 1][1].toFixed(1)}"/>` : "";
    CHART = { days, max, H, pad };
    const ticks = [...new Set([0, .25, .5, .75, 1].map(f => Math.round(f * (days.length - 1))))];
    return `${head("Outreach", `<span class="lgd"><span><i class="dot round c-blue"></i>Emails sent</span><span><i class="dot round c-orange"></i>New leads</span></span><span class="rng" role="group" aria-label="Range">${[7, 14, 30].map(r => `<button type="button" data-act="range" data-r="${r}" class="${STATE.range === r ? "on" : ""}" aria-pressed="${STATE.range === r}">${r}d</button>`).join("")}</span>`, true)}
    <div class="chart" id="chart"><svg class="lines" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="g-chart" x1="0" y1="0" x2="0" y2="1"><stop class="stop-a" offset="0"/><stop class="stop-b" offset="1"/></linearGradient></defs>
      ${[.25, .5, .75].map(f => `<line class="gl" x1="0" x2="${W}" y1="${(H * f).toFixed(0)}" y2="${(H * f).toFixed(0)}"/>`).join("")}<path class="aa" d="${A}L${ax},${H}L0,${H}Z"/><path class="lb" d="${B}"/><path class="la" d="${A}"/>${dash(pb, "lb")}${dash(pa, "la")}</svg>
      <i class="cur"></i><i class="cdot a c-blue"></i><i class="cdot b c-orange"></i><div class="tip" id="tip"></div></div>
    <div class="xl">${ticks.map(i => `<span class="${i === days.length - 1 ? "on" : ""}">${i === days.length - 1 ? "Today" : dLabel(days[i].day)}</span>`).join("")}</div>
    <div class="trio quad"><div><span>Sent, ${STATE.range} d</span><b>${N(sum(days, x => x.sent))}</b></div><div><span>New leads</span><b>${N(sum(days, x => x.nw))}</b></div><div><span>Real replies</span><b>${N(sum(days, x => x.rep))}</b></div><div><span>Positive</span><b class="up">${N(sum(days, x => x.opp))}</b></div></div>`;
  } },
{ id: "goal", cls: "feat", render: d => { const c1 = 2 * Math.PI * 62, c2 = 2 * Math.PI * 45, p = clamp(d.goalPct, 0, 100), mp = d.dom / d.dim * 100;
    return `${head(`Road to $${nf0.format(GOAL / 1000)}k / month`)}
    <div class="ring"><svg viewBox="0 0 150 150" aria-hidden="true"><circle class="tr" cx="75" cy="75" r="62"/><circle class="tr2" cx="75" cy="75" r="45"/><circle class="pr" cx="75" cy="75" r="62" data-v="p:${(c1 * p / 100).toFixed(1)}"/><circle class="pr2" cx="75" cy="75" r="45" data-v="p:${(c2 * mp / 100).toFixed(1)}"/></svg>
      <div class="ring-mid"><div><b>${N(d.goalPct, d.goalPct < 10 ? "pct1" : "pct")}</b><small>of goal</small></div></div></div>
    <div class="kv"><span>${d.monthName} so far</span><span>${N(d.month, "usd")} / $${nf0.format(GOAL)}</span></div><hr>
    <div class="kv"><span>Needed per day</span><span>${N(d.perDay, "usd")}</span></div>
    <div class="kv"><span>On pace for</span><span>${N(d.projected, "usd")}</span></div>
    <div class="kv"><span>Days left · month gone</span><span>${N(d.daysLeft)} · ${N(mp, "pct")}</span></div>`; } },
{ id: "newleads", cls: "", render: d => { const on = clamp(Math.round(d.todayNew / d.target * 10), 0, 10);
    return `${head("New leads today", `target ${nf0.format(d.target)}`)}
    <div class="big">${N(d.todayNew)}<small>contacted so far</small></div>
    <div class="pips" data-go>${Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? "on" : ""}" data-v="k:${i}"></i>`).join("")}</div>
    <div class="trio"><div><span>Yesterday</span><b>${N(d.yNew)}</b></div><div><span>Queued</span><b>${N(d.queued)}</b></div><div title="Days in a row with 150 or more new leads"><span>Streak</span><b>${N(d.streak)}</b></div></div>
    <p class="sub">Sends run in US hours, so today fills up in the evening. Streak = days in a row with 150+.</p>`; } },
{ id: "owner", cls: "bare", mount(el) { el.innerHTML = `<div class="seg" role="group" aria-label="Whose leads">${["All", "Simas", "Benas"].map(o => `<button type="button" data-act="owner" data-o="${o}">${o}</button>`).join("")}</div>`; },
  update() { $$("#c-owner button").forEach(b => { const on = b.dataset.o === STATE.owner; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); } },
{ id: "hot", cls: "", render: d => { const list = STATE.hotAll ? d.hot : d.hot.slice(0, 6);
    return `${head("Hot leads", `<span class="chip r">${d.hot.length}</span>`, true)}<div class="stack">${list.map(({ p, us, tag }) => leadBtn(p.email, `<span class="av${us ? " hot" : ""}" title="${esc(cut(p.show || "", 80))}">${esc(initials(p))}</span><span class="row-main"><b>${esc(p.name || p.email)}</b><span class="tagline"><span class="chip ${tag[1]}">${tag[0]}</span><small>${us ? `<span class="dn">on us</span>` : p.next_action_at ? dLabel(dayOf(p.next_action_at)) : "on them"}</small></span></span>${p.owner ? `<span class="who" title="${esc(p.owner)}">${esc(p.owner[0])}</span>` : ""}`)).join("") || `<p class="empty">No hot leads right now.</p>`}</div>
    ${d.hot.length > 6 ? `<button type="button" class="more" data-act="hotall">${STATE.hotAll ? "Show fewer" : `Show all ${d.hot.length}`}</button>` : ""}`; } },
{ id: "moods", cls: "", render: d => `${head("Buyer moods", `<span class="chip g">Buyers ${d.buyers}</span>`)}
    <div class="tile row-pad"><div class="segbar">${d.moods.map(m => `<i class="${m.c}" data-v="g:${m.n}" title="${m.label}: ${m.n}"></i>`).join("")}</div>
    <div class="legend">${d.moods.map(m => `<div class="lg"><i class="dot ${m.c}"></i><span>${m.label}</span><b>${m.n}</b><em>${Math.round(m.n / Math.max(1, d.moodTotal) * 100)}%</em></div>`).join("") || `<p class="empty">No leads.</p>`}</div></div>
    <p class="sub">${N(d.moodTotal)} warm leads without the buyers.</p>` },
{ id: "attention", cls: "", render: d => { const K = { reply: ["Replies waiting", "mail", "c-blue"], followup: ["Follow-ups due", "clock", "c-orange"], overdue: ["Overdue actions", "alert", "c-red"], paid_waiting: ["Paid, not delivered", "cash", "c-green"], promises: ["Promises past due", "flag", "c-ink"], brief: ["Said yes, no brief", "film", "c-purple"], followup_done: ["Finished, park", "check", "c-grey"] };
    const kinds = Object.keys(K).filter(k => d.att[k]?.length).concat(Object.keys(d.att).filter(k => !K[k]));
    return `${head("Needs attention", `<span class="chip ${d.attTotal ? "o" : "g"}">${d.attTotal}</span>`, true)}<div class="stack">${kinds.map(k => { const [label, icon, c] = K[k] || [k, "alert", "c-grey"], list = d.att[k], open = STATE.att === k;
      return `<div class="tile"><button type="button" class="row" data-act="att" data-k="${esc(k)}" aria-expanded="${open}"><span class="it ${c}"><svg><use href="#i-${icon}"/></svg></span><span class="row-main"><b>${esc(label)}</b><small>${esc(cut(list.slice(0, 3).map(x => x.name).join(", "), 44))}</small></span><span class="row-end">${list.length}</span></button>
        ${open ? `<div class="names">${list.slice(0, 10).map(x => `<button type="button" data-act="lead" data-email="${esc(x.email)}" title="${esc(cut(x.detail, 140))}">${esc(cut(x.name, 30))}${x.due ? ` · <span class="mut">${dLabel(dayOf(x.due))}</span>` : ""}</button>`).join("")}${list.length > 10 ? `<span class="mut">+${list.length - 10} more</span>` : ""}</div>` : ""}</div>`; }).join("") || `<p class="empty">Nothing waiting. All clear.</p>`}</div>`; } },
{ id: "total", cls: "", render: d => `${head("Sent in total")}<div class="big">${N(d.sentAll)}<small>emails</small></div>
    <div class="stack sp"><div class="kv"><span>Leads contacted</span><span>${N(d.contacted)}</span></div><div class="kv"><span>Leads loaded</span><span>${N(d.loaded)}</span></div><div class="kv"><span>Still queued</span><span>${N(d.queued)}</span></div></div>
    ${bar(d.loaded ? d.contacted / d.loaded * 100 : 0)}<p class="sub">${N(d.loaded ? d.contacted / d.loaded * 100 : null, "pct")} of loaded leads already contacted.</p>` },
{ id: "week", cls: "", render: d => { const s = d.series.slice(-7), max = Math.max(1, ...s.map(x => x.nw));
    return `${head("New leads, last 7 days")}<div class="big sm">${N(sum(s, x => x.nw))}</div>
    <div class="wk">${s.map((x, i) => `<i class="${i === 6 ? "on" : ""}" data-v="h:${(x.nw / max * 100).toFixed(1)}%;k:${i}" title="${dLabel(x.day)}: ${x.nw}"></i>`).join("")}</div>
    <div class="wkl">${s.map((x, i) => `<span class="${i === 6 ? "on" : ""}">${DOW[dow(x.day)]}</span>`).join("")}</div>`; } },
{ id: "samples", cls: "", render: d => { const L = Math.PI * 75, p = clamp(d.samples.conv || 0, 0, 100), a = Math.PI - Math.PI * p / 100, kx = 85 + 75 * Math.cos(a), ky = 90 - 75 * Math.sin(a);
    return `${head("Samples done", `this week ${d.samples.week}`)}<div class="big">${N(d.samples.total)}<small>delivered</small></div>
    <div class="gauge"><svg viewBox="0 0 170 96" aria-hidden="true"><path class="tr" d="M10,90 A75,75 0 0 1 160,90"/><path class="pr" d="M10,90 A75,75 0 0 1 160,90" data-v="p:${(L * p / 100).toFixed(1)}"/><circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="5.5" class="knob"/></svg>
      <div class="gauge-mid"><b>${N(d.samples.conv, "pct1")}</b><p class="sub">sample → buyer</p></div></div>
    <div class="trio"><div><span>Buyers</span><b>${N(d.samples.buyers)}</b></div><div><span>In edit</span><b>${N(d.samples.wip)}</b></div><div><span>Median</span><b>${N(d.samples.median, "h1")}</b></div></div>`; } },
{ id: "followups", cls: "", render: d => { const sel = d.fuDays.find(x => x.day === STATE.day) || d.fuDays[0];
    return `${head("Follow-ups", `${d.fuWeek} due this week`, true)}
    <div class="days">${d.fuDays.map(x => `<button type="button" data-act="day" data-d="${x.day}" class="${x.day === sel.day ? "on" : ""}${x.list.length ? " has" : ""}" aria-pressed="${x.day === sel.day}" aria-label="${dLabel(x.day)}: ${x.list.length} due"><small>${DOW[dow(x.day)]}</small><b>${+x.day.slice(8)}</b><i></i></button>`).join("")}</div>
    <div class="stack duelist">${sel.list.slice(0, 6).map(f => leadBtn(f.email, `<span class="av">${esc(initials(f))}</span><span class="row-main"><b>${esc(f.name || f.email)}</b><small>touch ${Math.min((f.touches_done || 0) + 1, f.touches_total || 99)} of ${f.touches_total || "?"} · ${esc((f.fu_stage || "").replace(/_/g, " "))}</small></span>${f.owner ? `<span class="who" title="${esc(f.owner)}">${esc(f.owner[0])}</span>` : ""}`)).join("") || `<p class="empty">Nobody due on ${dLabel(sel.day)}.</p>`}${sel.list.length > 6 ? `<span class="mut">+${sel.list.length - 6} more</span>` : ""}</div>
    ${d.fuOver.length ? `<p class="sub"><span class="dn">${d.fuOver.length} overdue</span> from earlier days.</p>` : ""}`; } },
{ id: "rate", cls: "", render: d => `${head("Reply rate")}<div class="hrow"><div class="big">${N(d.replyRate, "pct1")}</div>${d.rateDelta == null ? "" : `<span class="delta ${d.rateDelta >= 0 ? "up" : "dn"}"><i class="tri"></i>${d.rateDelta >= 0 ? "+" : "−"}${Math.abs(d.rateDelta).toFixed(1)} pts</span>`}</div>
    <p class="sub">Real replies per lead contacted, all time. The chip compares the last 7 days with the 7 before.</p>
    <div class="trio"><div><span>Positive</span><b class="up">${N(d.posRate, "pct1")}</b></div><div><span>Real</span><b>${N(d.repAll)}</b></div><div><span>Auto</span><b>${N(d.autoAll)}</b></div></div>` },
{ id: "camps", cls: "", render: d => `${head("Campaigns", `${d.camps.length} live`, true)}<div class="stack">${d.camps.map(c => { const rr = c.new_contacted ? (c.replies || 0) / c.new_contacted * 100 : null;
      return `<div class="tile camp"><div class="row"><span class="av">${esc(initials({ name: campName(c.name) }))}</span><span class="row-main"><b title="${esc(c.name)}">${esc(campName(c.name))}</b><small>${nf0.format(c.emails_sent || 0)} sent · ${nf0.format(c.uncontacted || 0)} queued</small></span><span class="row-end">${rr == null ? "—" : rr.toFixed(1) + "%"}<small>${+c.opportunities || 0} pos.</small></span></div>${bar(c.leads_total ? (c.new_contacted || 0) / c.leads_total * 100 : 0)}</div>`; }).join("") || `<p class="empty">No campaign data.</p>`}</div>
    ${d.campsOld ? `<p class="sub">${d.campsOld} older campaigns are not shown (no fresh sync).</p>` : ""}` },
{ id: "buyers", cls: "", render: d => `${head("Buyers", `${d.clients} clients`, true)}<div class="stack">${d.recentPays.map(p => `<div class="tile row"><span class="av">${esc(initials({ name: p.payer_name, email: p.email }))}</span><span class="row-main"><b>${esc(cut(p.payer_name || p.email || "Payment", 26))}</b><small>${esc(PACK[p.package] || (p.package ? p.package : "Custom"))}</small></span><span class="row-end up">+$${nf0.format(p.amount)}<small>${dLabel(p.day)}</small></span></div>`).join("") || `<p class="empty">No payments yet.</p>`}</div>
    <div class="trio"><div><span>Payments</span><b>${N(d.payN)}</b></div><div><span>Avg order</span><b>${N(d.avgOrder, "usd")}</b></div><div><span>Best, ${d.bestMonth ? d.bestMonth.name : "—"}</span><b>${d.bestMonth ? N(d.bestMonth.v, "usd") : "—"}</b></div></div>` },
{ id: "alltime", cls: "", render: d => `<div class="row np"><span class="it c-blue"><svg><use href="#i-flag"/></svg></span><span class="row-main"><b>Next milestone $${nf0.format(d.nextMs)}</b><small>$${nf0.format(d.allTime)} of $${nf0.format(d.nextMs)}</small></span><span class="big sm">${N(d.msPct, "pct")}</span></div>
    ${bar(d.msPct)}
    <div class="tile row-pad sp2"><div class="kv"><span>Money generated, all time</span><span>${N(d.allTime, "usd")}</span></div><div class="kv"><span>To go</span><span>${N(d.nextMs - d.allTime, "usd")}</span></div><div class="kv"><span>Payments</span><span>${N(d.payN)}</span></div></div>` },
{ id: "funnel", cls: "", render: d => { const max = Math.max(1, d.funnel[0][1]);
    return `${head("Funnel, all time", "", true)}<div class="fun">${d.funnel.map(([label, v, c], i) => `<div class="fr"><div class="fl"><span>${label}</span><b>${N(v)}</b></div><div class="fb"><i class="${c}" data-v="w:${clamp(Math.sqrt(v / max) * 100, v ? 5 : 0, 100).toFixed(1)}%;k:${i}"></i></div>${i ? `<span class="fs">${d.funnel[i - 1][1] ? (v / d.funnel[i - 1][1] * 100).toFixed(1) : "—"}% of the step before</span>` : ""}</div>`).join("")}</div>`; } },
{ id: "away", cls: "", render: d => `${head("Away / auto-replies", "last 7 days")}<div class="big">${N(d.away.length)}<small>leads away</small></div>
    <div class="stack sp">${d.away.slice(0, 3).map(r => leadBtn(r.lead_email, `<span class="it c-grey"><svg><use href="#i-moon"/></svg></span><span class="row-main"><b>${esc(cut(r.lead_email, 30))}</b><small>${esc(cut(r.snippet, 46))}</small></span>`)).join("") || `<p class="empty">No auto-replies this week.</p>`}</div>
    <p class="sub">${N(d.realWaiting)} real replies still unanswered in the last 14 days.</p>` },
{ id: "today", cls: "", render: d => { const I = { call: ["phone", "c-blue"], payment_failed: ["alert", "c-red"], action: ["check", "c-green"], partner: ["flag", "c-orange"] }, list = STATE.todayAll ? d.todayItems : d.todayItems.slice(0, 5);
    return `${head("Today", `${d.todayItems.filter(x => x.kind === "call").length} calls · ${d.todayItems.length} items`, true)}<div class="stack">${list.map(x => { const [icon, c] = I[x.kind] || ["clock", "c-grey"]; const inner = `<span class="it ${c}"><svg><use href="#i-${icon}"/></svg></span><span class="row-main"><b>${esc(cut(x.title, 60))}</b><small>${esc(cut(x.detail || x.kind, 60))}</small></span>${x.kind === "call" && x.at ? `<span class="row-end">${timeOf(x.at)}</span>` : ""}`;
      return x.lead_email ? leadBtn(x.lead_email, inner) : `<div class="tile row">${inner}</div>`; }).join("") || `<p class="empty">Nothing on the list for today.</p>`}</div>
    ${d.todayItems.length > 5 ? `<button type="button" class="more" data-act="todayall">${STATE.todayAll ? "Show fewer" : `Show all ${d.todayItems.length}`}</button>` : ""}`; } },
{ id: "inboxes", cls: "", render: d => `<div class="row np"><span class="av">@</span><span class="row-main"><b>${d.inb.n} inboxes active</b><small>${d.inb.total} connected · warm-up ${d.inb.warm == null ? "—" : Math.round(d.inb.warm)}</small></span></div>
    <div class="kv sp"><span>Sent today</span><span>${N(d.inb.sent)} / ${nf0.format(d.inb.cap)}</span></div>${bar(d.inb.cap ? d.inb.sent / d.inb.cap * 100 : 0)}
    <p class="sub">Capacity ${N(d.inb.cap)} emails a day · ${N(d.bounced)} bounced all time.</p>` },
{ id: "videos", cls: "", render: d => { const max = Math.max(1, ...d.vid.weeks.map(w => w.n));
    return `${head("Videos delivered", `${d.monthName} ${d.vid.month}`)}<div class="big">${N(d.vid.total)}</div>
    <div class="wk mini">${d.vid.weeks.map((w, i) => `<i class="${i === 7 ? "on" : ""}" data-v="h:${(w.n / max * 100).toFixed(1)}%;k:${i}" title="week of ${dLabel(w.s)}: ${w.n}"></i>`).join("")}</div><p class="sub">Per week, last 8 weeks.</p>`; } },
{ id: "search", cls: "bare", mount(el) { el.innerHTML = `<div class="tile"><label class="search">${ic("search")}<input id="q" type="search" placeholder="Search leads" autocomplete="off" spellcheck="false" aria-label="Search leads" aria-controls="res"><span class="kbd" aria-hidden="true">/</span></label><div class="res" id="res" role="listbox" aria-label="Results"></div></div>`; }, update() { renderSearch(); } },
{ id: "theme", cls: "", mount(el) { el.innerHTML = `<div class="center">${ic("sun")}<b>Dark mode</b><button type="button" class="sw" role="switch" id="sw-theme" data-act="theme" aria-checked="false" aria-label="Dark mode"></button></div>`; }, update() { $("#sw-theme").setAttribute("aria-checked", document.documentElement.dataset.theme === "dark"); } },
{ id: "portal", cls: "", render: d => `${head("Client portal")}<div class="big">${N(d.portal.signups)}<small>sign-ups</small></div>
    <div class="stack sp"><div class="kv"><span>Sample requests</span><span>${N(d.portal.req)}${d.portal.reqOpen ? ` · ${d.portal.reqOpen} new` : ""}</span></div><div class="kv"><span>Videos in edit</span><span>${N(d.portal.edit)}</span></div><div class="kv"><span>Videos ready</span><span>${N(d.portal.ready)}</span></div></div>` },
{ id: "sync", cls: "", render: d => `<div class="stack">${d.sync.map(s => `<div class="tile row"><span class="it ${s.ok ? "c-ink" : "c-red"}"><svg><use href="#i-${s.ok ? "check" : "alert"}"/></svg></span><span class="row-main"><b>${esc({ instantly: "Sending", replies: "Replies", sheet: "Samples" }[s.name] || s.name)}</b><small>${esc(cut(/^\{/.test(s.detail || "") ? "synced" : s.detail, 40))}</small></span><span class="row-end"><small>${ago(s.ran_at)}</small></span></div>`).join("") || `<p class="empty">No sync info.</p>`}</div>` },
{ id: "export", cls: "", mount(el) { el.innerHTML = `<button type="button" class="export" id="export" data-act="export"><i></i><span id="export-t"><svg><use href="#i-down"/></svg>Export leads CSV</span></button>`; }, update() {} },
];

/* ---------------- render ---------------- */
function build() {
  const grid = $("#grid"); grid.innerHTML = "";
  const ro = new ResizeObserver(es => es.forEach(e => fit(e.target)));
  CARDS.forEach((c, i) => {
    const el = document.createElement("section"); el.id = "c-" + c.id; el.className = "card " + (c.cls || ""); el.style.setProperty("--i", i);
    c.el = el; c.last = null; if (c.mount) c.mount(el); grid.appendChild(el); ro.observe(el);
  });
}
function fit(el) { el.style.gridRowEnd = "span " + Math.ceil((el.offsetHeight + 16) / 4); }
function renderAll() {
  D = derive();
  CARDS.forEach(c => {
    if (c.render) { const html = c.render(D); if (html !== c.last) { c.last = html; c.el.innerHTML = html; countUp(c); applyVars(c.el); } }
    if (c.update) c.update(D);
  });
}
function renderSearch() {
  const box = $("#res"); if (!box || !RAW) return;
  const q = STATE.q.trim().toLowerCase();
  if (!q) { box.innerHTML = ""; return; }
  const hits = RAW.pipeline.filter(p => [p.name, p.show, p.email].some(v => (v || "").toLowerCase().includes(q))).slice(0, 6);
  STATE.sel = clamp(STATE.sel, 0, Math.max(0, hits.length - 1));
  box.innerHTML = hits.map((p, i) => `<button type="button" role="option" aria-selected="${i === STATE.sel}" class="${i === STATE.sel ? "sel" : ""}" data-act="lead" data-email="${esc(p.email)}"><span>${esc(p.name || p.email)} <span class="mut">· ${esc(cut(p.show || p.email, 26))}</span></span><span>${esc(MOOD_LABEL[mood(p)])}</span></button>`).join("") || `<p class="empty">No lead matches “${esc(cut(STATE.q, 30))}”.</p>`;
}

/* ---------------- chart hover ---------------- */
function chartMove(ev) {
  const box = $("#chart"); if (!box || !CHART) return;
  const r = box.getBoundingClientRect(), n = CHART.days.length, i = n < 2 ? 0 : clamp(Math.round((ev.clientX - r.left) / r.width * (n - 1)), 0, n - 1), d = CHART.days[i];
  const x = n < 2 ? 50 : i / (n - 1) * 100, yy = v => (CHART.H - CHART.pad - v / CHART.max * (CHART.H - CHART.pad * 2)) / CHART.H * 100;
  $$(".cur,.cdot,.tip", box).forEach(el => el.style.setProperty("--x", x + "%"));
  $(".cdot.a", box).style.setProperty("--y", yy(d.sent) + "%"); $(".cdot.b", box).style.setProperty("--y", yy(d.nw) + "%");
  const tip = $("#tip"); tip.style.setProperty("--tx", x < 22 ? "-8%" : x > 78 ? "-92%" : "-50%");
  tip.innerHTML = `<span class="tl">${DOWL[dow(d.day)]} ${dLabel(d.day)}${i === n - 1 ? " · so far" : ""}</span><b>${nf0.format(d.sent)} sent</b><div class="tr"><span><i class="dot round c-orange"></i>New leads</span><em>${nf0.format(d.nw)}</em></div><div class="tr"><span><i class="dot round c-blue"></i>Real replies</span><em>${nf0.format(d.rep)}</em></div><div class="tr"><span><i class="dot round c-green"></i>Positive</span><em>${nf0.format(d.opp)}</em></div>`;
  box.classList.add("hov");
}

/* ---------------- drawer ---------------- */
const safeUrl = u => { try { const x = new URL(String(u).trim()); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } };
async function openLead(email, opener) {
  email = String(email || "").toLowerCase(); if (!email) return;
  const p = RAW.pipeline.find(x => (x.email || "").toLowerCase() === email), f = RAW.fu.find(x => (x.email || "").toLowerCase() === email);
  OPENER = opener || document.activeElement;
  $("#dr-name").textContent = p ? (p.name || p.email) : email; $("#dr-sub").textContent = p ? [p.show, p.email].filter(Boolean).join(" · ") : "Not in the samples pipeline";
  const m = p ? mood(p) : "", link = p ? safeUrl(p.drive_link) : "";
  const body = $("#dr-body");
  body.innerHTML = `${p ? `<div class="dr-sec"><div class="dr-chips"><span class="chip b">${esc(p.status || "—")}</span><span class="chip">${esc(MOOD_LABEL[m] || m)}</span>${p.owner ? `<span class="chip">${esc(p.owner)}</span>` : ""}${p.inbox ? `<span class="chip">${esc(p.inbox)}</span>` : ""}${f && f.touches_total ? `<span class="chip">follow-ups ${f.touches_done || 0}/${f.touches_total}</span>` : ""}</div></div>
    <div class="dr-sec"><h3>Next action${p.next_action_at ? ` · ${fDT(p.next_action_at)}` : ""}</h3><p class="dr-txt">${esc(p.next_action || "None set")}</p></div>
    <div class="dr-sec"><h3>Timeline</h3><div class="kv"><span>Said yes</span><span>${fDT(p.yes_at)}</span></div><div class="kv"><span>Sample delivered</span><span>${fDT(p.delivered_at)}</span></div><div class="kv"><span>Last reply</span><span>${fDT(p.last_reply_at)}</span></div>${p.paid ? `<div class="kv"><span>Paid</span><span class="up">${esc(cut(p.paid, 40))}</span></div>` : ""}${link ? `<p class="sp"><a class="dr-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer"><svg><use href="#i-link"/></svg>Open the sample</a></p>` : ""}</div>
    ${p.notes ? `<div class="dr-sec"><h3>Notes</h3><p class="dr-txt">${esc(cut(p.notes, 900))}</p></div>` : ""}` : ""}
    <div class="dr-sec" id="dr-more"><div class="boot-in"><span class="spin"></span> Loading the thread…</div></div>`;
  const dr = $("#drawer"), sc = $("#scrim"); dr.hidden = sc.hidden = false; dr.dataset.email = email;
  requestAnimationFrame(() => { dr.classList.add("on"); sc.classList.add("on"); $("#dr-close").focus(); });
  try {
    const [prom, notes, msgs] = await Promise.all([
      must(sb.from("promises").select("promise,due_at,status,owner").eq("lead_email", email).eq("status", "open").order("due_at")),
      must(sb.from("client_notes").select("kind,note,created_at").eq("lead_email", email).order("created_at", { ascending: false }).limit(5)),
      must(sb.from("threads").select("at,direction,inbox,subject,snippet").eq("lead_email", email).order("at", { ascending: false }).limit(20)),
    ]);
    if (dr.dataset.email !== email) return;
    $("#dr-more").outerHTML = `${prom.length ? `<div class="dr-sec"><h3>Open promises</h3><div class="stack">${prom.map(x => `<div class="tile note"><small>${esc(x.owner || "")} · due ${fDT(x.due_at)}</small>${esc(cut(x.promise, 300))}</div>`).join("")}</div></div>` : ""}
      ${notes.length ? `<div class="dr-sec"><h3>Client notes</h3><div class="stack">${notes.map(x => `<div class="tile note"><small>${esc(x.kind || "note")} · ${dLabel(dayOf(x.created_at))}</small>${esc(cut(x.note, 400))}</div>`).join("")}</div></div>` : ""}
      <div class="dr-sec"><h3>Last ${msgs.length} emails</h3><div class="stack">${msgs.map(x => `<div class="tile msg ${x.direction === "out" ? "out" : "in"}"><small>${x.direction === "out" ? "us" : "them"} · ${fDT(x.at)}</small>${esc(cut(x.snippet || x.subject, 420))}</div>`).join("") || `<p class="empty">No emails synced for this lead.</p>`}</div></div>`;
  } catch (e) { const m2 = $("#dr-more"); if (m2) m2.innerHTML = `<p class="empty">Couldn't load the thread. Try again.</p>`; }
}
function closeLead() {
  const dr = $("#drawer"), sc = $("#scrim"); if (dr.hidden) return;
  dr.classList.remove("on"); sc.classList.remove("on"); dr.dataset.email = "";
  setTimeout(() => { dr.hidden = sc.hidden = true; }, RM ? 0 : 380);
  if (OPENER && OPENER.isConnected) OPENER.focus(); OPENER = null;
}

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

/* ---------------- refresh loop ---------------- */
function offline(on) { let el = $("#offline"); if (on && !el) { el = document.createElement("div"); el.id = "offline"; el.className = "offline"; el.setAttribute("role", "status"); el.textContent = "Offline, retrying…"; document.body.appendChild(el); } else if (!on && el) el.remove(); }
async function refresh(manual) {
  const btn = $("#b-refresh"); if (manual && btn) btn.classList.add("spinning");
  try { RAW = await fetchAll(); LAST_OK = Date.now(); offline(false); renderAll(); }
  catch (e) { if (!RAW) throw e; offline(true); }
  finally { if (btn) setTimeout(() => btn.classList.remove("spinning"), 500); }
}
function startLoop() { stopLoop(); TIMER = setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 60000); }
function stopLoop() { if (TIMER) clearInterval(TIMER); TIMER = null; }
document.addEventListener("visibilitychange", () => { if (!document.hidden && RAW && Date.now() - LAST_OK > 60000) refresh().catch(() => {}); });

/* ---------------- theme ---------------- */
function setTheme(t, save) { document.documentElement.dataset.theme = t; if (save) store.set("beju-crm-theme", t); const sw = $("#sw-theme"); if (sw) sw.setAttribute("aria-checked", t === "dark"); }
setTheme(store.get("beju-crm-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

/* ---------------- events ---------------- */
document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-act]"); if (!b) { if (ev.target.id === "scrim") closeLead(); return; }
  const a = b.dataset.act;
  if (a === "lead") openLead(b.dataset.email, b);
  else if (a === "owner") { STATE.owner = b.dataset.o; STATE.att = ""; renderAll(); }
  else if (a === "range") { STATE.range = +b.dataset.r; renderAll(); }
  else if (a === "att") { STATE.att = STATE.att === b.dataset.k ? "" : b.dataset.k; renderAll(); }
  else if (a === "day") { STATE.day = b.dataset.d; renderAll(); }
  else if (a === "hotall") { STATE.hotAll = !STATE.hotAll; renderAll(); }
  else if (a === "todayall") { STATE.todayAll = !STATE.todayAll; renderAll(); }
  else if (a === "theme") setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
  else if (a === "export") exportCsv();
  else if (a === "refresh") refresh(true).catch(() => {});
  else if (a === "signout") signOut();
});
document.addEventListener("pointermove", ev => { if (ev.target.closest && ev.target.closest("#chart")) chartMove(ev); else { const c = $("#chart"); if (c) c.classList.remove("hov"); } });
document.addEventListener("pointerdown", ev => { if (ev.target.closest && ev.target.closest("#chart")) chartMove(ev); });
document.addEventListener("input", ev => { if (ev.target.id === "q") { STATE.q = ev.target.value; STATE.sel = 0; renderSearch(); } });
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape") { if (!$("#drawer").hidden) return closeLead(); if (document.activeElement && document.activeElement.id === "q") { STATE.q = document.activeElement.value = ""; renderSearch(); } return; }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
  if (ev.key === "/" && !typing && !$("#app").hidden) { ev.preventDefault(); const q = $("#q"); if (q) { q.focus(); q.scrollIntoView({ block: "center", behavior: RM ? "auto" : "smooth" }); } return; }
  if (document.activeElement && document.activeElement.id === "q") {
    const opts = $$("#res button");
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); STATE.sel = clamp(STATE.sel + (ev.key === "ArrowDown" ? 1 : -1), 0, Math.max(0, opts.length - 1)); renderSearch(); }
    else if (ev.key === "Enter" && opts[STATE.sel]) { ev.preventDefault(); openLead(opts[STATE.sel].dataset.email, document.activeElement); }
  }
});
$("#dr-close").addEventListener("click", closeLead);

/* ---------------- auth gate ---------------- */
const show = id => { ["boot", "gate", "wait", "app"].forEach(x => { $("#" + x).hidden = x !== id; }); };
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
  if (!p || p.is_admin !== true) { ME = null; RAW = null; stopLoop(); $("#wait-email").textContent = user.email || ""; show("wait"); return; }   // not a founder: fetch nothing else
  ME = { ...p, email: user.email || p.email };
  show("boot"); build();
  try { await refresh(); show("app"); startLoop(); requestAnimationFrame(() => CARDS.forEach(c => fit(c.el))); }
  catch (e) { show("gate"); msg("Couldn't load the CRM data. Check your connection and log in again."); }
}
async function signOut() { stopLoop(); closeLead(); try { await sb.auth.signOut(); } catch {} ME = RAW = D = null; PREV.clear(); $("#grid").innerHTML = ""; setMode("in"); show("gate"); }
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
