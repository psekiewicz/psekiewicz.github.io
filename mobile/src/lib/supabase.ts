import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// The same public project URL + anon key the website uses (js/supabase-config.js).
// Safe to ship in a client binary for exactly the reason they're safe to ship in
// client-side JS: they identify the project, they don't grant anything. The Row
// Level Security policies in schema.sql are what actually enforce access, and
// they apply identically to a request from this app.
export const SUPABASE_URL = 'https://tgikpcvkkkbkqtahmczt.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnaWtwY3Zra2tia3F0YWhtY3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MDc3NjAsImV4cCI6MjEwMjE4Mzc2MH0.xphJ9crDXfddBJmIsB0x78vU1fMrpcuiiyGB-bDDOMg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // The web build leans on localStorage; there isn't one here, so the session
    // is persisted to AsyncStorage instead. Without this the user is signed out
    // every cold start.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL to parse a magic-link fragment out of in a native app.
    detectSessionInUrl: false,
  },
});

// Supabase's auto-refresh runs on a timer, and Android freezes timers for a
// backgrounded app. Without this the first request after a long background
// stint goes out with a stale token and fails; stopping and restarting the
// refresher around foreground transitions is the documented fix.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
