import {createClient} from '@supabase/supabase-js';

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey=import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =createClient(supabaseUrl,supabaseAnonKey);

// Dev-only: expose the configured client on window so queries can be run from the
// browser console (e.g. verifying the profiles.role DB lock) without copying
// tokens or keys. Stripped from production builds by the import.meta.env.DEV guard.
if (import.meta.env.DEV) {
  (window as unknown as { supabase: typeof supabase }).supabase = supabase;
}


