// Stripe → BEJÚ CRM + portal credits. Stripe calls this on checkout.session.completed (any of our payment links).
// 1. find or create the client (by email, else by name), 2. record the payment (keyed by Stripe charge id, so the
// hourly crm_sync.py never duplicates it), 3. if the payer has a portal account (client_reference_id from the portal's
// buy button, else the same email) and the link is a Shorts pack (metadata.package short_N), add N credits.
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const crypto = Stripe.createSubtleCryptoProvider();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, req.headers.get("stripe-signature") ?? "", Deno.env.get("STRIPE_WEBHOOK_SECRET")!, undefined, crypto);
  } catch (_) {
    return new Response("bad signature", { status: 400 });
  }
  if (event.type !== "checkout.session.completed") return new Response("ignored");
  const s = event.data.object as Stripe.Checkout.Session;
  if (s.payment_status !== "paid") return new Response("not paid");

  const email = (s.customer_details?.email ?? "").toLowerCase();
  const name = s.customer_details?.name || email || "Unknown payer";
  const pkg = s.metadata?.package ?? "";
  let chargeId = s.id;
  if (typeof s.payment_intent === "string") {
    const pi = await stripe.paymentIntents.retrieve(s.payment_intent);
    if (typeof pi.latest_charge === "string") chargeId = pi.latest_charge;
  }

  // client: by email, else by name (people pay from a second address), else new
  let client = email ? (await sb.from("clients").select("*").contains("emails", [email]).limit(1)).data?.[0] : null;
  if (!client) client = (await sb.from("clients").select("*").ilike("name", name).limit(1)).data?.[0] ?? null;
  if (!client) {
    client = (await sb.from("clients").insert({ name, emails: email ? [email] : [], source: "Stripe" }).select().single()).data;
  } else if (email && !client.emails.includes(email)) {
    await sb.from("clients").update({ emails: [...client.emails, email] }).eq("id", client.id);
  }

  await sb.from("payments").upsert({
    id: chargeId, client_id: client?.id ?? null, email: email || null, payer_name: name, amount: (s.amount_total ?? 0) / 100,
    currency: s.currency ?? "usd", package: pkg || null, paid_at: new Date(s.created * 1000).toISOString(),
  });

  // portal credits for Shorts packs
  let uid: string | null = s.client_reference_id && UUID.test(s.client_reference_id) ? s.client_reference_id : null;
  if (uid && !(await sb.from("profiles").select("id").eq("id", uid).limit(1)).data?.length) uid = null;
  if (!uid && email) uid = (await sb.from("profiles").select("id").eq("email", email).limit(1)).data?.[0]?.id ?? null;
  const m = /^short_(\d+)$/.exec(pkg);
  if (uid && m) {
    await sb.from("purchases").upsert({ user_id: uid, pack_id: pkg, videos: Number(m[1]), amount: (s.amount_total ?? 0) / 100, stripe_session: s.id },
                                      { onConflict: "stripe_session" });
  }
  if (uid && client && !client.user_id) await sb.from("clients").update({ user_id: uid }).eq("id", client.id);
  return new Response("ok");
});
