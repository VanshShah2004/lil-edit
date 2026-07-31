import { supabase } from "@/lib/supabase";

/**
 * Authorization header for privileged (admin) backend calls.
 *
 * Returns an empty object when there is no active session, so callers can always
 * spread the result into a headers object unconditionally:
 *
 *     headers: { "Content-Type": "application/json", ...(await authHeader()) }
 *
 * The backend's requireAuth + requireAdmin middleware validates the bearer token
 * and the caller's role, so these calls now fail with 401/403 if the token is
 * missing or the user is not an admin.
 */
export async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  console.log(`[apiAuth] authHeader → token ${token ? `present (…${token.slice(-6)})` : "MISSING — request will be 401"}`);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
