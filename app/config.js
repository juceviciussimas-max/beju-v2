// BEJÚ client portal config. Empty Supabase values = DEMO mode (data lives in this browser only).
// The anon key is public by design (row-level security protects the data); never put the service-role key here.
window.BEJU_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  // Stripe Payment Links. The portal appends ?prefilled_email=…&client_reference_id=<user id>,
  // and the stripe-webhook function turns the payment into credits on that account.
  packs: [
    { id: "short_1", name: "Starter", videos: 1, price: 27, link: "https://buy.stripe.com/6oUcN58j0g7a5Lgfr45EY0r" },
    { id: "short_3", name: "3 Shorts", videos: 3, price: 60, link: "https://buy.stripe.com/fZu7sL42K1cg4Hc6Uy5EY0s" },
    { id: "short_5", name: "5 Shorts", videos: 5, price: 75, link: "https://buy.stripe.com/dRm5kD56O1cgflQbaO5EY0t", best: true },
  ],
  creditDays: 14,      // packs expire 14 days after purchase (Benas 10-18)
  revisionHours: 48,   // change requests within 48 h of delivery (Benas 10-18)
};
