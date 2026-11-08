// BEJÚ client portal config. Empty Supabase values = DEMO mode (data lives in this browser only).
// The anon key is public by design (row-level security protects the data); never put the service-role key here.
window.BEJU_CONFIG = {
  supabaseUrl: "https://zfnpvcrnujxlycmqukqs.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmbnB2Y3JudWp4bHljbXF1a3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMjMyNzgsImV4cCI6MjEwNzg5OTI3OH0.1MT1RtPT_REhVtekoLRga_BRvlxZnWSzwUF-Z_S314Y",
  // Stripe Payment Links. The portal appends ?prefilled_email=…&client_reference_id=<user id>,
  // and the stripe-webhook function turns the payment into credits on that account.
  packs: [   // 11-08: current menu (Simas 11-04 price rule: monthly plans first, $150 Starter for "no budget")
    { id: "short_5_150", name: "Starter", videos: 5, price: 150, link: "https://buy.stripe.com/00w8wP9n47AEgpU7YC5EY0S" },
    { id: "monthly_daily_400", name: "Daily Reels", videos: 30, price: 400, monthly: true, link: "https://buy.stripe.com/aFa00j42K7AEa1wfr45EY0M", best: true,
      perks: ["A new Short every day (30 a month)", "You post them", "Changes within 48 h"] },
    { id: "dfy_daily_600", name: "Done For You", videos: 30, price: 600, monthly: true, link: "https://buy.stripe.com/3cI00jar87AE5Lgfr45EY0X",
      perks: ["A Reel every day", "We post them for you", "Captions + hashtags handled"] },
    { id: "dfy_max_growth_1000", name: "Max Growth", videos: 60, price: 1000, monthly: true, link: "https://buy.stripe.com/dRm5kD7eW2gk4Hc7YC5EY0V",
      perks: ["2 Reels a day, posted for you", "Account built + lead magnet", "Monthly report"] },
  ],
  creditDays: 14,      // packs expire 14 days after purchase (Benas 10-18)
  revisionHours: 48,   // change requests within 48 h of delivery (Benas 10-18)
};
