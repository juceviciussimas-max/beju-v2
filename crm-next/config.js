// BEJÚ founder CRM dashboard: settings. Plain values only; edit and redeploy.
// The anon key is public by design (row-level security protects the data: every CRM table answers only to is_admin()).
// NEVER put the service-role key or any other secret in this file.
window.BEJU_CRM = {
  supabaseUrl: "https://zfnpvcrnujxlycmqukqs.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmbnB2Y3JudWp4bHljbXF1a3FzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMjMyNzgsImV4cCI6MjEwNzg5OTI3OH0.1MT1RtPT_REhVtekoLRga_BRvlxZnWSzwUF-Z_S314Y",
  monthlyGoal: 10000,          // "Road to $10k / month" (Simas 11-12)
  timezone: "Europe/Vilnius",  // every date and time on the page
};
