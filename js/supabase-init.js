// Pinned to an exact version rather than the `@2` range it used to import.
// A range means the CDN decides which code runs in every visitor's browser,
// and this module holds the auth client — a bad release, or a compromised
// registry entry, would be running with the session token in hand and
// nothing here would look any different. An exact version is a version
// somebody chose. Bump it deliberately, and check the release notes when
// you do.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { supabaseConfig } from './supabase-config.js';

export const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
