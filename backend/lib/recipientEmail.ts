// Resolve the customer's email for a notification. Prefers the profiles.email passed in;
// falls back to the Supabase auth email (auth.users) when that's blank — the customer
// authenticated to place the order, so an auth identity email always exists. This closes
// the "no profiles.email → email silently dropped" gap: a missing or cleared profile email
// can no longer swallow a confirmation receipt or status notification.
//
// Never throws. Returns "" only when the address is truly unresolvable (no profile email
// AND no service-role client / no auth email), which callers already handle as no_recipient.

import { supabaseAdmin } from "./supabase.js";
import type { OpLogger } from "./logger.js";

export async function resolveRecipientEmail(
  userId: string,
  profileEmail: string | null | undefined,
  log: OpLogger,
): Promise<string> {
  const fromProfile = (profileEmail ?? "").trim();
  if (fromProfile) return fromProfile;

  // profiles.email is blank — read the auth identity's email. auth.admin is privileged, so
  // it needs the service-role client; without it we can't reach auth.users.
  if (!supabaseAdmin) {
    log.warn(`recipient email: profiles.email empty and no service-role client to read auth email (user=${userId})`);
    return "";
  }
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error) {
      log.warn(`recipient email: auth lookup failed for ${userId}: ${error.message}`);
      return "";
    }
    const authEmail = (data.user?.email ?? "").trim();
    if (authEmail) log.step(`recipient email: profiles.email empty → using auth email for ${userId}`);
    else log.warn(`recipient email: no email on profile OR auth identity for ${userId}`);
    return authEmail;
  } catch (e) {
    log.warn(`recipient email: auth lookup threw for ${userId}: ${e instanceof Error ? e.message : String(e)}`);
    return "";
  }
}
