/* BEJÚ Studio — client portal (static, no build step).
   Two backends with the same interface: Supabase (when config.js has keys) and Demo (localStorage, for clicking
   through the flow before Supabase exists). Credits: 1 credit = 1 Short; packs expire CFG.creditDays after purchase. */
(() => {
const CFG = window.BEJU_CONFIG;
const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const days = ms => Math.max(0, Math.ceil(ms / 864e5));
const STATUS = { received: "Received", editing: "In edit", ready: "Ready for you", revision: "Changes requested", approved: "Approved" };
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); }

/* ---------------- Demo backend (localStorage) ---------------- */
const SAMPLE_CLIPS = ["../work/01.mp4", "../work/02.mp4", "../rail-01.mp4", "../rail-08.mp4", "../hero/hero.mp4"];
const Demo = {
  load() { try { return JSON.parse(localStorage.getItem("beju_demo")) || { users: [], purchases: [], videos: [], notes: [], session: null }; } catch { return { users: [], purchases: [], videos: [], notes: [], session: null }; } },
  save(d) { localStorage.setItem("beju_demo", JSON.stringify(d)); },
  id() { return Math.random().toString(36).slice(2, 10); },
  async user() { const d = this.load(); return d.users.find(u => u.id === d.session) || null; },
  async signUp(email, password, name) {
    const d = this.load(); email = email.trim().toLowerCase();
    if (d.users.some(u => u.email === email)) throw new Error("That email already has an account. Log in instead.");
    const u = { id: this.id(), email, name: name.trim(), is_admin: /@bejucreative\./.test(email), pw: password };
    d.users.push(u); d.session = u.id; this.save(d); return u;
  },
  async signIn(email, password) {
    const d = this.load(); const u = d.users.find(x => x.email === email.trim().toLowerCase() && x.pw === password);
    if (!u) throw new Error("Wrong email or password."); d.session = u.id; this.save(d); return u;
  },
  async signOut() { const d = this.load(); d.session = null; this.save(d); },
  async purchases(uid) { return this.load().purchases.filter(p => p.user_id === uid); },
  async allPurchases() { return this.load().purchases; },
  async crmClients() { return []; }, async crmPayments() { return []; }, async crmDeliveries() { return []; }, async updateClient() {},
  async addPurchase(uid, pack) { return this.buy(uid, pack); },
  async buy(uid, pack) {
    const d = this.load(), now = Date.now();
    d.purchases.push({ id: this.id(), user_id: uid, pack_id: pack.id, videos: pack.videos, amount: pack.price, created_at: now, expires_at: now + CFG.creditDays * 864e5 });
    this.save(d);
  },
  async videos(uid) { const v = this.load().videos; return (uid ? v.filter(x => x.user_id === uid) : v).sort((a, b) => b.created_at - a.created_at); },
  async video(id) { return this.load().videos.find(v => v.id === id) || null; },
  async createVideo(uid, purchaseId, title, notes, file) {
    const d = this.load(); const v = { id: this.id(), user_id: uid, purchase_id: purchaseId, title, notes, footage: file ? file.name : "", status: "received", result_url: "", created_at: Date.now() };
    d.videos.push(v); this.save(d); return v;
  },
  async update(id, patch) { const d = this.load(); Object.assign(d.videos.find(v => v.id === id), patch); this.save(d); },
  async notes(vid) { return this.load().notes.filter(n => n.video_id === vid).sort((a, b) => a.at - b.at); },
  async addNote(vid, uid, at, text) { const d = this.load(); d.notes.push({ id: this.id(), video_id: vid, user_id: uid, at, text, created_at: Date.now() }); this.save(d); },
  async users() { return this.load().users; },
  async deliver(id, file) { await this.update(id, { status: "ready", result_url: file || SAMPLE_CLIPS[Math.floor(Math.random() * SAMPLE_CLIPS.length)], delivered_at: Date.now() }); },
  async playable(v) { return v.result_url; },
};

/* ---------------- Supabase backend ---------------- */
function SupabaseBackend(url, key) {
  const sb = window.supabase.createClient(url, key);
  const must = r => { if (r.error) throw new Error(r.error.message); return r.data; };
  return {
    async user() {
      const { data: { user } } = await sb.auth.getUser(); if (!user) return null;
      const p = must(await sb.from("profiles").select("*").eq("id", user.id).single());
      return { ...p, email: user.email };
    },
    async signUp(email, password, name) { must(await sb.auth.signUp({ email, password, options: { data: { name } } })); return this.user(); },
    async signIn(email, password) { must(await sb.auth.signInWithPassword({ email, password })); return this.user(); },
    async signOut() { await sb.auth.signOut(); },
    async purchases(uid) { return must(await sb.from("purchases").select("*").eq("user_id", uid)).map(p => ({ ...p, created_at: Date.parse(p.created_at), expires_at: Date.parse(p.expires_at) })); },
    async allPurchases() { return must(await sb.from("purchases").select("*")).map(p => ({ ...p, created_at: Date.parse(p.created_at), expires_at: Date.parse(p.expires_at) })); },
    async crmClients() { return must(await sb.from("clients").select("*")); },
    async crmPayments() { return must(await sb.from("payments").select("*")).map(p => ({ ...p, paid_at: Date.parse(p.paid_at) })); },
    async crmDeliveries() { return must(await sb.from("deliveries").select("*")).map(d => ({ ...d, delivered_at: d.delivered_at ? Date.parse(d.delivered_at) : null })); },
    async updateClient(id, patch) { must(await sb.from("clients").update(patch).eq("id", id)); },
    async live(table, order) { let q = sb.from(table).select("*"); if (order) q = q.order(order); return must(await q); },
    async crmNotes(col, val) { return must(await sb.from("crm_notes").select("*").eq(col, val).order("created_at", { ascending: false })); },
    async openNotes() { return must(await sb.from("crm_notes").select("*").eq("done", false).not("due_at", "is", null).order("due_at")); },
    async addCrmNote(row) { must(await sb.from("crm_notes").insert(row)); },
    async updateCrmNote(id, patch) { must(await sb.from("crm_notes").update(patch).eq("id", id)); },
    async addPurchase(uid, pack) { must(await sb.from("purchases").insert({ user_id: uid, pack_id: pack.id, videos: pack.videos, amount: pack.price })); },
    async buy(uid, pack, email) {   // real money: Stripe Payment Link; the webhook adds the credits
      const u = new URL(pack.link); u.searchParams.set("prefilled_email", email); u.searchParams.set("client_reference_id", uid);
      location.href = u.toString();
    },
    async videos(uid) { let q = sb.from("videos").select("*").order("created_at", { ascending: false }); if (uid) q = q.eq("user_id", uid); return must(await q).map(v => ({ ...v, created_at: Date.parse(v.created_at), delivered_at: v.delivered_at && Date.parse(v.delivered_at) })); },
    async video(id) { const v = must(await sb.from("videos").select("*").eq("id", id).single()); return { ...v, created_at: Date.parse(v.created_at), delivered_at: v.delivered_at && Date.parse(v.delivered_at) }; },
    async createVideo(uid, purchaseId, title, notes, file) {
      let footage = "";
      if (file) { footage = `${uid}/${Date.now()}-${file.name}`; must(await sb.storage.from("raw").upload(footage, file)); }
      return must(await sb.from("videos").insert({ user_id: uid, purchase_id: purchaseId, title, notes, footage }).select().single());
    },
    async update(id, patch) { must(await sb.from("videos").update(patch).eq("id", id)); },
    async notes(vid) { return must(await sb.from("video_notes").select("*").eq("video_id", vid).order("at")); },
    async addNote(vid, uid, at, text) { must(await sb.from("video_notes").insert({ video_id: vid, user_id: uid, at, text })); },
    async users() { return must(await sb.from("profiles").select("*")); },
    async deliver(id, file) {
      const v = await this.video(id); const path = `${v.user_id}/${id}-${Date.now()}.mp4`;
      must(await sb.storage.from("finished").upload(path, file));
      await this.update(id, { status: "ready", result_url: path, delivered_at: new Date().toISOString() });
    },
    async playable(v) { if (!v.result_url) return ""; return must(await sb.storage.from("finished").createSignedUrl(v.result_url, 3600)).signedUrl; },
  };
}

const LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
const api = LIVE ? SupabaseBackend(CFG.supabaseUrl, CFG.supabaseAnonKey) : Demo;
$("#demo-bar").hidden = LIVE;
$("#demo-reset").onclick = () => { localStorage.removeItem("beju_demo"); location.hash = "#/"; location.reload(); };

/* ---------------- credits ---------------- */
async function wallet(uid) {
  const [ps, vs] = await Promise.all([api.purchases(uid), api.videos(uid)]);
  const now = Date.now();
  const live = ps.filter(p => p.expires_at > now).sort((a, b) => a.expires_at - b.expires_at)
    .map(p => ({ ...p, used: vs.filter(v => v.purchase_id === p.id).length }))
    .map(p => ({ ...p, left: p.videos - p.used }));
  const open = live.filter(p => p.left > 0);
  return { purchases: ps, videos: vs, left: open.reduce((s, p) => s + p.left, 0), total: live.reduce((s, p) => s + p.videos, 0),
           next: open[0] || null, expires: open.length ? open[0].expires_at : null, spent: ps.reduce((s, p) => s + Number(p.amount || 0), 0) };
}

/* ---------------- views ---------------- */
let ME = null, W = null;
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const icon = (id, cls = "") => `<svg class="${cls}"><use href="#i-${id}"/></svg>`;
const firstName = () => (ME.name || ME.email || "").split(/[ @]/)[0];
const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const today = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const chip = s => `<span class="chip st-${s}">${STATUS[s]}</span>`;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const hoursSince = t => t ? Math.max(1, Math.round((Date.now() - t) / 36e5)) : null;

/* motion: blur-in headline words, staggered reveals, count-ups, growing bars */
function enhance(root = view) {
  root.querySelectorAll("h1:not(.split)").forEach(h => {
    h.classList.add("split");
    let i = 0;
    const walk = n => [...n.childNodes].forEach(c => {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) frag.append(part);
          else { const s = document.createElement("span"); s.className = "w"; s.style.setProperty("--i", i++); s.textContent = part; frag.append(s); }
        });
        c.replaceWith(frag);
      } else if (c.nodeType === 1 && !c.classList.contains("w")) walk(c);
    });
    walk(h);
  });
  let d = 0;
  root.querySelectorAll(".head p, .head .notice, .kpis > *, .nextcard, .vlist > *, .packs > *, .player > *, .stack > *, .card:not(.kpi):not(.pack), .banner, .seg, #af > *")
    .forEach(el => { if (!el.closest(".rv") || el.classList.contains("rv")) { el.classList.add("rv"); el.style.setProperty("--d", Math.min(d++, 12)); } });
  root.querySelectorAll("[data-count]").forEach(el => {
    const to = +el.dataset.count, suf = el.dataset.suffix || "";
    if (REDUCE || !to) { el.textContent = to + suf; return; }
    const t0 = performance.now(), dur = 900;
    const tick = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(2, -10 * p); el.textContent = Math.round(to * e) + suf; if (p < 1) requestAnimationFrame(tick); };
    el.textContent = "0" + suf; requestAnimationFrame(tick);
  });
  root.querySelectorAll("[data-w]").forEach(el => { el.style.width = "0"; requestAnimationFrame(() => requestAnimationFrame(() => el.style.width = el.dataset.w)); });
}

function chrome(on) {
  $("#shell").classList.toggle("app", on); document.body.classList.toggle("app", on);
  $("#side").hidden = !on; $("#mbar").hidden = !on; $("#tabbar").hidden = !on;
  if (!on) return;
  document.querySelectorAll(".adm").forEach(e => e.hidden = !ME.is_admin);
  const h = location.hash || "#/";
  document.querySelectorAll(".nav a, .tabbar a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === h));
  const used = W ? W.total - W.left : 0;
  $("#me").innerHTML = `
    <div class="who"><div class="avatar">${esc(firstName().slice(0, 1).toUpperCase())}</div>
      <div><b style="font-weight:600">${esc(firstName())}</b><br>${W && W.total ? `<span class="badge">${W.total}-Short pack</span>` : `<span class="small" style="color:#8F9384">No pack yet</span>`}</div></div>
    ${W && W.total ? `<div class="bar-l"><span>Shorts used</span><span class="mono">${used}/${W.total}</span></div><div class="progress"><i data-w="${Math.round(used / W.total * 100)}%"></i></div>` : ""}
    <a href="#/" class="out" id="logout">${icon("out")}Sign out</a>`;
  enhance($("#me"));
  $("#logout").onclick = async e => { e.preventDefault(); await api.signOut(); ME = W = null; location.hash = "#/login"; };
}

function authView(mode = "signup") {
  chrome(false);
  view.style.maxWidth = "none"; view.style.padding = "0";
  view.innerHTML = `
  <div class="auth">
    <div class="form"><div>
      <a class="logo" href="../index.html" style="padding:0"><img src="../beju-mark-sm.png" alt="" width="34" height="34"><span><b>BEJÚ</b><small>Client studio</small></span></a>
      <h1>${mode === "signup" ? "Your Shorts, in <span class=\"gold-text\">one place.</span>" : "Welcome <span class=\"gold-text\">back.</span>"}</h1>
      <p class="muted">${mode === "signup" ? "Order, watch, approve and ask for changes. No email threads, no Drive links." : "Your Shorts and packs are waiting."}</p>
      <div class="seg ${mode === "login" ? "r" : ""}"><span class="knob"></span><button data-m="signup" class="${mode === "signup" ? "on" : ""}">Create account</button><button data-m="login" class="${mode === "login" ? "on" : ""}">Log in</button></div>
      <form id="af">
        ${mode === "signup" ? `<div><label for="n">Your name</label><input id="n" required autocomplete="name" placeholder="Ana"></div>` : ""}
        <div><label for="e">Email</label><input id="e" type="email" required autocomplete="email" placeholder="you@yourshow.com"></div>
        <div><label for="p">Password</label><input id="p" type="password" required minlength="8" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" placeholder="At least 8 characters"></div>
        <p style="margin:24px 0 8px"><button class="btn btn-dark btn-block">${mode === "signup" ? "Create my studio" : "Log in"}</button></p>
        <p class="err" id="aerr" role="alert"></p>
      </form>
    </div></div>
    <div class="art" aria-hidden="true">
      <div class="phone" id="phone"><video src="../hero/hero.mp4" autoplay muted loop playsinline></video></div>
      <div class="float f1">${icon("check")} Short ready in <b>24h</b></div>
      <div class="float f2">${icon("bolt")} <b>2×</b> views guarantee</div>
      <div class="tag-line">BEJÚ Creative · Client studio</div>
    </div>
  </div>`;
  enhance();
  const art = view.querySelector(".art"), phone = $("#phone");
  if (art && !REDUCE) art.onmousemove = e => { const r = art.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    phone.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 8}deg)`; };
  if (art) art.onmouseleave = () => phone.style.transform = "";
  view.querySelectorAll(".seg button").forEach(b => b.onclick = () => {
    view.querySelector(".seg").classList.toggle("r", b.dataset.m === "login");
    setTimeout(() => { location.hash = b.dataset.m === "login" ? "#/login" : "#/signup"; }, 220);
  });
  $("#af").onsubmit = async e => {
    e.preventDefault(); const btn = e.submitter; btn.setAttribute("aria-busy", "true");
    try {
      ME = mode === "signup" ? await api.signUp($("#e").value, $("#p").value, $("#n").value) : await api.signIn($("#e").value, $("#p").value);
      if (!ME) { $("#aerr").textContent = "Check your inbox to confirm your email, then log in."; return; }
      location.hash = "#/";
    } catch (err) { $("#aerr").textContent = err.message; } finally { btn.removeAttribute("aria-busy"); }
  };
}

function packCards() {
  return CFG.packs.map(p => `
    <div class="card pack ${p.best ? "best" : ""}">${p.best ? `<span class="tag">Best value</span>` : ""}
      <h3>${esc(p.name)}</h3>
      <div class="price">$${p.price}</div><div class="per">$${(p.price / p.videos).toFixed(0)} per Short</div>
      <ul><li>${icon("check")}${p.videos} Short${p.videos > 1 ? "s" : ""} from your videos</li><li>${icon("check")}Back within 24 h</li>
        <li>${icon("check")}Changes within 48 h</li><li>${icon("check")}2× views guarantee <a href="../terms.html" class="small" style="color:inherit;opacity:.7">terms</a></li></ul>
      <button class="btn ${p.best ? "btn-gold" : "btn-line"} btn-block" data-buy="${p.id}">Get ${p.videos > 1 ? p.videos + " Shorts" : "1 Short"}</button>
    </div>`).join("");
}
function bindBuy(root, after) {
  root.querySelectorAll("[data-buy]").forEach(b => b.onclick = async () => {
    const pack = CFG.packs.find(p => p.id === b.dataset.buy);
    await api.buy(ME.id, pack, ME.email);
    if (!LIVE) { toast(`Demo payment: ${pack.videos} credit${pack.videos > 1 ? "s" : ""} added`); after(); }
  });
}

function videoCard(v, url) {
  const working = v.status === "editing" || v.status === "revision";
  return `<a class="vcard" href="#/v/${v.id}">
    <div class="thumb">${url ? `<video src="${esc(url)}#t=0.5" muted playsinline preload="metadata"></video><span class="play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>`
      : `<div class="shimmer"></div><div class="ph ${working ? "working" : ""}">${icon(working ? "clock" : "up")}${v.status === "received" ? "Footage received" : working ? "Your editor is on it" : "Delivered"}</div>`}</div>
    <div class="vmeta"><b>${esc(v.title)}</b><div class="row">${chip(v.status)}</div></div></a>`;
}
const head = (title, sub, right = "") => `<div class="head"><div><h1>${title}</h1><p>${sub}</p></div>${right}</div>`;

/* the one card that says what to do next (council: status-driven, replaces "How it works") */
function nextCard(urls) {
  const ready = W.videos.find(v => v.status === "ready");
  const working = W.videos.find(v => ["received", "editing", "revision"].includes(v.status));
  if (ready) { const u = urls[W.videos.indexOf(ready)];
    return `<a class="card nextcard dark" href="#/v/${ready.id}"><div class="nx-media">${u ? `<video src="${esc(u)}#t=0.5" muted autoplay loop playsinline></video>` : ""}</div>
      <div class="nx-body"><span class="label">Ready for you</span><h2>${esc(firstName())}, your Short is ready.</h2><p>${esc(ready.title)}${ready.delivered_at ? ` · delivered ${new Date(ready.delivered_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</p>
      <span class="btn btn-gold">${icon("film")}Watch it</span></div></a>`; }
  if (working) return `<div class="card nextcard"><div class="ring"><svg class="rc" viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle class="arc" cx="22" cy="22" r="19"/></svg>${icon("clock")}</div>
      <div class="nx-body"><span class="label">In edit</span><h2>Your editor is on it.</h2><p>"${esc(working.title)}" lands right here within 24 h. We'll show it to you the moment it's ready.</p></div></div>`;
  if (W.left) return `<a class="card nextcard" href="#/new"><div class="ring gold">${icon("up")}</div>
      <div class="nx-body"><span class="label">Next step</span><h2>Send us your next video.</h2><p>${W.left} Short${W.left === 1 ? "" : "s"} ready to use. Upload a video, tell us the moment, and it's back within 24 h.</p><span class="btn btn-dark">${icon("plus")}Upload a video</span></div></a>`;
  return `<a class="card nextcard dark" href="#/packs"><div class="ring gold">${icon("bag")}</div>
      <div class="nx-body"><span class="label">Get started</span><h2>Pick a pack, send a video.</h2><p>Your first Short is back within 24 h, right here.</p><span class="btn btn-gold">See packs</span></div></a>`;
}

async function dashboard() {
  const urls = await Promise.all(W.videos.map(v => api.playable(v)));
  const c = s => W.videos.filter(v => v.status === s).length;
  const exp = W.expires ? days(W.expires - Date.now()) : null;
  view.innerHTML = head(`${greet()}, ${esc(firstName())}`, today()) + `
    ${W.left && exp !== null && exp <= 4 ? `<a class="banner" href="#/new">${icon("clock")}<span><b>${W.left} Short${W.left === 1 ? "" : "s"} still waiting for your footage.</b> Your pack runs out in ${exp} day${exp === 1 ? "" : "s"}. Send a video and it's back within 24 h.</span></a>` : ""}
    ${nextCard(urls)}
    <div class="grid kpis three">
      <a class="card kpi hero" href="${W.left ? "#/new" : "#/packs"}"><span class="k-l">Shorts left</span><span class="k-ic">${icon("film")}</span>
        <span class="k-v" data-count="${W.left}">${W.left}</span><span class="k-s">${W.total ? `${W.total - W.left} of ${W.total} used` : "Get a pack →"}</span></a>
      <a class="card kpi" href="#/shorts"><span class="k-l">In edit</span><span class="k-ic t-violet">${icon("clock")}</span>
        <span class="k-v" data-count="${c("received") + c("editing") + c("revision")}">0</span><span class="k-s">Back within 24 h</span></a>
      <a class="card kpi" href="#/shorts"><span class="k-l">Approved</span><span class="k-ic t-gold">${icon("check")}</span>
        <span class="k-v" data-count="${c("approved")}">0</span><span class="k-s">${c("ready") ? `${c("ready")} waiting for you` : "Ready to post"}</span></a>
    </div>
    ${W.videos.length ? `<div class="card" style="margin-top:16px"><div class="sec-h"><h2>Latest Shorts</h2><a href="#/shorts">See all →</a></div>
      <div class="vlist">${W.videos.slice(0, 5).map((v, i) => videoCard(v, urls[i])).join("")}</div></div>` : ""}`;
  // Premiere: the first time a delivered Short is seen, it gets its own moment
  const fresh = W.videos.find(v => v.status === "ready" && !store.get("seen_" + v.id));
  if (fresh) premiere(fresh, urls[W.videos.indexOf(fresh)]);
}

function overlay(html) {
  const o = document.createElement("div"); o.className = "premiere"; o.innerHTML = html; document.body.append(o);
  requestAnimationFrame(() => o.classList.add("in")); enhance(o);
  const close = () => { o.classList.remove("in"); setTimeout(() => o.remove(), 450); };
  o.addEventListener("click", e => { if (e.target === o || e.target.closest("[data-close]")) close(); });
  return { o, close };
}

function premiere(v, url) {
  store.set("seen_" + v.id, "1");
  const h = hoursSince(v.delivered_at && v.created_at ? v.created_at : null);
  const { o, close } = overlay(`
    <div class="pm-in">
      <div class="pm-text"><span class="label">Premiere</span><h1>${esc(firstName())}, your Short is ready.</h1>
        <p>${esc(v.title)}${v.delivered_at && v.created_at ? ` · made in ${Math.max(1, Math.round((v.delivered_at - v.created_at) / 36e5))} h` : ""}</p>
        <div class="row"><button class="btn btn-gold" data-approve>${icon("check")}Approve</button><a class="btn btn-ghost" href="#/v/${v.id}" data-close>Ask for a change</a></div>
        <button class="linkish pm-skip" data-close>Later</button></div>
      <div class="screen pm-screen"><video src="${esc(url || "")}" autoplay muted playsinline controls></video><button class="pm-sound" data-sound>${icon("bolt")}Tap for sound</button></div>
    </div>`);
  const vid = o.querySelector("video");
  o.querySelector("[data-sound]").onclick = e => { e.stopPropagation(); vid.muted = false; vid.currentTime = 0; vid.play(); e.currentTarget.remove(); };
  o.querySelector("[data-approve]").onclick = async e => { e.stopPropagation(); await api.update(v.id, { status: "approved" }); close(); celebrate(v); };
}

/* approval = the re-order moment (council): say it, then show the next step on the same screen */
async function celebrate(v) {
  W = await wallet(ME.id); chrome(true);
  if (!REDUCE) { const b = document.createElement("div"); b.className = "burst"; document.body.append(b); setTimeout(() => b.remove(), 1000); }
  const { o } = overlay(`
    <div class="pm-in single">
      <div class="pm-text center"><span class="label">Approved</span><h1>Nice. Post it today.</h1>
        <p>"${esc(v.title)}" is yours. Download it from its page any time.</p>
        <div class="ghosts">${[1, 2, 3].map(i => `<div class="ghost"><span>Next Short</span></div>`).join("")}</div>
        <div class="row" style="justify-content:center">${W.left ? `<a class="btn btn-gold" href="#/new" data-close>${icon("plus")}Start the next one</a><span class="small" style="color:#9EA292">${W.left} left in your pack</span>`
          : `<button class="btn btn-gold" data-buy="short_5">Next 5 Shorts · $75</button><a class="btn btn-ghost" href="#/packs" data-close>See all packs</a>`}</div>
        <button class="linkish pm-skip" data-close>Back to my studio</button></div>
    </div>`);
  bindBuy(o, () => { o.remove(); route(); });
  route();
}

async function shorts() {
  const urls = await Promise.all(W.videos.map(v => api.playable(v)));
  view.innerHTML = head("My Shorts", `${W.videos.length} Short${W.videos.length === 1 ? "" : "s"} so far`, W.left ? `<a class="btn btn-dark" href="#/new">${icon("plus")}New Short</a>` : "") +
    (W.videos.length ? `<div class="vlist">${W.videos.map((v, i) => videoCard(v, urls[i])).join("")}</div>`
      : `<div class="card empty"><div class="ic t-gold">${icon("film")}</div><h3>No Shorts yet</h3><p>They'll all live here, ready to watch.</p><a class="btn btn-dark" href="${W.left ? "#/new" : "#/packs"}">${W.left ? "Upload a video" : "See packs"}</a></div>`);
}

function packs() {
  view.innerHTML = head("Packs", W.left ? `You have <b class="mono" style="color:var(--ink)">${W.left}</b> Short${W.left === 1 ? "" : "s"} left. Top up any time.` : `Pick a pack. Your Shorts show up straight away.`) +
    `<div class="grid packs">${packCards()}</div><p class="small muted" style="margin-top:18px">Packs are valid for ${CFG.creditDays} days from purchase. Secure payment by Stripe.</p>`;
  bindBuy(view, route);
}

async function newVideo() {
  if (!W.left) { view.innerHTML = head("New Short", "You're out of Shorts. Pick a pack to start the next one.") + `<div class="grid packs">${packCards()}</div>`; bindBuy(view, route); return; }
  const last = W.videos[0];
  view.innerHTML = head("New Short", `${W.left} left in your pack · back within 24 h`) + `
  <div class="card" style="max-width:720px">
    <form id="nf">
      <label for="t" style="margin-top:0">Name it</label><input id="t" required placeholder="e.g. Episode 42, the part about sleep">
      <label>Your footage</label>
      <label class="drop" id="drop" for="f">${icon("up")}<b id="fname">Drop your video here or click to choose</b><span class="small muted">MP4 or MOV · up to 50 MB for now</span><input id="f" type="file" accept="video/*"></label>
      <label for="no">What do you want?</label><textarea id="no" placeholder="Start at 12:30 where I talk about… Make the hook the line about…">${last && last.notes ? "" : ""}</textarea>
      ${last ? `<p class="small muted" style="margin:8px 0 0">Same style as "${esc(last.title)}"? Just say so in the notes.</p>` : ""}
      <p style="margin:22px 0 0" class="row"><button class="btn btn-dark">Send to our editors</button><span class="small muted">Uses 1 Short from your pack</span></p>
    </form></div>`;
  const f = $("#f"), drop = $("#drop");
  f.onchange = () => $("#fname").textContent = f.files[0] ? f.files[0].name : "Drop your video here or click to choose";
  ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove("over")));
  drop.addEventListener("drop", e => { e.preventDefault(); f.files = e.dataTransfer.files; f.onchange(); });
  $("#nf").onsubmit = async e => {
    e.preventDefault(); const btn = e.submitter; btn.setAttribute("aria-busy", "true");
    try { const v = await api.createVideo(ME.id, W.next.id, $("#t").value, $("#no").value, f.files[0]); toast("Got it. Your editor is on it."); location.hash = `#/v/${v.id}`; }
    catch (err) { toast(err.message); btn.removeAttribute("aria-busy"); }
  };
}

async function videoPage(id) {
  const v = await api.video(id);
  if (!v || (v.user_id !== ME.id && !ME.is_admin)) { view.innerHTML = `<div class="card empty"><h3>Not found</h3></div>`; return; }
  const [url, notes] = await Promise.all([api.playable(v), api.notes(id)]);
  const left = v.delivered_at ? CFG.revisionHours * 36e5 - (Date.now() - v.delivered_at) : 0;
  const canChange = v.status === "ready" && left > 0;
  const mine = v.user_id === ME.id;
  view.innerHTML = `
  <a href="#/shorts" class="back">← My Shorts</a>
  <div class="player">
    <div class="screen">${url ? `<video id="pv" src="${esc(url)}#t=0.1" controls playsinline preload="auto"></video>`
      : `<div class="thumb"><div class="shimmer"></div><div class="ph ${v.status === "received" ? "" : "working"}">${icon(v.status === "received" ? "up" : "clock")}${v.status === "received" ? "We have your footage.<br>Your editor starts soon." : "Your editor is on it.<br>It plays right here when it's ready."}</div></div>`}</div>
    <div class="stack">
      <div>${chip(v.status)}<h1 style="margin-top:12px">${esc(v.title)}</h1>${v.notes ? `<p class="muted" style="margin:8px 0 0">Your brief: ${esc(v.notes)}</p>` : ""}</div>
      ${v.status === "ready" ? `
        <div class="card"><h2>Happy with it?</h2><p class="small muted" style="margin:4px 0 14px">Approve it, or pause at the exact second and tell us what to change.</p>
          <div class="row"><button class="btn btn-gold" id="approve">${icon("check")}Approve</button>${url ? `<a class="btn btn-line" href="${esc(url)}" download>Download</a>` : ""}</div>
          ${canChange ? `<form id="cf" style="margin-top:20px"><div class="sec-h" style="margin:0 0 8px"><span class="row"><b style="color:var(--ink);font-size:14px">Change</b><button type="button" class="tsbtn" id="at">at 0:00</button></span>
            <span class="window">${icon("clock")}${Math.ceil(left / 36e5)} h left for changes</span></div>
            <textarea id="ct" required placeholder="e.g. Cut this pause, make the caption bigger"></textarea>
            <p class="row" style="margin:12px 0 0"><button class="btn btn-line btn-sm">Add change</button><button type="button" class="btn btn-dark btn-sm" id="sendrev">Send changes to editor</button></p></form>` : ""}
        </div>` : ""}
      ${v.status === "approved" ? `<div class="card upsell"><h2>Make it a series</h2><p class="small" style="margin:6px 0 16px">${W.left && mine ? `You have ${W.left} Short${W.left === 1 ? "" : "s"} left. Keep the momentum going.` : "Your next 5 Shorts, each back within 24 h."}</p>
        ${W.left && mine ? `<a class="btn btn-gold" href="#/new">Start the next one</a>` : `<button class="btn btn-gold" data-buy="short_5">Next 5 Shorts · $75</button>`}
        ${url ? ` <a class="btn btn-ghost" href="${esc(url)}" download>Download</a>` : ""}</div>` : ""}
      <div class="card"><div class="sec-h" style="margin-bottom:10px"><h2>Changes</h2></div>
        ${notes.length ? `<ul class="notes">${notes.map(n => `<li><button class="tsbtn" data-t="${n.at}">${fmtTime(n.at)}</button><span>${esc(n.text)}</span></li>`).join("")}</ul>` : `<p class="small muted" style="margin:0">No changes requested.</p>`}</div>
    </div>
  </div>`;
  if (v.status === "ready") store.set("seen_" + v.id, "1");
  const pv = $("#pv");
  view.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { if (pv) { pv.currentTime = +b.dataset.t; pv.play(); } });
  if (pv && $("#at")) pv.ontimeupdate = () => $("#at").textContent = `at ${fmtTime(pv.currentTime)}`;
  if ($("#cf")) $("#cf").onsubmit = async e => { e.preventDefault(); await api.addNote(id, ME.id, pv ? pv.currentTime : 0, $("#ct").value); route(); };
  if ($("#sendrev")) $("#sendrev").onclick = async () => { if (!notes.length) return toast("Add at least one change first."); await api.update(id, { status: "revision" }); toast("Sent. Your editor is on it."); route(); };
  if ($("#approve")) $("#approve").onclick = async () => { await api.update(id, { status: "approved" }); celebrate(v); };
  bindBuy(view, route);
}

async function admin() {
  if (!ME.is_admin) { location.hash = "#/"; return; }
  const [vs, us] = await Promise.all([api.videos(null), api.users()]);
  const who = id => (us.find(u => u.id === id) || {}).email || id;
  const open = vs.filter(v => v.status !== "approved").length;
  view.innerHTML = head("Orders", `${open} open · ${vs.length} total`) + `
  <div class="card tablebox"><table><thead><tr><th>Client</th><th>Short</th><th>Footage</th><th>Status</th><th></th></tr></thead><tbody>
  ${vs.map(v => `<tr><td>${esc(who(v.user_id))}</td><td><a href="#/v/${v.id}" style="color:var(--ink);font-weight:600">${esc(v.title)}</a></td>
    <td class="small muted">${esc((v.footage || "—").split("/").pop())}</td><td>${chip(v.status)}</td>
    <td><div class="row" style="justify-content:flex-end">${v.status === "received" || v.status === "revision" ? `<button class="btn btn-line btn-sm" data-edit="${v.id}">Start edit</button>` : ""}
      ${v.status !== "approved" ? (LIVE ? `<label class="btn btn-dark btn-sm filelabel">Deliver file<input type="file" accept="video/mp4" data-del="${v.id}" hidden></label>` : `<button class="btn btn-dark btn-sm" data-demo="${v.id}">Deliver (demo clip)</button>`) : ""}</div></td></tr>`).join("")
    || `<tr><td colspan="5" class="muted">No orders yet.</td></tr>`}
  </tbody></table></div>`;
  view.querySelectorAll("[data-edit]").forEach(b => b.onclick = async () => { await api.update(b.dataset.edit, { status: "editing" }); route(); });
  view.querySelectorAll("[data-demo]").forEach(b => b.onclick = async () => { await api.deliver(b.dataset.demo); toast("Delivered"); route(); });
  view.querySelectorAll("[data-del]").forEach(i => i.onchange = async () => { toast("Uploading…"); await api.deliver(i.dataset.del, i.files[0]); toast("Delivered"); route(); });
}

/* ---------------- founders: overview, clients, client page (admins only) ----------------
   Clients = every paying client (CRM tables, filled from Stripe + Drive by scripts/crm_sync.py and the Stripe webhook),
   plus portal sign-ups that haven't paid yet. */
const money = n => "$" + Math.round(Number(n || 0)).toLocaleString("en-US");
const ago = t => { if (!t) return "—"; const m = Math.round((Date.now() - t) / 6e4); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const shortDate = t => t ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
const linkOut = (u, label) => u ? `<a class="pill-link" href="${esc(/^https?:/.test(u) ? u : "https://" + u)}" target="_blank" rel="noopener">${label}</a>` : "";
async function crm() {
  const [cl, pay, del, us, ps, vs] = await Promise.all([api.crmClients(), api.crmPayments(), api.crmDeliveries(), api.users(), api.allPurchases(), api.videos(null)]);
  const now = Date.now();
  const linked = new Set(cl.map(c => c.user_id).filter(Boolean));
  const signups = us.filter(u => !u.is_admin && !linked.has(u.id)).map(u => ({ id: "u-" + u.id, name: u.name || u.email, emails: [u.email], user_id: u.id, created_at: u.created_at, portalOnly: true }));
  const clients = [...cl, ...signups].map(c => {
    const p = pay.filter(x => x.client_id === c.id && !x.refunded), d = del.filter(x => x.client_id === c.id);
    const pp = c.user_id ? ps.filter(x => x.user_id === c.user_id) : [], v = c.user_id ? vs.filter(x => x.user_id === c.user_id) : [];
    const live = pp.filter(x => x.expires_at > now);
    const left = live.reduce((s, x) => s + Math.max(0, x.videos - v.filter(y => y.purchase_id === x.id).length), 0);
    const st = s => v.filter(x => x.status === s).length;
    const acts = [...p.map(x => x.paid_at), ...d.map(x => x.delivered_at || 0), ...v.map(x => x.delivered_at || x.created_at)].filter(Boolean);
    const times = acts.length ? acts : [Date.parse(c.created_at) || 0];
    return { ...c, pays: p, dels: d, videos: v, paid: p.reduce((s, x) => s + Number(x.amount || 0), 0),
             shorts: d.length + v.filter(x => x.delivered_at).length, left, last: Math.max(...times),
             working: st("received") + st("editing") + st("revision"), ready: st("ready"), firstPaid: p.length ? Math.min(...p.map(x => x.paid_at)) : null };
  }).sort((a, b) => b.last - a.last);
  return { clients, pay, vs };
}
const clientState = c => c.working ? ["In edit", "st-editing"] : c.ready ? ["Waiting on client", "st-ready"] : c.left ? ["Has credits", "st-received"]
  : c.paid ? (Date.now() - c.last < 30 * 864e5 ? ["Active", "st-approved"] : ["Quiet 30d+", "st-revision"]) : c.portalOnly ? ["Signed up", "st-received"] : ["No Stripe record", "st-revision"];

async function team() {
  if (!ME.is_admin) { location.hash = "#/"; return; }
  const { clients, pay, vs } = await crm();
  const ok = pay.filter(x => !x.refunded);
  const rev = ok.reduce((s, x) => s + Number(x.amount || 0), 0);
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const revM = ok.filter(x => x.paid_at >= +month).reduce((s, x) => s + Number(x.amount || 0), 0);
  const waitingUs = vs.filter(v => ["received", "editing", "revision"].includes(v.status)).sort((a, b) => a.created_at - b.created_at);
  const waitingThem = vs.filter(v => v.status === "ready");
  const who = uid => clients.find(c => c.user_id === uid) || {};
  const row = (v, right) => `<a class="trow" href="#/v/${v.id}"><span><b>${esc(v.title)}</b><span class="small muted">${esc(who(v.user_id).name || "")}</span></span><span class="row">${chip(v.status)}<span class="small muted">${right}</span></span></a>`;
  const recent = ok.slice().sort((a, b) => b.paid_at - a.paid_at).slice(0, 6);
  view.innerHTML = head("Overview", `Founders only · ${today()}`) + `
    <div class="grid kpis">
      <div class="card kpi hero"><span class="k-l">Revenue, all time</span><span class="k-ic">${icon("bolt")}</span><span class="k-v">${money(rev)}</span><span class="k-s">${money(revM)} this month · Stripe</span></div>
      <a class="card kpi" href="#/clients"><span class="k-l">Paying clients</span><span class="k-ic t-gold">${icon("star")}</span><span class="k-v" data-count="${clients.filter(c => c.paid).length}">0</span><span class="k-s">${clients.filter(c => c.paid && Date.now() - c.last < 30 * 864e5).length} active in 30 days</span></a>
      <a class="card kpi" href="#/admin"><span class="k-l">Waiting on us</span><span class="k-ic t-violet">${icon("clock")}</span><span class="k-v" data-count="${waitingUs.length}">0</span><span class="k-s">portal orders to edit or fix</span></a>
      <div class="card kpi"><span class="k-l">Videos delivered</span><span class="k-ic t-green">${icon("check")}</span><span class="k-v" data-count="${clients.reduce((s, c) => s + c.shorts, 0)}">0</span><span class="k-s">Drive + portal, all clients</span></div>
    </div>
    <div class="grid two">
      <div class="card"><div class="sec-h"><h2>Latest payments</h2><a href="#/clients">All clients →</a></div>
        ${recent.length ? `<div class="tlist">${recent.map(p => { const c = clients.find(x => x.id === p.client_id) || {}; return `<a class="trow" href="#/client/${c.id}"><span><b>${esc(c.name || p.payer_name || "Unknown")}</b><span class="small muted">${shortDate(p.paid_at)}${p.package ? " · " + esc(p.package) : ""}</span></span><span class="mono">${money(p.amount)}</span></a>`; }).join("")}</div>` : `<p class="small muted">No payments yet.</p>`}</div>
      <div class="card"><div class="sec-h"><h2>Waiting</h2></div>
        <p class="label" style="margin:0 0 8px">On us</p>${waitingUs.length ? `<div class="tlist">${waitingUs.map(v => row(v, "since " + ago(v.created_at))).join("")}</div>` : `<p class="small muted">Nothing waiting. Nice.</p>`}
        <p class="label" style="margin:16px 0 8px">On clients</p>${waitingThem.length ? `<div class="tlist">${waitingThem.map(v => row(v, "delivered " + ago(v.delivered_at))).join("")}</div>` : `<p class="small muted">No Shorts waiting for approval.</p>`}</div>
    </div>`;
}

async function clients() {
  if (!ME.is_admin) { location.hash = "#/"; return; }
  const { clients } = await crm();
  view.innerHTML = head("Clients", `${clients.filter(c => c.paid).length} paying · ${money(clients.reduce((s, c) => s + c.paid, 0))} all time`, `<input id="q" class="search" placeholder="Search name, email or show">`) + `
    <div class="card tablebox"><table><thead><tr><th>Client</th><th>Paid</th><th>Videos done</th><th>Channels</th><th>Status</th><th>Last activity</th></tr></thead><tbody>
    ${clients.map(c => { const [st, cls] = clientState(c);
      return `<tr class="crow" data-q="${esc((c.name + " " + (c.emails || []).join(" ") + " " + (c.show || "")).toLowerCase())}" data-href="#/client/${c.id}">
        <td><b style="color:var(--ink)">${esc(c.name)}</b><br><span class="small muted">${esc(c.show || (c.emails || [])[0] || "")}</span></td>
        <td class="mono">${money(c.paid)}<br><span class="small muted">${c.pays.length} payment${c.pays.length === 1 ? "" : "s"}</span></td>
        <td class="mono">${c.shorts}${c.working ? ` <span class="small muted">+${c.working} in edit</span>` : ""}${c.left ? `<br><span class="small muted">${c.left} credits left</span>` : ""}</td>
        <td><div class="row">${linkOut(c.youtube, "YouTube")}${linkOut(c.instagram, "Instagram")}${!c.youtube && !c.instagram ? `<span class="small muted">add →</span>` : ""}</div></td>
        <td><span class="chip ${cls}">${st}</span></td><td class="small muted">${ago(c.last)}</td></tr>`; }).join("") || `<tr><td colspan="6" class="muted">No clients yet.</td></tr>`}
    </tbody></table></div>`;
  view.querySelectorAll(".crow").forEach(r => r.onclick = e => { if (!e.target.closest("a")) location.hash = r.dataset.href; });
  $("#q").oninput = e => { const q = e.target.value.toLowerCase(); view.querySelectorAll(".crow").forEach(r => r.hidden = !r.dataset.q.includes(q)); };
}

async function clientPage(id) {
  if (!ME.is_admin) { location.hash = "#/"; return; }
  const { clients } = await crm();
  const c = clients.find(x => x.id === id);
  if (!c) { view.innerHTML = `<div class="card empty"><h3>Client not found</h3></div>`; return; }
  const urls = await Promise.all(c.videos.map(v => api.playable(v)));
  const [st, cls] = clientState(c);
  const orders = [...new Set(c.dels.map(d => d.order_name))];
  const field = (k, label, ph) => `<label for="f-${k}">${label}</label><input id="f-${k}" data-k="${k}" value="${esc(c[k] || "")}" placeholder="${ph}">`;
  view.innerHTML = `<a href="#/clients" class="back">← Clients</a>` + head(esc(c.name), `${esc(c.show || "")}${c.show ? " · " : ""}${esc((c.emails || []).join(", "))} · <span class="chip ${cls}">${st}</span>`,
      `<div class="row">${linkOut(c.youtube, "YouTube ↗")}${linkOut(c.instagram, "Instagram ↗")}${linkOut(c.website, "Website ↗")}</div>`) + `
    <div class="grid kpis">
      <div class="card kpi hero"><span class="k-l">Paid, all time</span><span class="k-ic">${icon("bolt")}</span><span class="k-v">${money(c.paid)}</span><span class="k-s">${c.pays.length} payment${c.pays.length === 1 ? "" : "s"} · client since ${shortDate(c.firstPaid)}</span></div>
      <div class="card kpi"><span class="k-l">Videos delivered</span><span class="k-ic t-green">${icon("check")}</span><span class="k-v" data-count="${c.shorts}">0</span><span class="k-s">${orders.length ? orders.length + " order folder" + (orders.length === 1 ? "" : "s") + " in Drive" : "via the portal"}</span></div>
      <div class="card kpi"><span class="k-l">In edit</span><span class="k-ic t-violet">${icon("clock")}</span><span class="k-v" data-count="${c.working}">0</span><span class="k-s">${c.ready} waiting for approval</span></div>
      <div class="card kpi"><span class="k-l">Credits left</span><span class="k-ic t-gold">${icon("film")}</span><span class="k-v" data-count="${c.left}">0</span><span class="k-s">${c.user_id ? "portal account linked" : "no portal account yet"}</span></div>
    </div>
    <div class="grid two">
      <div class="stack">
        ${c.videos.length ? `<div class="card"><div class="sec-h"><h2>Portal Shorts</h2></div><div class="vlist">${c.videos.map((v, i) => videoCard(v, urls[i])).join("")}</div></div>` : ""}
        <div class="card"><div class="sec-h"><h2>Delivered videos</h2><span class="small muted">${c.dels.length} in Drive</span></div>
          ${c.dels.length ? orders.map(o => `<p class="label" style="margin:14px 0 8px">${esc(o)}</p><div class="tlist">${c.dels.filter(d => d.order_name === o).sort((a, b) => (a.delivered_at || 0) - (b.delivered_at || 0)).map(d =>
            `<button class="trow vrow" data-play="${esc(d.id)}"><span><b>${esc(d.title)}</b><span class="small muted">${shortDate(d.delivered_at)}${d.duration_s ? " · " + fmtTime(d.duration_s) : ""}</span></span><span class="row"><span class="small muted">Play</span>${icon("film")}</span></button>`).join("")}</div>`).join("")
            : `<p class="small muted">No Drive deliveries on file.</p>`}</div>
      </div>
      <div class="stack">
        <div class="card"><div class="sec-h"><h2>Payments</h2></div>
          ${c.pays.length ? `<div class="tlist">${c.pays.slice().sort((a, b) => b.paid_at - a.paid_at).map(p => `<div class="trow"><span><b>${money(p.amount)}</b><span class="small muted">${shortDate(p.paid_at)}${p.package ? " · " + esc(p.package) : ""}${p.description ? " · " + esc(p.description) : ""}</span></span><span class="small muted">Stripe</span></div>`).join("")}</div>` : `<p class="small muted">No payments yet.</p>`}</div>
        ${c.portalOnly ? "" : `<div class="card"><div class="sec-h"><h2>Details</h2><span class="small muted" id="saved"></span></div>
          ${field("youtube", "YouTube channel", "https://youtube.com/@…")}${field("instagram", "Instagram", "https://instagram.com/…")}${field("website", "Website", "https://…")}
          ${field("show", "Show / brand", "")}${field("niche", "Niche", "e.g. fitness coach")}
          <label for="f-notes">Notes</label><textarea id="f-notes" data-k="notes" placeholder="Style, preferences, what they like…">${esc(c.notes || "")}</textarea></div>`}
        ${c.portalOnly || !api.crmNotes ? "" : await notesCard("client_id", c.id)}
        ${c.user_id ? `<div class="card"><div class="sec-h"><b style="color:var(--ink);font-size:14px">Add a portal pack by hand</b></div>
          <p class="small muted" style="margin:0 0 10px">For a payment made outside the portal, so they can upload and order.</p>
          <div class="row">${CFG.packs.map(p => `<button class="btn btn-line btn-sm" data-add="${p.id}">+ ${p.videos} (${money(p.price)})</button>`).join("")}</div></div>` : ""}
      </div>
    </div>`;
  if (!c.portalOnly && api.crmNotes) bindNotes({ client_id: c.id });
  view.querySelectorAll("[data-k]").forEach(inp => inp.onchange = async () => {
    try { await api.updateClient(c.id, { [inp.dataset.k]: inp.value.trim() || null }); $("#saved").textContent = "Saved ✓"; } catch (err) { toast(err.message); }
  });
  view.querySelectorAll("[data-play]").forEach(b => b.onclick = () => {
    const { close } = overlay(`<div class="pm-in single"><div class="screen pm-screen" style="max-width:340px;margin:0 auto"><iframe src="https://drive.google.com/file/d/${encodeURIComponent(b.dataset.play)}/preview" allow="autoplay" style="width:100%;aspect-ratio:9/16;border:0;border-radius:25px;background:#000"></iframe></div>
      <button class="linkish pm-skip" data-close style="margin:18px auto 0">Close</button></div>`);
  });
  view.querySelectorAll("[data-add]").forEach(b => b.onclick = async () => {
    const pack = CFG.packs.find(p => p.id === b.dataset.add);
    b.setAttribute("aria-busy", "true");
    try { await api.addPurchase(c.user_id, pack); toast(`${pack.videos} credit${pack.videos > 1 ? "s" : ""} added for ${c.name}`); route(); }
    catch (err) { toast(err.message); b.removeAttribute("aria-busy"); }
  });
}

/* ---------------- founders, part 2: live outreach, today, funnel & money, leads (supabase/crm_live.sql) ----------------
   Instantly numbers come from the instantly-sync function every 10 min; the pipeline (Samples tab), today's follow-ups and
   Drive deliveries come from scripts/crm_sync.py every hour. */
const pct = (a, b) => b ? (100 * a / b).toFixed(a && a / b < 0.1 ? 1 : 0) + "%" : "—";
const localDay = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Vilnius" });
const synced = (st, name) => { const s = st.find(x => x.name === name); return !s ? "not synced yet" : s.ok ? `updated ${ago(Date.parse(s.ran_at))}` : `⚠ sync failed ${ago(Date.parse(s.ran_at))}: ${esc(s.detail)}`; };
const pipeChip = s => { const k = (s || "").toUpperCase();
  const cls = /WON|DONE|PAID/.test(k) ? "st-approved" : /HOT/.test(k) ? "st-revision" : /DELIVER|PUBLIC/.test(k) ? "st-ready" : /LOST|STOP/.test(k) ? "st-lost" : /YES|CLAIM|BUILD/.test(k) ? "st-editing" : "st-received";
  return `<span class="chip ${cls}">${esc(s || "—")}</span>`; };
const leadHref = e => `#/lead/${encodeURIComponent(e)}`;
const lastDays = n => [...Array(n)].map((_, i) => localDay(new Date(Date.now() - (n - 1 - i) * 864e5)));
const bars = (rows, val, part, tip) => { const mx = Math.max(1, ...rows.map(val));
  return `<div class="bars">${rows.map(r => `<div class="bar" title="${esc(tip(r))}"><i style="height:${100 * val(r) / mx}%">${part ? `<b style="height:${val(r) ? 100 * part(r) / val(r) : 0}%"></b>` : ""}</i><span>${esc(r.label)}</span></div>`).join("")}</div>`; };
const liveOnly = () => { if (api.live) return false; view.innerHTML = head("Founders", "This page needs the live portal (Supabase)."); return true; };

const noteRow = (n, link = "") => { const late = n.due_at && !n.done && n.due_at < localDay();
  return `<div class="trow note${n.done ? " done" : ""}"><label class="nchk"><input type="checkbox" data-done="${n.id}"${n.done ? " checked" : ""}>
    <span><b>${esc(n.body)}</b><span class="small muted">${esc(n.author || "")} · ${shortDate(Date.parse(n.created_at))}${link ? ` · <a href="${link}">open</a>` : ""}</span></span></label>
    ${n.due_at ? `<span class="chip ${n.done ? "st-approved" : late ? "st-revision" : "st-received"}">${late ? "overdue · " : "due "}${shortDate(Date.parse(n.due_at))}</span>` : ""}</div>`; };
async function notesCard(col, val) {
  const ns = await api.crmNotes(col, val);
  return `<div class="card"><div class="sec-h"><h2>Notes &amp; to-dos</h2><span class="small muted">${ns.filter(n => !n.done).length} open</span></div>
    <form id="nf" class="nform"><textarea id="nb" placeholder="Add a note, or a to-do with a due date…" required></textarea>
      <div class="row"><label for="nd" class="small muted" style="margin:0">Due</label><input id="nd" type="date"><button class="btn btn-dark btn-sm">Add</button></div></form>
    ${ns.length ? `<div class="tlist">${ns.map(noteRow).join("")}</div>` : `<p class="small muted">No notes yet.</p>`}</div>`;
}
function bindNotes(base) {
  const f = $("#nf");
  if (f) f.onsubmit = async e => { e.preventDefault();
    try { await api.addCrmNote({ ...base, body: $("#nb").value.trim(), due_at: $("#nd").value || null, author: ME.name || ME.email }); route(); } catch (err) { toast(err.message); } };
  view.querySelectorAll("[data-done]").forEach(c => c.onchange = async () => { try { await api.updateCrmNote(c.dataset.done, { done: c.checked }); route(); } catch (err) { toast(err.message); } });
}

async function outreach() {
  if (!ME.is_admin) { location.hash = "#/"; return; }
  if (liveOnly()) return;
  const [camps, daily, inbox, iday, st] = await Promise.all(["campaign_live", "campaign_daily", "inbox_live", "inbox_daily", "sync_status"].map(t => api.live(t)));
  const d0 = localDay(), wk = lastDays(7), days14 = lastDays(14);
  const dayOf = (cid, d) => daily.find(x => x.campaign_id === cid && x.day === d) || {};
  const perDay = c => Math.min(c.daily_max_leads || 0, c.uncontacted || 0);
  const sum = (xs, f) => xs.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const cap = sum(camps, c => c.daily_max_leads), queue = sum(camps, c => c.uncontacted), going = sum(camps, perDay);
  const sentT = sum(camps, c => dayOf(c.campaign_id, d0).sent), newT = sum(camps, c => dayOf(c.campaign_id, d0).new_leads), repT = sum(camps, c => dayOf(c.campaign_id, d0).replies);
  view.innerHTML = head("Outreach", `Live from Instantly · ${synced(st, "instantly")}`) + `
    <div class="grid kpis">
      <div class="card kpi hero"><span class="k-l">New leads per day</span><span class="k-ic">${icon("bolt")}</span><span class="k-v" data-count="${going}">0</span><span class="k-s">daily cap ${cap} · ${queue < cap ? "queue is shorter than the cap" : "queue covers the cap"}</span></div>
      <div class="card kpi"><span class="k-l">Queue, not emailed yet</span><span class="k-ic t-gold">${icon("film")}</span><span class="k-v" data-count="${queue}">0</span><span class="k-s">${going ? `≈ ${Math.floor(queue / Math.max(1, cap))} day${Math.floor(queue / Math.max(1, cap)) === 1 ? "" : "s"} at the full cap` : "add leads"}</span></div>
      <div class="card kpi"><span class="k-l">Sent today</span><span class="k-ic t-violet">${icon("up")}</span><span class="k-v" data-count="${sentT}">0</span><span class="k-s">${newT} new leads started</span></div>
      <div class="card kpi"><span class="k-l">Replies today</span><span class="k-ic t-green">${icon("check")}</span><span class="k-v" data-count="${repT}">0</span><span class="k-s">people, auto-replies left out</span></div>
    </div>
    <div class="grid two">${camps.sort((a, b) => a.name.localeCompare(b.name)).map(c => {
      const rows = days14.map(d => ({ ...dayOf(c.campaign_id, d), label: d.slice(8), day: d }));
      const br = c.new_contacted ? c.bounced / c.new_contacted : 0;
      return `<div class="card"><div class="sec-h"><h2>${esc(c.name)}</h2><span class="small muted">${c.inboxes} inboxes</span></div>
        <div class="mrow"><span>New leads per day</span><b class="mono">${perDay(c)} <span class="small muted">of ${c.daily_max_leads ?? "—"} cap</span></b></div>
        <div class="mrow"><span>Queue</span><b class="mono">${c.uncontacted} <span class="small muted">of ${c.leads_total} loaded</span></b></div>
        <div class="mrow"><span>Leads contacted</span><b class="mono">${c.new_contacted}</b></div>
        <div class="mrow"><span>Human replies</span><b class="mono">${c.replies} <span class="small muted">${pct(c.replies, c.new_contacted)}</span></b></div>
        <div class="mrow"><span>Bounce rate</span><b class="mono ${br > .015 ? "bad" : ""}">${pct(c.bounced, c.new_contacted)} <span class="small muted">${c.bounced} bounced</span></b></div>
        <p class="label" style="margin:16px 0 6px">Last 14 days · sent (dark = new leads)</p>
        ${bars(rows, r => r.sent || 0, r => r.new_leads || 0, r => `${r.day}: ${r.sent || 0} sent · ${r.new_leads || 0} new leads · ${r.replies || 0} replies`)}</div>`; }).join("")}</div>
    <div class="card tablebox" style="margin-top:16px"><div class="sec-h" style="padding:16px 18px 0"><h2>Inboxes</h2><span class="small muted">last 7 days</span></div>
      <table><thead><tr><th>Inbox</th><th>Sent today</th><th>Sent 7d</th><th>Replies 7d</th><th>Bounces 7d</th><th>Warmup</th><th>Limit/day</th></tr></thead><tbody>
      ${inbox.sort((a, b) => (b.campaigns.length - a.campaigns.length) || a.email.localeCompare(b.email)).map(i => {
        const w = iday.filter(x => x.email === i.email && wk.includes(x.day)), t = iday.find(x => x.email === i.email && x.day === d0) || {};
        const s7 = sum(w, x => x.sent), b7 = sum(w, x => x.bounced);
        return `<tr><td><b style="color:var(--ink)">${esc(i.email)}</b><br><span class="small muted">${i.campaigns.length ? esc(i.campaigns.map(n => n.split(" —")[0]).join(", ")) : "warming, not in a campaign"}</span></td>
          <td class="mono">${t.sent || 0}</td><td class="mono">${s7}</td><td class="mono">${sum(w, x => x.replies)}</td>
          <td class="mono ${s7 && b7 / s7 > .015 ? "bad" : ""}">${b7}${s7 ? ` <span class="small muted">${pct(b7, s7)}</span>` : ""}</td>
          <td class="mono">${i.warmup_score ?? "—"}</td><td class="mono">${i.daily_limit ?? "—"}</td></tr>`; }).join("")}
      </tbody></table></div>`;
}

async function todayPage() {
  if (!ME.is_admin) { location.hash = "#/"; return; }
  if (liveOnly()) return;
  const [items, notes, st, { clients }] = await Promise.all([api.live("today_items", "at"), api.openNotes(), api.live("sync_status"), crm()]);
  const d0 = localDay(), due = notes.filter(n => n.due_at <= d0);
  const time = t => t ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Vilnius" }) : "";
  const list = (kinds, empty) => { const xs = items.filter(i => kinds.includes(i.kind));
    return xs.length ? `<div class="tlist">${xs.map(i => `<a class="trow" href="${i.lead_email ? leadHref(i.lead_email) : "#/today"}"><span><b>${esc(i.title)}</b><span class="small muted">${esc(i.detail || "")}</span></span><span class="small muted mono">${time(i.at)}</span></a>`).join("")}</div>` : `<p class="small muted">${empty}</p>`; };
  const month = Date.now() - 30 * 864e5;
  const PACK = { short_1: 1, short_3: 3, short_4: 4, short_5: 5 };
  const paidWork = clients.map(c => { const ps = c.pays.filter(p => p.paid_at >= month); if (!ps.length) return null;
    const from = Math.min(...ps.map(p => p.paid_at)), bought = ps.reduce((s, p) => s + (PACK[p.package] || 0), 0);
    const files = c.dels.filter(d => (d.delivered_at || 0) >= from - 864e5).length + c.videos.filter(v => v.delivered_at >= from).length;
    return { c, bought, files, from, indexed: c.dels.length > 0 || c.videos.length > 0 }; }).filter(Boolean).sort((a, b) => (a.files >= a.bought) - (b.files >= b.bought) || b.from - a.from);
  view.innerHTML = head("Today", `${today()} · follow-ups + pipeline ${synced(st, "sheet")}`) + `
    <div class="grid two">
      <div class="stack">
        <div class="card"><div class="sec-h"><h2>Calls &amp; next actions</h2><span class="small muted">due today</span></div>${list(["call", "action"], "Nothing scheduled for today.")}</div>
        <div class="card"><div class="sec-h"><h2>Follow-ups going out</h2><span class="small muted">16:00 run</span></div>${list(["followup"], "No follow-ups queued for today.")}</div>
        <div class="card"><div class="sec-h"><h2>Samples due</h2></div>${list(["sample_due"], "No samples due today.")}</div>
      </div>
      <div class="stack">
        <div class="card"><div class="sec-h"><h2>To-dos due</h2><span class="small muted">${due.length} open</span></div>
          ${due.length ? `<div class="tlist">${due.map(n => noteRow(n, n.client_id ? "#/client/" + n.client_id : leadHref(n.lead_email))).join("")}</div>` : `<p class="small muted">No to-dos due. Add them from a lead or client page.</p>`}</div>
        <div class="card"><div class="sec-h"><h2>Paid work, last 30 days</h2><span class="small muted">Shorts bought vs files delivered since</span></div>
          ${paidWork.length ? `<div class="tlist">${paidWork.map(w => `<a class="trow" href="#/client/${w.c.id}"><span><b>${esc(w.c.name)}</b><span class="small muted">paid ${shortDate(w.from)}</span></span>
            ${w.indexed ? `<span class="chip ${w.bought && w.files >= w.bought ? "st-approved" : "st-editing"}">${w.files}/${w.bought || "?"} delivered</span>` : `<span class="chip st-lost">${w.bought || "?"} bought · not indexed</span>`}</a>`).join("")}</div>` : `<p class="small muted">No payments in the last 30 days.</p>`}</div>
      </div>
    </div>`;
  bindNotes({});
}

async function funnel() {
  if (!ME.is_admin) { location.hash = "#/"; return; }
  if (liveOnly()) return;
  const [camps, pipe, { clients, pay }] = await Promise.all([api.live("campaign_live"), api.live("pipeline"), crm()]);
  const sum = (xs, f) => xs.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const paidEmails = new Set(clients.filter(c => c.paid).flatMap(c => c.emails || []));
  const steps = [
    ["Emails sent", sum(camps, c => c.emails_sent)], ["Leads contacted", sum(camps, c => c.new_contacted)], ["Human replies", sum(camps, c => c.replies)],
    ["Said yes to a sample", pipe.filter(p => p.yes_at).length], ["Sample delivered", pipe.filter(p => p.delivered_at).length],
    ["Paid", pipe.filter(p => p.paid || paidEmails.has(p.email)).length]];
  const ok = pay.filter(p => !p.refunded), amt = p => Number(p.amount || 0);
  const mStart = k => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - k); return +d; };
  const months = [5, 4, 3, 2, 1, 0].map(k => ({ from: mStart(k), to: k ? mStart(k - 1) : Infinity, label: new Date(mStart(k)).toLocaleDateString("en-GB", { month: "short" }) }));
  months.forEach(m => m.v = ok.filter(p => p.paid_at >= m.from && p.paid_at < m.to).reduce((s, p) => s + amt(p), 0));
  const wStart = k => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * k); return +d; };
  const weeks = [7, 6, 5, 4, 3, 2, 1, 0].map(k => ({ from: wStart(k), to: wStart(k) + 7 * 864e5, label: shortDate(wStart(k)) }));
  weeks.forEach(w => w.v = ok.filter(p => p.paid_at >= w.from && p.paid_at < w.to).reduce((s, p) => s + amt(p), 0));
  const payers = clients.filter(c => c.pays.length), repeat = payers.filter(c => c.pays.length > 1);
  const total = ok.reduce((s, p) => s + amt(p), 0), thisM = months[5].v, lastM = months[4].v;
  view.innerHTML = head("Funnel & money", "Instantly (live) · Samples tab · Stripe") + `
    <div class="grid kpis">
      <div class="card kpi hero"><span class="k-l">Revenue this month</span><span class="k-ic">${icon("bolt")}</span><span class="k-v">${money(thisM)}</span><span class="k-s">${money(lastM)} last month · ${money(total)} all time</span></div>
      <div class="card kpi"><span class="k-l">Average order</span><span class="k-ic t-gold">${icon("bag")}</span><span class="k-v">${money(ok.length ? total / ok.length : 0)}</span><span class="k-s">${ok.length} payments</span></div>
      <div class="card kpi"><span class="k-l">Repeat buyers</span><span class="k-ic t-green">${icon("star")}</span><span class="k-v" data-count="${repeat.length}">0</span><span class="k-s">${pct(repeat.length, payers.length)} of ${payers.length} paying clients</span></div>
      <div class="card kpi"><span class="k-l">Reply → paid</span><span class="k-ic t-violet">${icon("check")}</span><span class="k-v">${pct(steps[5][1], steps[2][1])}</span><span class="k-s">${steps[5][1]} paid from ${steps[2][1]} human replies</span></div>
    </div>
    <div class="grid two">
      <div class="card"><div class="sec-h"><h2>Funnel</h2><span class="small muted">sample steps tracked since 10-12</span></div>
        <div class="funnel">${steps.map(([l, v], i) => `<div class="fstep"><div class="fbar" style="width:${Math.max(4, 100 * Math.log1p(v) / Math.log1p(Math.max(1, steps[0][1])))}%"></div>
          <span><b>${l}</b><span class="small muted">${i ? pct(v, steps[i - 1][1]) + " of the step before" : "all time"}</span></span><b class="mono">${v.toLocaleString("en-US")}</b></div>`).join("")}</div></div>
      <div class="stack">
        <div class="card"><div class="sec-h"><h2>Revenue by month</h2></div>${bars(months, m => m.v, null, m => `${m.label}: ${money(m.v)}`)}</div>
        <div class="card"><div class="sec-h"><h2>Revenue by week</h2></div>${bars(weeks, w => w.v, null, w => `week of ${w.label}: ${money(w.v)}`)}</div>
      </div>
    </div>`;
}

async function leads() {
  if (!ME.is_admin) { location.hash = "#/"; return; }
  if (liveOnly()) return;
  const [pipe, st] = await Promise.all([api.live("pipeline"), api.live("sync_status")]);
  const ts = p => Date.parse(p.last_reply_at || p.delivered_at || p.yes_at || 0) || 0;
  pipe.sort((a, b) => ts(b) - ts(a));
  view.innerHTML = head("Leads", `${pipe.length} sample &amp; hot leads · Samples tab ${synced(st, "sheet")}`, `<input id="q" class="search" placeholder="Search name, email, show or status">`) + `
    <div class="card tablebox"><table><thead><tr><th>Lead</th><th>Status</th><th>Inbox</th><th>Sample</th><th>Next action</th><th>Paid</th></tr></thead><tbody>
    ${pipe.map(p => `<tr class="crow" data-q="${esc([p.name, p.email, p.show, p.status, p.inbox].join(" ").toLowerCase())}" data-href="${leadHref(p.email)}">
      <td><b style="color:var(--ink)">${esc(p.name || p.email)}</b><br><span class="small muted">${esc(p.show || p.email)}</span></td>
      <td>${pipeChip(p.status)}</td><td class="small">${esc((p.inbox || "").split("@")[0])}<br><span class="muted">${esc(p.owner || "")}</span></td>
      <td class="small muted">${p.delivered_at ? "delivered " + shortDate(Date.parse(p.delivered_at)) : p.yes_at ? "yes " + shortDate(Date.parse(p.yes_at)) : "—"}</td>
      <td class="small">${esc((p.next_action || "").slice(0, 90))}${p.next_action_at ? `<br><span class="muted">${shortDate(Date.parse(p.next_action_at))}</span>` : ""}</td>
      <td class="small">${p.paid ? `<span class="chip st-approved">${esc(p.paid.split("·")[1] || "paid")}</span>` : "—"}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">No leads synced yet.</td></tr>`}
    </tbody></table></div>`;
  view.querySelectorAll(".crow").forEach(r => r.onclick = () => location.hash = r.dataset.href);
  $("#q").oninput = e => { const q = e.target.value.toLowerCase(); view.querySelectorAll(".crow").forEach(r => r.hidden = !r.dataset.q.includes(q)); };
}

async function leadPage(email) {
  if (!ME.is_admin) { location.hash = "#/"; return; }
  if (liveOnly()) return;
  const p = (await api.live("pipeline")).find(x => x.email === email);
  if (!p) { view.innerHTML = `<a href="#/leads" class="back">← Leads</a><div class="card empty"><h3>Lead not found</h3></div>`; return; }
  const when = (l, t) => `<div class="mrow"><span>${l}</span><b class="mono">${t ? new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Vilnius" }) : "—"}</b></div>`;
  view.innerHTML = `<a href="#/leads" class="back">← Leads</a>` + head(esc(p.name || p.email), `${esc(p.show || "")}${p.show ? " · " : ""}${esc(p.email)} · ${pipeChip(p.status)}`,
      `<div class="row">${linkOut(p.drive_link, "Sample ↗")}</div>`) + `
    <div class="grid two">
      <div class="stack">
        <div class="card"><div class="sec-h"><h2>Pipeline</h2><span class="small muted">${esc(p.owner || "")} · ${esc(p.inbox || "")}</span></div>
          ${when("Said yes", p.yes_at)}${when("Sample due", p.due_at)}${when("Delivered", p.delivered_at)}${when("Last reply", p.last_reply_at)}
          <div class="mrow"><span>Paid</span><b class="mono">${esc(p.paid || "—")}</b></div></div>
        <div class="card"><div class="sec-h"><h2>Next action</h2><span class="small muted">${p.next_action_at ? shortDate(Date.parse(p.next_action_at)) : ""}</span></div><p style="margin:0">${esc(p.next_action || "—")}</p>
          ${p.notes ? `<p class="label" style="margin:16px 0 6px">Sheet notes</p><p class="small" style="margin:0;white-space:pre-wrap">${esc(p.notes)}</p>` : ""}</div>
      </div>
      <div class="stack">${await notesCard("lead_email", p.email)}</div>
    </div>`;
  bindNotes({ lead_email: p.email });
}

function account() {
  view.innerHTML = head("Account", esc(ME.email)) + `<div class="card" style="max-width:520px"><p style="margin:0 0 14px">Signed in as <b style="color:var(--ink)">${esc(ME.name || ME.email)}</b>.</p>
    <button class="btn btn-line" id="lo2">${icon("out")}Sign out</button></div>`;
  $("#lo2").onclick = async () => { await api.signOut(); ME = W = null; location.hash = "#/login"; };
}

async function render() {
  try { ME = ME || await api.user(); } catch { ME = null; }
  const h = location.hash || "#/";
  if (!ME) return authView(h === "#/login" ? "login" : "signup");
  if (h === "#/login" || h === "#/signup") { location.hash = "#/"; return; }
  view.style.maxWidth = ""; view.style.padding = "";
  W = await wallet(ME.id);
  chrome(true);
  window.scrollTo(0, 0);
  if (h === "#/new") await newVideo();
  else if (h === "#/shorts") await shorts();
  else if (h === "#/packs") packs();
  else if (h === "#/admin") await admin();
  else if (h === "#/team") await team();
  else if (h === "#/clients") await clients();
  else if (h.startsWith("#/client/")) await clientPage(h.slice(9));
  else if (h === "#/today") await todayPage();
  else if (h === "#/outreach") await outreach();
  else if (h === "#/funnel") await funnel();
  else if (h === "#/leads") await leads();
  else if (h.startsWith("#/lead/")) await leadPage(decodeURIComponent(h.slice(7)));
  else if (h === "#/account") account();
  else if (h.startsWith("#/v/")) await videoPage(h.slice(4));
  else await dashboard();
  enhance();
}
function route() {
  if (document.startViewTransition && !REDUCE && ME) return document.startViewTransition(render);
  return render();
}
window.addEventListener("hashchange", route);
route();
})();
