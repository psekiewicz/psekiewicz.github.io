import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseConfig } from './supabase-config.js';

export const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
