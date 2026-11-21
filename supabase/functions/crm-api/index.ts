// crm-api v1 (11-21): a small, scoped write path into the founders' CRM for the Claudes and scripts.
// Each caller has its OWN key. public.api_keys stores only its SHA-256 hash plus the actions it may run, so a key
// can do only what it was given and can be switched off alone (revoked_at). Every call is logged in public.api_log
// with the caller's name. The rules mirror scripts/crm.py (set_stage), crm_desk.py and founder_tasks.py.
//
//   POST https://<project>.supabase.co/functions/v1/crm-api
//   headers: x-api-key: <key>, Content-Type: application/json
//   body:    {"action": "<name>", "args": {...}}
//
// Deployed with verify_jwt = false: the x-api-key check below IS the authentication.
//
// v2 (11-21): keys can expire (api_keys.expires_at); 60 calls a minute per key (429); every write carries headers
// x-actor = <key name> and x-source = api, so public.audit_log records who changed what; writes that change an existing
// row (prod moving a row, close, lift, task_done) take optional args.if_updated_at = the updated_at you read: if the row
// changed since, the answer is HTTP 409 {error: "changed since you read it", current}. New actions: touch, timeline,
// stage, inbox.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const FU_STAGES = ["asked_price", "sample_sent", "said_yes", "thinking", "parked", "none"];       // crm.py FU_STAGES
const DESK_STAGES = ["queued", "building", "review", "founder_check", "client_check", "ready"];  // crm_desk.py STAGES
const WHO = ["Simas", "Benas", "Both"];
const TOUCH_KINDS = ["call", "meeting", "email", "dm", "loom", "delivery", "decision", "note", "other"];   // touches.kind check
const PER_MINUTE = 60;
// One client per request, so PostgREST sees who is writing (public.crm_actor() / audit_log read these headers).
const dbFor = (actor: string) => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { global: { headers: { "x-actor": actor, "x-source": "api" } }, auth: { persistSession: false } });
type DB = ReturnType<typeof dbFor>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class Bad extends Error { constructor(public status: number, msg: string) { super(msg); } }
class Changed extends Bad { constructor(public current: unknown) { super(409, "changed since you read it"); } }
const bad = (msg: string): never => { throw new Bad(400, msg); };
const json = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

async function sha256hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function str(a: any, k: string, { req = false, max = 2000 } = {}): string | null {
  const v = a?.[k];
  if (v === undefined || v === null || v === "") return req ? bad(`${k} is required`) : null;
  if (typeof v !== "string") bad(`${k} must be text`);
  const t = (v as string).trim();
  if (req && !t) bad(`${k} is required`);
  if (t.length > max) bad(`${k} is longer than ${max} characters`);
  return t || null;
}
function oneOf(v: string | null, allowed: string[], k: string) {
  if (v !== null && !allowed.includes(v)) bad(`${k} must be one of: ${allowed.join(", ")}`);
  return v;
}
function intId(a: any, k = "id") {
  const n = Number(a?.[k]);
  if (!Number.isInteger(n) || n <= 0) bad(`${k} must be a positive whole number`);
  return n;
}
function email(a: any, k: string, req = true): string | null {
  const v = str(a, k, { req, max: 254 });
  if (v === null) return null;
  const e = v.toLowerCase();
  if (!EMAIL.test(e)) bad(`${k} is not an email address`);
  return e;
}
function emails(a: any, k = "emails"): string[] | null {
  const v = a?.[k];
  if (v === undefined || v === null || v === "") return null;
  const list = (Array.isArray(v) ? v : String(v).split(",")).map((x: any) => String(x).trim().toLowerCase()).filter(Boolean);
  if (list.length > 20) bad(`${k}: at most 20 addresses`);
  for (const e of list) if (!EMAIL.test(e)) bad(`${k}: "${e}" is not an email address`);
  return list;
}
// 'YYYY-MM-DD HH:MM' in Europe/Vilnius -> ISO (DST-safe): the same input crm.py and founder_tasks.py take.
function offsetMin(utcMs: number) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Vilnius", hourCycle: "h23", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - utcMs) / 60000;
}
function vilnius(a: any, k: string): string | null {
  const v = str(a, k, { max: 16 });
  if (v === null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(v);
  if (!m) bad(`${k} must be "YYYY-MM-DD HH:MM" (Vilnius time)`);
  const [y, mo, d, h, mi] = m!.slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall;
  for (let i = 0; i < 2; i++) utc = wall - offsetMin(utc) * 60000;
  return new Date(utc).toISOString();
}
// Vilnius "YYYY-MM-DD HH:MM" (like every other time arg here) or an ISO time with a zone.
function when(a: any, k: string): string | null {
  const v = str(a, k, { max: 40 });
  if (v === null) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(v)) return vilnius(a, k);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v) && !isNaN(Date.parse(v))) return new Date(Date.parse(v)).toISOString();
  return bad(`${k} must be "YYYY-MM-DD HH:MM" (Vilnius time) or an ISO time with a zone`);
}
// Optimistic lock: the [ms, ms+1) window matches the stored microsecond value whether the caller sends it back exactly
// or rounded to milliseconds by a JS Date.
function ifUpdated(a: any): [string, string] | null {
  const v = str(a, "if_updated_at", { max: 40 });
  if (v === null) return null;
  const t = Date.parse(v);
  if (isNaN(t)) bad("if_updated_at must be the updated_at value you read (ISO time)");
  return [new Date(t).toISOString(), new Date(t + 1).toISOString()];
}
const sameStamp = (u: string | null, ifu: [string, string]) => !!u && Date.parse(u) === Date.parse(ifu[0]);   // same millisecond
function limitArg(a: any, dflt: number, max: number) {
  if (a?.limit === undefined || a?.limit === null || a?.limit === "") return dflt;
  const n = Number(a.limit);
  if (!Number.isInteger(n) || n < 1 || n > max) bad(`limit must be a whole number from 1 to ${max}`);
  return n;
}
async function must<T = any>(p: PromiseLike<{ data: any; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Bad(500, error.message);
  return data as T;
}
async function closeDesk(db: DB, id: number, note: string, actor: string, kind: "hold" | "production", ifu: [string, string] | null) {
  let q = db.from("desk_items")
    .update({ status: "closed", closed_note: `${note} (${actor})`, closed_at: new Date().toISOString() })
    .eq("id", id).eq("kind", kind).eq("status", "open");
  if (ifu) q = q.gte("updated_at", ifu[0]).lt("updated_at", ifu[1]);
  const rows = await must<any[]>(q.select());
  if (!rows.length) {
    if (ifu) {
      const cur = await must<any[]>(db.from("desk_items").select("*").eq("id", id).eq("kind", kind).limit(1));
      if (cur.length && !sameStamp(cur[0].updated_at, ifu)) throw new Changed(cur[0]);
    }
    throw new Bad(404, `no open ${kind} with id ${id}`);
  }
  return rows[0];
}

const ACTIONS: Record<string, (a: any, actor: string, db: DB) => Promise<unknown>> = {
  // ---- reads
  async lead(a) {   // {email}: the lead's pipeline row + any open hold on that address
    const e = email(a, "email")!;
    const [p, holds] = await Promise.all([
      must<any[]>(sb.from("pipeline").select("*").eq("email", e).limit(1)),
      must<any[]>(sb.from("desk_items").select("id,client,title,set_by,created_at").eq("kind", "hold").eq("status", "open").contains("emails", [e])),
    ]);
    return { pipeline: p[0] ?? null, holds };
  },
  async desk(a) {   // {kind?: "hold"|"production"}: open desk rows
    const kind = oneOf(str(a, "kind", { max: 20 }), ["hold", "production"], "kind");
    let q = sb.from("desk_items").select("*").eq("status", "open").order("created_at");
    if (kind) q = q.eq("kind", kind);
    return await must(q);
  },
  async tasks() {   // open founder tasks
    return await must(sb.from("founder_tasks").select("*").is("done_at", null).order("due_at", { ascending: true, nullsFirst: false }).order("id"));
  },
  // ---- follow-up stage (crm.py set_stage)
  async set_stage(a, _actor, db) {   // {lead, stage, day0?: "YYYY-MM-DD HH:MM", note?}
    const e = email(a, "lead")!;
    const stage = oneOf(str(a, "stage", { req: true, max: 20 }), FU_STAGES, "stage")!;
    const body: Record<string, unknown> = { fu_stage: stage, fu_day0: stage === "none" ? null : (vilnius(a, "day0") ?? new Date().toISOString()) };
    const note = str(a, "note", { max: 1000 });
    if (note !== null) body.fu_note = note;
    const rows = await must<any[]>(db.from("pipeline").update(body).eq("email", e).select("email,fu_stage,fu_day0,fu_note"));
    if (!rows.length) throw new Bad(404, `no pipeline row for ${e}`);
    return rows[0];
  },
  // ---- desk (crm_desk.py)
  async hold(a, actor, db) {   // {client, rule, by: Simas|Benas|Both, emails?, detail?}
    const body = { kind: "hold", client: str(a, "client", { req: true, max: 200 }), title: str(a, "rule", { req: true, max: 1000 }),
      detail: str(a, "detail", { max: 2000 }), emails: emails(a) ?? [], set_by: oneOf(str(a, "by", { req: true, max: 10 }), WHO, "by"), created_by: actor };
    return (await must<any[]>(db.from("desk_items").insert(body).select()))[0];
  },
  async lift(a, actor, db) { return await closeDesk(db, intId(a), str(a, "why", { req: true, max: 500 })!, actor, "hold", ifUpdated(a)); },         // {id, why, if_updated_at?}
  async close(a, actor, db) { return await closeDesk(db, intId(a), str(a, "note", { req: true, max: 500 })!, actor, "production", ifUpdated(a)); },  // {id, note, if_updated_at?}
  async prod(a, actor, db) {   // {client, title, stage, builder?, link?, detail?, waits?, emails?, if_updated_at?}: add, or move the open row with the same client + title
    const client = str(a, "client", { req: true, max: 200 })!, title = str(a, "title", { req: true, max: 300 })!;
    const body: Record<string, unknown> = { stage: oneOf(str(a, "stage", { req: true, max: 20 }), DESK_STAGES, "stage") };
    for (const [k, max] of [["builder", 100], ["link", 1000], ["detail", 2000]] as const) { const v = str(a, k, { max }); if (v !== null) body[k] = v; }
    const waits = oneOf(str(a, "waits", { max: 10 }), WHO, "waits");
    if (waits !== null) body.set_by = waits;
    const em = emails(a);
    if (em) body.emails = em;
    const ifu = ifUpdated(a);
    const open = await must<any[]>(db.from("desk_items").select("id,client,title").eq("kind", "production").eq("status", "open"));
    const cur = open.find((x) => x.client.toLowerCase() === client.toLowerCase() && x.title.toLowerCase() === title.toLowerCase());
    if (cur) {
      let q = db.from("desk_items").update({ ...body, status: "open", closed_at: null }).eq("id", cur.id);
      if (ifu) q = q.gte("updated_at", ifu[0]).lt("updated_at", ifu[1]);
      const rows = await must<any[]>(q.select());
      if (!rows.length) throw new Changed((await must<any[]>(db.from("desk_items").select("*").eq("id", cur.id).limit(1)))[0] ?? null);
      return rows[0];
    }
    return (await must<any[]>(db.from("desk_items").insert({ ...body, kind: "production", client, title, created_by: actor }).select()))[0];
  },
  // ---- founder tasks (founder_tasks.py)
  async task_add(a, actor, db) {   // {title, detail?, who?, lead?, due?: "YYYY-MM-DD HH:MM"}
    const body = { title: str(a, "title", { req: true, max: 300 }), detail: str(a, "detail", { max: 2000 }), who: oneOf(str(a, "who", { max: 10 }), WHO, "who"),
      lead_email: email(a, "lead", false), created_by: actor, due_at: vilnius(a, "due") };
    return (await must<any[]>(db.from("founder_tasks").insert(body).select()))[0];
  },
  async task_done(a, _actor, db) {   // {id, if_updated_at?}
    const id = intId(a), ifu = ifUpdated(a);
    let q = db.from("founder_tasks").update({ done_at: new Date().toISOString() }).eq("id", id).is("done_at", null);
    if (ifu) q = q.gte("updated_at", ifu[0]).lt("updated_at", ifu[1]);
    const rows = await must<any[]>(q.select());
    if (!rows.length) {
      if (ifu) {
        const cur = await must<any[]>(db.from("founder_tasks").select("*").eq("id", id).limit(1));
        if (cur.length && !sameStamp(cur[0].updated_at, ifu)) throw new Changed(cur[0]);
      }
      throw new Bad(404, "no open task with that id");
    }
    return rows[0];
  },
  // ---- touchpoints (11-21): log a call / meeting / email / DM / decision with its next step, right after it happens
  async touch(a, actor, db) {   // {lead, kind, summary, direction?, next_step?, next_at?, status?, scheduled_at?, source?, ref?}
    const body = {
      lead_email: email(a, "lead")!, kind: oneOf(str(a, "kind", { req: true, max: 20 }), TOUCH_KINDS, "kind")!,
      summary: str(a, "summary", { req: true, max: 2000 })!,
      direction: oneOf(str(a, "direction", { max: 10 }), ["in", "out", "internal"], "direction") ?? "out",
      status: oneOf(str(a, "status", { max: 10 }), ["planned", "done", "canceled"], "status") ?? "done",
      next_step: str(a, "next_step", { max: 1000 }), next_at: when(a, "next_at"), scheduled_at: when(a, "scheduled_at"),
      source: str(a, "source", { max: 40 }), ref: str(a, "ref", { max: 500 }), actor,
    };
    if (body.status === "planned" && !body.scheduled_at) bad("a planned touch needs scheduled_at (when it will happen)");
    const ins = await db.from("touches").insert(body).select();
    if (!ins.error) return { touch: ins.data![0], deduped: false };
    if (ins.error.code !== "23505" || !body.ref) throw new Bad(500, ins.error.message);
    // same lead + ref = the same touch: never logged twice. A planned one logged again as done / canceled is completed.
    const ex = (await must<any[]>(db.from("touches").select("*").eq("lead_email", body.lead_email).eq("ref", body.ref).limit(1)))[0];
    if (!ex) throw new Bad(409, "a touch with this ref already exists for this lead");
    if (ex.status === "planned" && body.status !== "planned") {
      const up = await must<any[]>(db.from("touches").update({ status: body.status, summary: body.summary, next_step: body.next_step,
        next_at: body.next_at }).eq("id", ex.id).eq("status", "planned").select());
      if (up.length) return { touch: up[0], deduped: false, completed: true };
    }
    return { touch: ex, deduped: true };
  },
  async timeline(a, _actor, db) {   // {email, limit?}: every touchpoint of the lead, newest first
    return await must(db.from("lead_timeline").select("*").eq("email", email(a, "email")!).order("at", { ascending: false }).limit(limitArg(a, 50, 200)));
  },
  async stage(a, _actor, db) {   // {email}: the evidence-based deal stage + the one next step
    const e = email(a, "email")!;
    const [st, nx] = await Promise.all([
      must<any[]>(db.from("lead_stage").select("*").eq("email", e).limit(1)),
      must<any[]>(db.from("lead_next_step").select("*").eq("email", e).limit(1)),
    ]);
    return { stage: st[0] ?? null, next: nx[0] ?? null };
  },
  async inbox(a, _actor, db) {   // {limit?}: newest CRM notifications (public.crm_events)
    return await must(db.from("crm_events").select("id,at,kind,severity,title,body,lead_email,link,source,actor")
      .order("at", { ascending: false }).order("id", { ascending: false }).limit(limitArg(a, 30, 200)));
  },
  // ---- orders (Benas's side, 11-21; tables in crm_orders1/3.sql). Per Short: delivered -> revision_requested -> revised.
  // Delivered and revised come from the Drive files by themselves; only these facts are logged by hand. Pack size / kind /
  // status fixes are a FOUNDER action in the CRM UI (is_admin + MFA), not an API key action (review 11-21).
  async orders(a, _actor, db) {   // {client?, all?}: order progress (open orders unless all=true) + the problems list
    const client = str(a, "client", { max: 200 });
    let q = db.from("order_progress").select("*").order("opened_at", { ascending: false });
    if (!a?.all) q = q.eq("status", "open");
    if (client) q = q.ilike("client", `%${client.replace(/[%_]/g, "")}%`);
    const [progress, problems] = await Promise.all([must<any[]>(q.limit(200)), must<any[]>(db.from("order_problems").select("*"))]);
    return { progress, problems: client ? problems.filter((p) => String(p.client || "").toLowerCase().includes(client.toLowerCase())) : problems };
  },
  async order_revision(a, _actor, db) {   // {order_id | client, slot, note}: the client asked for a change on Short <slot>
    const item = await orderItem(db, a);
    const note = str(a, "note", { req: true, max: 1000 })!;
    const rows = await must<any[]>(db.from("order_items").update({ revision_asked_at: new Date().toISOString(), revision_base_version: item.last_version, revision_note: note, updated_at: new Date().toISOString() })
      .eq("id", item.id).select());
    return rows[0];
  },
  async order_posted(a, _actor, db) {   // {order_id | client, slot, at?: "YYYY-MM-DD HH:MM"}: Short <slot> is live on their channel
    const item = await orderItem(db, a);
    const at = vilnius(a, "at") ?? new Date().toISOString();
    return (await must<any[]>(db.from("order_items").update({ posted_at: at, updated_at: new Date().toISOString() }).eq("id", item.id).select()))[0];
  },
  // ---- founder approvals (crm_drafts1.sql; BENAS 11-21 lane 3: big deals + scopes, client problems, new terms, big names)
  // A Claude can only CREATE a pending draft and read the list. Approving is a founder action in the CRM (is_admin + MFA);
  // the plain draft-sender sends only the exact approved text, and only if the thread hasn't moved since reply_to_id.
  async draft_create(a, actor, db) {   // {lead, inbox, reply_to_id, category, reason, body}
    const body = { lead_email: email(a, "lead")!, inbox: email(a, "inbox")!, reply_to_id: str(a, "reply_to_id", { req: true, max: 80 })!,
      category: oneOf(str(a, "category", { req: true, max: 20 }), ["big_deal", "client_problem", "new_terms", "big_name", "other"], "category"),
      reason: str(a, "reason", { max: 500 }), body: str(a, "body", { req: true, max: 8000 })!, created_by: actor };
    return (await must<any[]>(db.from("drafts").insert(body).select("id,lead_email,inbox,category,status,created_at")))[0];
  },
  async drafts(a, _actor, db) {   // {all?}: waiting drafts (pending / held / approved); all=true adds the last 50 decided
    if (!a?.all) return await must(db.from("drafts_waiting").select("*"));
    return await must(db.from("drafts").select("id,lead_email,inbox,category,status,created_by,created_at,decided_by,decided_at,sent_at,error")
      .order("created_at", { ascending: false }).limit(50));
  },
};

// The one Short a revision/posted fact is about: by order id, or by the client's exact name when only ONE order has that number.
async function orderItem(db: DB, a: any) {
  const slot = intId(a, "slot");
  let orderId: number | null = a?.order_id !== undefined ? intId(a, "order_id") : null;
  if (orderId === null) {
    const client = str(a, "client", { req: true, max: 200 })!.replace(/[%_]/g, "");
    const cands = await must<any[]>(db.from("order_progress").select("id,client,folder,opened_at").ilike("client", client).order("opened_at", { ascending: false }));
    if (!cands.length) throw new Bad(404, `no orders for a client named "${client}" (exact name, see the orders action)`);
    const names = new Set(cands.map((c) => c.client));
    if (names.size > 1) bad(`"${client}" matches several clients (${[...names].join(", ")}); pass order_id`);
    const hit = await must<any[]>(db.from("order_items").select("order_id").in("order_id", cands.map((c) => c.id)).eq("slot", slot));
    const orders = cands.filter((c) => hit.some((h) => h.order_id === c.id));
    if (!orders.length) throw new Bad(404, `${[...names][0]} has no delivered Short ${slot}`);
    if (orders.length > 1) bad(`Short ${slot} exists in several orders of ${[...names][0]}; pass order_id: ` + orders.map((o) => `${o.id} (${o.folder})`).join(", "));
    orderId = orders[0].id;
  }
  const rows = await must<any[]>(db.from("order_items").select("*").eq("order_id", orderId).eq("slot", slot).limit(1));
  if (!rows.length) throw new Bad(404, `order ${orderId} has no delivered Short ${slot}`);
  return rows[0];
}

async function log(key_name: string, action: string, args: unknown, ok: boolean, status: number, error: string | null) {
  try {
    const s = JSON.stringify(args ?? {});
    await sb.from("api_log").insert({ key_name, action, args: s.length > 4000 ? { truncated: s.slice(0, 4000) } : args, ok, status, error });
  } catch { /* the log never blocks the answer */ }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });
  const key = req.headers.get("x-api-key") ?? "";
  let caller: { id: string; name: string; actions: string[] } | null = null, action = "", args: any = {};
  try {
    if (key.length < 20 || key.length > 200) throw new Bad(401, "missing or bad x-api-key");
    const k = await must<any[]>(sb.from("api_keys").select("id,name,actions,revoked_at,expires_at").eq("key_hash", await sha256hex(key)).limit(1));
    if (!k.length || k[0].revoked_at) throw new Bad(401, "unknown or revoked key");
    if (k[0].expires_at && Date.parse(k[0].expires_at) <= Date.now()) throw new Bad(401, "key expired");
    caller = k[0];
    const { count, error: cErr } = await sb.from("api_log").select("id", { count: "exact", head: true })
      .eq("key_name", caller!.name).gte("at", new Date(Date.now() - 60_000).toISOString());
    if (cErr) throw new Bad(500, cErr.message);
    if ((count ?? 0) >= PER_MINUTE) throw new Bad(429, `rate limit: at most ${PER_MINUTE} calls a minute per key`);
    let body: any;
    try { body = await req.json(); } catch { throw new Bad(400, 'body must be JSON: {"action": "...", "args": {...}}'); }
    action = String(body?.action ?? "");
    args = body?.args ?? {};
    if (typeof args !== "object" || Array.isArray(args)) throw new Bad(400, "args must be an object");
    if (!Object.hasOwn(ACTIONS, action)) throw new Bad(400, `unknown action; known: ${Object.keys(ACTIONS).join(", ")}`);
    if (!caller!.actions.includes(action)) throw new Bad(403, `this key may not run ${action}`);
    const result = await ACTIONS[action](args, caller!.name, dbFor(caller!.name));
    await log(caller!.name, action, args, true, 200, null);
    await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", caller!.id);
    return json(200, { ok: true, result });
  } catch (e) {
    const status = e instanceof Bad ? e.status : 500;
    const msg = e instanceof Error ? e.message : String(e);
    if (caller) await log(caller.name, action, args, false, status, msg);   // calls without a valid key are not logged (no table spam)
    if (e instanceof Changed) return json(409, { ok: false, error: msg, current: e.current });
    return json(status, { ok: false, error: caller || status !== 500 ? msg : "server error" });
  }
});
