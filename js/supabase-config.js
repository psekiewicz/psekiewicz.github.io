// ⚠️ REPLACE these placeholder values with your own Supabase project's values.
//
// Where to get them:
//   1. https://supabase.com/dashboard → New project (free tier is enough)
//   2. Project Settings (gear icon) → API → copy the "Project URL" field
//      exactly as shown (e.g. https://xxxx.supabase.co - no /rest/v1 or
//      any other path suffix; the client library appends its own paths),
//      and the "anon" "public" key (NOT the "service_role" key - never
//      put that one in client-side code).
//   3. Run schema.sql (from this repo) in the SQL Editor to create the
//      `projects` table and its Row Level Security policies.
//
// The URL and anon key are safe to expose in client-side code - they
// identify your project and are meant to be public. Real access control
// is enforced by the Row Level Security policies in schema.sql, not by
// hiding these values.
export const supabaseConfig = {
  url: 'https://tgikpcvkkkbkqtahmczt.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnaWtwY3Zra2tia3F0YWhtY3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MDc3NjAsImV4cCI6MjEwMjE4Mzc2MH0.xphJ9crDXfddBJmIsB0x78vU1fMrpcuiiyGB-bDDOMg',
};
