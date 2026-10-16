// An exact version, not `@2`. A range meant every new 2.x release reached
// every visitor the day esm.sh picked it up, with no commit, no review and no
// test - and this is the code that holds everyone's session. 2.118.0 is what
// `@2` was serving when this was pinned, so pinning changed nothing anybody
// runs. To upgrade: change the number, check the site, ship it like any change.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { supabaseConfig } from './supabase-config.js';

export const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
