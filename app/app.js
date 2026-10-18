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
const SAMPLE_CLIPS = ["../work/01.mp4", "../rail-01.mp4", "../rail-05.mp4", "../rail-06.mp4", "../rail-08.mp4"];
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
let ME = null;
function setNav() {
  $("#nav").hidden = !ME; $("#nav-admin").hidden = !(ME && ME.is_admin);
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === (location.hash || "#/")));
}

function authView(mode = "signup") {
  view.innerHTML = `
  <div class="auth card">
    <h1>${mode === "signup" ? "Create your account" : "Welcome back"}</h1>
    <p class="muted small">Your Shorts, your packs and your changes, all in one place.</p>
    <div class="tabs"><button data-m="signup" class="${mode === "signup" ? "on" : ""}">Sign up</button><button data-m="login" class="${mode === "login" ? "on" : ""}">Log in</button></div>
    <form id="af">
      ${mode === "signup" ? `<label for="n">Your name</label><input id="n" required autocomplete="name">` : ""}
      <label for="e">Email</label><input id="e" type="email" required autocomplete="email">
      <label for="p">Password</label><input id="p" type="password" required minlength="8" autocomplete="${mode === "signup" ? "new-password" : "current-password"}">
      <p style="margin-top:var(--s-5)"><button class="btn-gold" style="width:100%">${mode === "signup" ? "Create account" : "Log in"}</button></p>
      <p class="small muted" id="aerr" role="alert"></p>
    </form>
  </div>`;
  view.querySelectorAll(".tabs button").forEach(b => b.onclick = () => authView(b.dataset.m));
  $("#af").onsubmit = async e => {
    e.preventDefault(); const btn = e.submitter; btn.setAttribute("aria-busy", "true");
    try {
      ME = mode === "signup" ? await api.signUp($("#e").value, $("#p").value, $("#n").value) : await api.signIn($("#e").value, $("#p").value);
      if (!ME) { $("#aerr").textContent = "Check your inbox to confirm your email, then log in."; return; }
      location.hash = "#/"; route();
    } catch (err) { $("#aerr").textContent = err.message; } finally { btn.removeAttribute("aria-busy"); }
  };
}

function packCards(w) {
  return CFG.packs.map(p => `
    <div class="card pack ${p.best ? "best" : ""}">${p.best ? `<span class="tag">Best value</span>` : ""}
      <h3>${esc(p.name)}</h3><div class="price">$${p.price}</div>
      <p class="muted small">${p.videos} Short${p.videos > 1 ? "s" : ""} · $${(p.price / p.videos).toFixed(0)} each · back within 24 h</p>
      <button class="btn-${p.best ? "gold" : "glass"}" data-buy="${p.id}">Buy ${p.videos > 1 ? p.videos + " Shorts" : "1 Short"}</button>
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
  return `<a class="vcard" href="#/v/${v.id}">
    <div class="thumb">${url ? `<video src="${esc(url)}#t=0.5" muted playsinline preload="metadata"></video>` : `<div class="ph">${v.status === "received" ? "We have your footage" : "Being edited"}</div>`}</div>
    <div class="spread" style="margin-top:var(--s-2)"><b style="color:var(--ink)">${esc(v.title)}</b><span class="pill st-${v.status}">${STATUS[v.status]}</span></div></a>`;
}

async function dashboard() {
  const w = await wallet(ME.id);
  const urls = await Promise.all(w.videos.map(v => api.playable(v)));
  const pct = w.total ? Math.round((w.total - w.left) / w.total * 100) : 0;
  view.innerHTML = `
  <div class="stack">
    <div class="spread"><div><p class="label">Your studio</p><h1>Hi ${esc(ME.name || "there")}</h1></div>
      ${w.left ? `<a class="btn-gold" href="#/new">Start a new Short</a>` : ""}</div>
    <div class="grid g2">
      <div class="card"><p class="label">Credits</p>
        <div class="credits"><b>${w.left}</b><span>Short${w.left === 1 ? "" : "s"} left</span></div>
        ${w.total ? `<div class="meter"><i style="width:${pct}%"></i></div><p class="small muted">${w.total - w.left} of ${w.total} used${w.expires ? ` · use them within <b style="color:var(--ink)">${days(w.expires - Date.now())} days</b>` : ""}</p>`
                  : `<p class="small muted">No pack yet. Pick one below and your credits show up here right away.</p>`}
      </div>
      <div class="card"><p class="label">How it works</p>
        <p class="small">1. Buy a pack. 2. Upload your video and tell us what you want. 3. Your Short shows up here within 24 h. Watch it, approve it, or ask for changes at the exact second.</p></div>
    </div>
    <section><h2>Your Shorts</h2>
      ${w.videos.length ? `<div class="vlist">${w.videos.map((v, i) => videoCard(v, urls[i])).join("")}</div>`
        : `<div class="card empty"><h3>Nothing here yet</h3><p class="muted">Your first Short will play right here.</p>${w.left ? `<a class="btn-gold" href="#/new">Upload your first video</a>` : ""}</div>`}
    </section>
    <section id="packs"><h2>${w.left ? "Need more?" : "Pick your pack"}</h2><div class="grid g3">${packCards(w)}</div>
      <p class="small muted">Twice your usual views or your money back on Short packs. Packs are valid for ${CFG.creditDays} days.</p></section>
  </div>`;
  bindBuy(view, dashboard);
}

async function newVideo() {
  const w = await wallet(ME.id);
  if (!w.left) { view.innerHTML = `<div class="card empty"><h2>You're out of credits</h2><p class="muted">Pick a pack to start your next Short.</p><div class="grid g3" style="text-align:left">${packCards(w)}</div></div>`; bindBuy(view, newVideo); return; }
  view.innerHTML = `
  <div class="card" style="max-width:40rem;margin:0 auto">
    <p class="label">New Short · ${w.left} credit${w.left === 1 ? "" : "s"} left</p><h1>Upload your video</h1>
    <form id="nf">
      <label for="t">What should we call it?</label><input id="t" required placeholder="e.g. Episode 42, the part about sleep">
      <label for="f">Your footage</label><input id="f" type="file" accept="video/*">
      <label for="no">What do you want? (the moment, the hook, the vibe)</label><textarea id="no" placeholder="Start at 12:30 where I talk about…"></textarea>
      <p style="margin-top:var(--s-5)"><button class="btn-gold">Send to our editors</button></p>
    </form></div>`;
  $("#nf").onsubmit = async e => {
    e.preventDefault(); const btn = e.submitter; btn.setAttribute("aria-busy", "true");
    try { const v = await api.createVideo(ME.id, w.next.id, $("#t").value, $("#no").value, $("#f").files[0]); toast("Got it. Your editors are on it."); location.hash = `#/v/${v.id}`; }
    catch (err) { toast(err.message); btn.removeAttribute("aria-busy"); }
  };
}

async function videoPage(id) {
  const v = await api.video(id);
  if (!v || (v.user_id !== ME.id && !ME.is_admin)) { view.innerHTML = `<div class="card empty"><h2>Not found</h2></div>`; return; }
  const [url, notes, w] = await Promise.all([api.playable(v), api.notes(id), wallet(v.user_id)]);
  const left = v.delivered_at ? CFG.revisionHours * 36e5 - (Date.now() - v.delivered_at) : 0;
  const canChange = v.status === "ready" && left > 0;
  view.innerHTML = `
  <p><a href="#/" class="small">← All Shorts</a></p>
  <div class="player">
    <div>${url ? `<video id="pv" src="${esc(url)}" controls playsinline></video>` : `<div class="thumb"><div class="ph">${v.status === "received" ? "We have your footage. Your editor starts soon." : "Your editor is working on it. It shows up here when it's ready."}</div></div>`}</div>
    <div class="stack">
      <div><span class="pill st-${v.status}">${STATUS[v.status]}</span><h1 style="margin-top:var(--s-3)">${esc(v.title)}</h1>
        ${v.notes ? `<p class="small muted">Your brief: ${esc(v.notes)}</p>` : ""}</div>
      ${v.status === "ready" ? `
        <div class="card"><h3>Happy with it?</h3>
          <div class="row"><button class="btn-gold" id="approve">Approve</button>${url ? `<a class="btn-glass" href="${esc(url)}" download>Download</a>` : ""}</div>
          ${canChange ? `<p class="small muted" style="margin-top:var(--s-4)">Want a change? Pause at the exact second, write it below. You can ask for changes for another ${Math.ceil(left / 36e5)} h.</p>
          <form id="cf"><div class="row"><button type="button" class="ts" id="at">at 0:00</button></div>
          <textarea id="ct" required placeholder="e.g. Cut this pause, make the caption bigger"></textarea>
          <p><button class="btn-glass">Add change</button> <button type="button" class="btn-glass" id="sendrev">Send changes to editor</button></p></form>` : ""}
        </div>` : ""}
      ${v.status === "approved" ? `<div class="card upsell"><h3>Make it a series</h3><p class="small">${w.left ? `You still have ${w.left} credit${w.left === 1 ? "" : "s"}. Keep the momentum going.` : "Your next 5 Shorts, back within 24 h each."}</p>
        ${w.left ? `<a class="btn-gold" href="#/new">Start the next one</a>` : `<button class="btn-gold" data-buy="short_5">5 more Shorts · $75</button>`}</div>` : ""}
      <div><h3>Changes</h3>${notes.length ? `<ul class="notes">${notes.map(n => `<li><button class="ts" data-t="${n.at}">${fmtTime(n.at)}</button> ${esc(n.text)}</li>`).join("")}</ul>` : `<p class="small muted">No changes requested.</p>`}</div>
    </div>
  </div>`;
  const pv = $("#pv");
  view.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { if (pv) { pv.currentTime = +b.dataset.t; pv.play(); } });
  if (pv && $("#at")) pv.ontimeupdate = () => $("#at").textContent = `at ${fmtTime(pv.currentTime)}`;
  if ($("#cf")) $("#cf").onsubmit = async e => { e.preventDefault(); await api.addNote(id, ME.id, pv ? pv.currentTime : 0, $("#ct").value); videoPage(id); };
  if ($("#sendrev")) $("#sendrev").onclick = async () => { if (!notes.length) return toast("Add at least one change first."); await api.update(id, { status: "revision" }); toast("Sent. Your editor is on it."); videoPage(id); };
  if ($("#approve")) $("#approve").onclick = async () => { await api.update(id, { status: "approved" }); toast("Approved. Nice one."); videoPage(id); };
  bindBuy(view, () => videoPage(id));
}

async function admin() {
  if (!ME.is_admin) { location.hash = "#/"; return; }
  const [vs, us] = await Promise.all([api.videos(null), api.users()]);
  const who = id => (us.find(u => u.id === id) || {}).email || id;
  view.innerHTML = `
  <h1>Orders</h1><p class="muted small">Every client's Shorts. Move them along; deliver a finished file and it plays in the client's portal.</p>
  <div class="tablebox"><table><thead><tr><th>Client</th><th>Short</th><th>Footage</th><th>Status</th><th></th></tr></thead><tbody>
  ${vs.map(v => `<tr><td>${esc(who(v.user_id))}</td><td><a href="#/v/${v.id}">${esc(v.title)}</a></td><td class="small">${esc(v.footage || "—")}</td>
    <td><span class="pill st-${v.status}">${STATUS[v.status]}</span></td>
    <td class="row">${v.status === "received" || v.status === "revision" ? `<button class="btn-glass btn-sm" data-edit="${v.id}">Start edit</button>` : ""}
      ${v.status !== "approved" ? (LIVE ? `<label class="btn-glass btn-sm">Deliver file<input type="file" accept="video/mp4" data-del="${v.id}" hidden></label>` : `<button class="btn-gold btn-sm" data-demo="${v.id}">Deliver (demo clip)</button>`) : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No orders yet.</td></tr>`}
  </tbody></table></div>`;
  view.querySelectorAll("[data-edit]").forEach(b => b.onclick = async () => { await api.update(b.dataset.edit, { status: "editing" }); admin(); });
  view.querySelectorAll("[data-demo]").forEach(b => b.onclick = async () => { await api.deliver(b.dataset.demo); toast("Delivered"); admin(); });
  view.querySelectorAll("[data-del]").forEach(i => i.onchange = async () => { toast("Uploading…"); await api.deliver(i.dataset.del, i.files[0]); toast("Delivered"); admin(); });
}

async function route() {
  ME = ME || await api.user();
  setNav();
  const h = location.hash || "#/";
  if (!ME) return authView(h === "#/login" ? "login" : "signup");
  if (h === "#/new") return newVideo();
  if (h === "#/admin") return admin();
  if (h.startsWith("#/v/")) return videoPage(h.slice(4));
  if (h === "#/portfolio") { view.innerHTML = `<div class="card empty"><h2>Portfolio pages are coming</h2><p class="muted">Soon you'll get your own page of the Shorts you choose to show.</p></div>`; return; }
  return dashboard();
}
$("#logout").onclick = async () => { await api.signOut(); ME = null; location.hash = "#/login"; route(); };
window.addEventListener("hashchange", route);
route();
})();
