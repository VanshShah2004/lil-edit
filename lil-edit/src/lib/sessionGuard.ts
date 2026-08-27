import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

// ─── Dead-session guard ──────────────────────────────────────────────────────
// A Supabase session can be revoked SERVER-side (signed out elsewhere, session
// timebox, sessions cleared in the dashboard) while the browser still holds a
// perfectly well-formed access token. `supabase.auth.getSession()` only refreshes
// on EXPIRY, not on revocation, so it keeps handing that dead token to every API
// call and the backend keeps answering 401 (`Auth session missing!`).
//
// Nothing in the app noticed. A page like General Settings, which mounts five
// independent panels that each do their own authenticated GET, would show five
// "Couldn't load…" cards at once — indistinguishable from five broken features
// when the real answer is "you are logged out".
//
// This installs ONE fetch interceptor rather than threading a check through the
// ~14 per-file `authFetch` helpers and the ~9 `authHeader()` call sites: a single
// install point, and a new API helper added later is covered automatically
// instead of silently missing the check.

let installed = false;
// Single-flight latch. The exact bug this exists for fires FIVE concurrent 401s,
// and we want one sign-out and one redirect, not five of each.
let handling = false;

/** True when this request was aimed at our own Express API (not Supabase, not assets). */
function isOwnApiRequest(url: string): boolean {
  try {
    // getBackendBaseUrl() is "" in production (same-origin) and an absolute
    // localhost URL in dev, so resolve both against the page origin.
    const base = getBackendBaseUrl();
    const apiOrigin = base ? new URL(base).origin : window.location.origin;
    const target = new URL(url, window.location.origin);
    if (target.origin !== apiOrigin) return false;
    if (!target.pathname.startsWith("/api/")) return false;
    // /api/auth is the login/OTP surface. A 401 there is part of signing IN, and
    // reacting to it risks a sign-out↔login loop. A dead session shows up on the
    // very next cart/admin call anyway.
    if (target.pathname.startsWith("/api/auth")) return false;
    return true;
  } catch {
    return false;
  }
}

/** `/login?redirect=…`, reusing the convention Login.tsx already honours. */
function loginUrl(): string {
  const here = `${window.location.pathname}${window.location.search}`;
  // Same shape Login.tsx validates against: a single-slash absolute path only.
  const safe = here.startsWith("/") && !here.startsWith("//") ? here : "/";
  return `/login?redirect=${encodeURIComponent(safe)}`;
}

async function handleDeadSession(url: string): Promise<void> {
  if (handling) return;

  // Only a request we KNOW carried a session can prove the session is dead. A
  // logged-out shopper hitting an authenticated cart/wishlist route gets a 401 by
  // design — bouncing them to a login screen they never asked for would be wrong.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return;

  handling = true;
  console.warn(
    `[sessionGuard] 401 from ${url} while holding a token (…${session.access_token.slice(-6)}) — the Supabase session was revoked server-side. Signing out.`,
  );

  try {
    // scope:"local" — the server-side session is ALREADY gone, so a global sign-out
    // would just fail on the network. Local clears storage and fires SIGNED_OUT so
    // AuthContext drops the user immediately.
    await supabase.auth.signOut({ scope: "local" });
  } catch (err) {
    console.error("[sessionGuard] signOut failed; clearing anyway", err);
  }

  // Already on the login screen? Nothing to navigate to — release the latch so a
  // later dead session is still caught.
  if (window.location.pathname === "/login") {
    handling = false;
    return;
  }

  const target = loginUrl();
  console.warn(`[sessionGuard] redirecting to ${target}`);
  // replace() so the dead page doesn't sit in history behind the login screen.
  // The full reload also guarantees no stale authed state survives.
  window.location.replace(target);
}

/**
 * Wrap window.fetch so any 401 from our own API, on a request made while a session
 * was held, signs out and redirects to login.
 *
 * The wrapper is deliberately transparent: it never reads the body (which would
 * consume it for the real caller), never changes the resolved Response, and never
 * throws — a fault in the guard must not break the request it was watching.
 */
export function installSessionGuard(): void {
  if (installed) return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await nativeFetch(input, init);
    try {
      if (res.status === 401) {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (isOwnApiRequest(url)) {
          // Fire-and-forget: the caller gets its Response immediately and can render
          // its own error state while the redirect is being arranged.
          void handleDeadSession(url);
        }
      }
    } catch (err) {
      console.error("[sessionGuard] guard threw (ignored)", err);
    }
    return res;
  };

  console.log("[sessionGuard] installed — a 401 from the API with a live token will sign out and redirect to /login");
}
