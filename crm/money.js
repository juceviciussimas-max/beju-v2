/* BEJÚ Money page (2026-11-14, Simas: "see all our money, our transfers, when expenses are due … be our financial boss").
   Reads ONE row: finance_snapshot id='current', written by scripts/finance.py --sync (Dashboard repo, service role).
   Read-only: this page writes nothing. Row-level security (is_admin()) protects the data; the gate below is only UX and
   follows index.html: no session → the CRM login, not a founder → the CRM (which sends clients to the portal),
   2-step login set up but not done → the CRM for the code.
   ?demo=1 renders money-demo.json (a local copy of the real snapshot, never committed) without Supabase.
   CSP forbids inline styles: the one dynamic width goes through style.setProperty. */
(() => {
"use strict";
const CFG = window.BEJU_CRM || {};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"'`]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
const QS = new URLSearchParams(location.search), DEMO = QS.get("demo") === "1";
const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v, cur = "EUR") => v == null || !isFinite(v) ? "—" : (v < 0 ? "−" : "") + (String(cur).toUpperCase() === "USD" ? "$" : "€") + nf2.format(Math.abs(v));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dt = d => new Date(d + "T12:00:00Z");
const dLabel = d => d ? `${MON[dt(d).getUTCMonth()]} ${dt(d).getUTCDate()}` : "—";
const dLong = d => d ? `${DOW[dt(d).getUTCDay()]} ${dLabel(d)}` : "—";
const inDays = n => n === 0 ? "today" : n === 1 ? "tomorrow" : n > 1 ? `in ${n} days` : n === -1 ? "yesterday" : `${-n} days ago`;
const ago = t => { const m = Math.max(0, Math.round((Date.now() - new Date(t)) / 6e4)); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const head = (title, right = "") => `<header class="ch"><span class="ct strong">${title}</span>${right ? `<span class="cx">${right}</span>` : ""}</header>`;
const kv = (l, v, cls = "") => `<div class="kv ${cls}"><span>${l}</span><span>${v}</span></div>`;
const empty = t => `<p class="empty">${t}</p>`;
const show = id => ["boot", "fail", "app"].forEach(x => { $("#" + x).hidden = x !== id; });
const fail = t => { $("#fail-t").textContent = t; show("fail"); };

if (DEMO && QS.get("look")) {   // preview a look without saving it (same names as the CRM's looks)
  const MODE = { frost: "light", graphite: "dark", forest: "dark", ocean: "dark", sunset: "dark" }, t = QS.get("look");
  if (MODE[t]) { document.documentElement.dataset.theme = t; document.documentElement.dataset.mode = MODE[t]; }
}

/* ---------------- sections ---------------- */
const LV = { red: ["alert", "Needs you"], amber: ["clock", "Soon"], info: ["check", "FYI"] };
function alertsBar(S) {
  const a = S.alerts || [], hot = a.filter(x => x.level !== "info");
  const rows = a.map(x => `<div class="m-al ${esc(x.level)}" role="${x.level === "red" ? "alert" : "status"}">${ic(LV[x.level] ? LV[x.level][0] : "flag")}<p><b>${LV[x.level] ? LV[x.level][1] : ""}</b> ${esc(x.text)}</p></div>`).join("");
  return (hot.length ? "" : `<div class="m-al ok">${ic("check")}<p><b>All clear.</b> No bill is late and nothing needs a transfer.</p></div>`) + rows;
}

function kpis(S) {
  const t = S.month.this || {}, l = S.month.last || {}, ym = (S.month.this.ym || S.today).split("-");
  const k = (label, v, lv, cls = "") => `<div class="m-kpi ${cls}"><span>${label}</span><b class="mono">${money(v)}</b><small>${esc(l.label ? l.label.slice(0, 3) : "Last month")}: ${money(lv)}</small></div>`;
  return `<div class="m-hero-top"><div class="hero-h"><b>${MONL[+ym[1] - 1]} ${ym[0]}</b><span class="mut">so far · in EUR</span></div>${S.all_time && S.all_time.profit != null ? `<span class="chip">All-time profit ${money(S.all_time.profit)}</span>` : ""}</div>
    <div class="m-kpis">${k("Income", t.income, l.income)}${k("Costs", t.costs, l.costs)}${k("Profit", t.profit, l.profit, (t.profit || 0) >= 0 ? "up" : "dn")}</div>
    <p class="sub">Costs = Stripe fees ${money(t.fees)} + bills and other expenses ${money(t.expenses)}. Income is gross card payments.</p>`;
}

const STATE_CHIP = { overdue: "r", waiting: "o", due: "o", upcoming: "", paid: "g" };
function bills(S) {
  const list = S.bills || [], tbd = S.bills_tbd || [];
  const row = b => { const d = dt(b.due), st = String(b.status || "").split(" · ")[0];
    return `<div class="tile m-bill${b.state === "overdue" ? " late" : ""}">
      <div class="m-date" aria-label="${esc(dLong(b.due))}"><small>${MON[d.getUTCMonth()]}</small><b>${d.getUTCDate()}</b><small>${DOW[d.getUTCDay()]}</small></div>
      <div class="row-main"><b>${esc(b.vendor)} · ${esc(b.item)}</b><small>${esc(b.payer)} pays · ${esc(b.paid_from)} · ${esc(inDays(b.days))}</small>
        <div class="m-chips"><span class="chip ${STATE_CHIP[b.state] || ""}">${esc(st)}</span>${b.funded ? `<span class="chip b" title="Money for this bill already reached the payer">${esc(b.funded)}</span>` : ""}<span class="chip m-who-${esc(String(b.payer).toLowerCase())}">${esc(b.payer)}</span></div></div>
      <div class="m-amt"><b>${money(b.amount, b.currency)}</b>${b.currency !== "EUR" ? `<small>≈ ${money(b.eur)}</small>` : `<small>${esc(b.cadence)}</small>`}</div></div>`; };
  const tbdRow = b => `<div class="tile m-bill tbd"><div class="m-date"><small>day</small><b>?</b><small>TBD</small></div><div class="row-main"><b>${esc(b.bill.replace(/^Anthropic — /, ""))}</b><small>${esc(b.payer)} pays · amount and charge day unknown</small><div class="m-chips"><span class="chip o">${esc(b.note)}</span></div></div><div class="m-amt"><b>—</b><small>not in totals</small></div></div>`;
  return `${head("Bills · next 45 days", `<span class="chip">${money(S.bills_45d_eur)} due</span>`)}
    <div class="stack">${list.map(row).join("") || empty("No bill in the next 45 days.")}${tbd.map(tbdRow).join("")}</div>
    <p class="sub">Known bills run about <b class="mono">${money(S.run_rate_eur)}</b> a month (yearly ones spread over 12). A bill turns paid when its receipt lands within 3 days of the due date.</p>`;
}

function stripeCard(S) {
  const st = S.stripe || {}, av = st.available || {}, pe = st.pending || {};
  const curs = [...new Set([...Object.keys(av), ...Object.keys(pe)])].sort((a, b) => (a === "USD" ? -1 : 1));
  const lands = (st.pending_by_date || []).map(p => kv(`Lands ${esc(dLong(p.date))}`, Object.entries(p).filter(([k]) => k !== "date").map(([c, v]) => money(v, c)).join(" + "))).join("");
  return `${head("Stripe balance", `<span class="chip">payouts: manual</span>`)}
    <div class="big">${money(av.USD || 0, "USD")}<small>available</small></div>
    <div class="stack sp m-kvs">${curs.map(c => kv(`Available ${c}`, money(av[c] || 0, c))).join("")}${curs.map(c => kv(`Pending ${c}`, money(pe[c] || 0, c))).join("")}${lands}
      ${kv("All of it in EUR", money((st.available_eur || 0) + (st.pending_eur || 0)), "m-total")}</div>
    <p class="sub">USD pays out to Benas (${esc(S.payouts && S.payouts.Benas ? S.payouts.Benas.bank : "")}), EUR to Simas (${esc(S.payouts && S.payouts.Simas ? S.payouts.Simas.bank : "")}). ${st.next_pending_date ? `Pending money becomes available ${esc(dLong(st.next_pending_date))}.` : ""}</p>`;
}

function payoutsCard(S) {
  const P = S.payouts || {}, mon = S.month.this.label ? S.month.this.label.slice(0, 3) : "This month";
  const who = (name, p) => { if (!p) return ""; const c = p.currency, nat = (p.all_time || {})[c] || 0, natM = (p.month || {})[c] || 0;
    return `<div class="tile m-who"><div class="m-who-h"><b>${esc(name)}</b><span class="chip">${esc(c)}</span></div><small class="mut">${esc(p.bank)}</small>
      <div class="m-who-n mono">${money(nat, c)}</div><small class="mut">all time${c !== "EUR" ? ` · ≈ ${money(p.all_time_eur)}` : ""} · ${p.count} payouts</small>
      ${kv(mon, money(natM, c))}${p.last ? kv("Last", `${money(p.last.amount, p.last.currency)} · ${esc(dLabel(p.last.date))}`) : ""}</div>`; };
  const led = (S.bill_payouts || []).map(r => `<div class="kv m-led"><span>${esc(dLabel(r.due))} · ${esc(String(r.bill).replace(/\s*\(.*?\)\s*/g, " ").trim())}</span><span>${money(r.amount, r.currency)} <em class="chip ${/^transfer needed/i.test(r.status) ? "r" : /paid|funded|in_transit|pending/i.test(r.status) ? "b" : ""}">${esc(r.status)}</em></span></div>`).join("");
  return `${head("Payouts landed", `<span class="chip">EUR → Simas · USD → Benas</span>`)}
    <div class="m-two">${who("Simas", P.Simas)}${who("Benas", P.Benas)}</div>
    <h3 class="m-sh">Bill payouts <span class="mut">(3 days before each bill)</span></h3>
    <div class="stack m-ledger">${led || empty("None yet. Automatic bill payouts start with bills due from Dec 1.")}</div>`;
}

function transfersCard(S) {
  const T = S.transfers || { rows: [], taken: {}, between: {} }, tk = T.taken || {}, bt = T.between || {};
  const net = (bt["Simas→Benas"] || 0) - (bt["Benas→Simas"] || 0);
  const rows = (T.rows || []).slice().reverse().map(r => `<div class="tile row"><span class="it ${r.from === "Company" ? "c-green" : "c-blue"}"><svg><use href="#i-send"/></svg></span><span class="row-main"><b>${esc(r.from)} → ${esc(r.to)}</b><small>${esc(r.date ? dLabel(r.date) : "no date")}${r.note ? " · " + esc(r.note) : ""}</small></span><span class="row-end">${money(r.amount)}</span></div>`).join("");
  return `${head("Transfers & profit taken")}
    <div class="trio m-trio"><div><span>Taken · Simas</span><b>${money(tk.Simas || 0)}</b></div><div><span>Taken · Benas</span><b>${money(tk.Benas || 0)}</b></div><div><span>Between you</span><b>${Math.abs(net) < 0.005 ? "€0.00" : (net > 0 ? "S→B " : "B→S ") + money(Math.abs(net))}</b></div></div>
    <div class="stack sp">${rows || empty("No transfers logged yet. Log each one in the sheet's Transfers tab: From = Company, To = Simas or Benas for profit; Simas ↔ Benas for money between you.")}</div>`;
}

function splitCard(S) {
  const X = S.split || {}, F = ["Simas", "Benas"], v = (k, f) => (X[k] || {})[f] || 0;
  const line = (label, k, sign = "") => `<tr><th scope="row">${label}</th>${F.map(f => `<td>${sign && v(k, f) ? sign : ""}${money(v(k, f))}</td>`).join("")}</tr>`;
  const hs = Math.max(0, v("holding", "Simas")), hb = Math.max(0, v("holding", "Benas")), share = hs + hb ? hs / (hs + hb) * 100 : 50;
  return `${head("50/50 position", `<span class="chip o">display only</span>`)}
    <table class="m-tbl"><thead><tr><th></th><th scope="col">Simas</th><th scope="col">Benas</th></tr></thead><tbody>
      ${line("Payouts landed", "landed")}${line("Bills paid", "bills_paid", "−")}${line("Profit taken", "taken", "−")}${line("Transfers in/out", "transfers_net")}
      <tr class="m-hold"><th scope="row">Holding now</th>${F.map(f => `<td>${money(v("holding", f))}</td>`).join("")}</tr></tbody></table>
    <div class="m-split" role="img" aria-label="Simas holds ${Math.round(share)}% of the business cash, Benas ${100 - Math.round(share)}%"><i id="m-split-s"></i></div>
    <div class="m-split-l"><small>Simas ${Math.round(share)}%</small><small>50%</small><small>Benas ${100 - Math.round(share)}%</small></div>
    <div class="stack sp">${kv(`Profit ${esc(S.month.this.label || "this month")}`, money(X.month_profit))}${kv("Half each", money(X.month_half))}${kv("Profit taken, to even out", esc(X.even_out || "—"))}</div>
    <p class="sub">${esc(X.note || "")} Older costs tagged “Company” (${money(X.company_tagged)}) are not split by founder, so they are not in “Bills paid”.</p>`;
}

/* ---------------- render ---------------- */
function render(S, updatedAt) {
  $("#alerts").innerHTML = alertsBar(S);
  $("#kpi").innerHTML = kpis(S);
  $("#c-bills").innerHTML = bills(S);
  $("#c-stripe").innerHTML = stripeCard(S);
  $("#c-payouts").innerHTML = payoutsCard(S);
  $("#c-transfers").innerHTML = transfersCard(S);
  $("#c-split").innerHTML = splitCard(S);
  const sp = (S.split || {}).holding || {}, a = Math.max(0, sp.Simas || 0), b = Math.max(0, sp.Benas || 0);
  const bar = $("#m-split-s"); if (bar) bar.style.setProperty("--w", (a + b ? a / (a + b) * 100 : 50).toFixed(1) + "%");
  const when = updatedAt || S.generated_at;
  $("#foot").textContent = `Snapshot from finance.py --sync, ${when ? ago(when) : "time unknown"}${S.generated_at ? ` (${S.generated_at.slice(0, 16).replace("T", " ")} Vilnius)` : ""}. Source: the Beju Finance sheet and Stripe. EUR uses $1 = €${S.fx_usd_eur}.${DEMO ? " Demo: local file, not live." : ""}`;
  $("#demo-chip").hidden = !DEMO;
  show("app");
}

let sb = null;
async function load() {
  const btn = $("#refresh"); btn.classList.add("spinning");
  try {
    if (DEMO) {
      const r = await fetch("money-demo.json", { cache: "no-store" });
      if (!r.ok) throw new Error("demo " + r.status);
      return render(await r.json(), null);
    }
    const { data, error } = await sb.from("finance_snapshot").select("data,updated_at").eq("id", "current").maybeSingle();
    if (error) return fail(/finance_snapshot|PGRST205|42P01|does not exist/i.test(`${error.message} ${error.code}`)
      ? "The money data is not set up yet: apply supabase/finance1.sql, then run finance.py --sync." : "Couldn't load the money data. Refresh to try again.");
    if (!data) return fail("No money snapshot yet. Run finance.py --sync on the ops machine.");
    render(data.data, data.updated_at);
  } catch (e) {
    fail(DEMO ? "The demo file money-demo.json is missing. Copy scripts/data/finance_snapshot.json (Dashboard repo) to crm/money-demo.json." : "Couldn't load the money data. Check your connection and refresh.");
  } finally { btn.classList.remove("spinning"); }
}
$("#refresh").addEventListener("click", load);

(async () => {
  if (DEMO) return load();
  if (!window.supabase || !CFG.supabaseUrl || !CFG.supabaseAnonKey) return fail("Couldn't load the page. Check your connection and refresh.");
  sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) return location.replace("./");                                        // log in on the CRM page
    const p = await sb.from("profiles").select("is_admin").eq("id", data.session.user.id).maybeSingle();
    if (p.error || !p.data || p.data.is_admin !== true) return location.replace("./");       // the CRM sends clients to the portal
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") return location.replace("./");   // 2-step code first
    sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") setTimeout(() => location.replace("./"), 0); });
    await load();
  } catch (e) { location.replace("./"); }
})();
})();
