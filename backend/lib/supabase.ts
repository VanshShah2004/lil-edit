import "./loadEnv.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.VITE_SUPABASE_SERVICE_KEY ??
  null;

/** Auth + OTP use the public anon key when set (least privilege). */
const keyForAuth = anonKey;

if (!url || !keyForAuth) {
  throw new Error(
    "backend: set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) in backend/.env"
  );
}

/** Sends OTP and other user-facing Auth calls (server-side). Prefer anon key; service role only if anon is unset. */
export const supabaseAnon: SupabaseClient = createClient(url, keyForAuth, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/** Service role — duplicate checks and future admin-only routes. Never expose to frontend. */

export const supabaseAdmin: SupabaseClient | null = serviceRoleKey
  ? createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  : null;