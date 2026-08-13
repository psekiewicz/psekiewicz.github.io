// ⚠️ REPLACE these placeholder values with your own Supabase project's values.
//
// Where to get them:
//   1. https://supabase.com/dashboard → New project (free tier is enough)
//   2. Project Settings (gear icon) → API → copy "Project URL" and the
//      "anon" "public" key (NOT the "service_role" key — never put that
//      one in client-side code).
//   3. Run schema.sql (from this repo) in the SQL Editor to create the
//      `projects` table and its Row Level Security policies.
//
// The URL and anon key are safe to expose in client-side code — they
// identify your project and are meant to be public. Real access control
// is enforced by the Row Level Security policies in schema.sql, not by
// hiding these values.
export const supabaseConfig = {
  url: 'https://REPLACE_WITH_YOUR_PROJECT.supabase.co',
  anonKey: 'REPLACE_WITH_YOUR_ANON_PUBLIC_KEY',
};
