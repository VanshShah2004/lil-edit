import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

// ─── Analytics tracking (views + live presence) ───────────────────────────────
// Write-only beacons feeding the admin analytics platform:
//   • trackProductView — one beacon per PDP view (per variant), with the source
//     of the visit derived from the previous in-app route.
//   • startHeartbeat   — presence ping (~30s, visible tabs only) powering the
//     Live dashboard's "Live Visitors".
// Everything here is fire-and-forget and must never affect the storefront:
// failures only console.warn, and requests ride `keepalive` so a navigation
// mid-flight doesn't cancel them.

const VISITOR_ID_KEY = "le_vid";

// Random, non-PII device id. Persisted so a guest's views/searches/heartbeats
// correlate across sessions; logged-in requests also carry the auth token, so
// the backend attributes user_id when it can.
export function getVisitorId(): string {
  try {
    let vid = localStorage.getItem(VISITOR_ID_KEY);
    if (!vid || !/^[A-Za-z0-9_-]{8,72}$/.test(vid)) {
      vid = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
      localStorage.setItem(VISITOR_ID_KEY, vid);
      console.log(`[track] minted visitor id ${vid}`);
    }
    return vid;
  } catch {
    // Storage unavailable (private mode with blocked storage) — session-scoped id.
    return sessionFallbackId;
  }
}
const sessionFallbackId = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

async function getAccessToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function postBeacon(path: string, body: Record<string, unknown>): Promise<void> {
  try {
    const token = await getAccessToken();
    await fetch(`${getBackendBaseUrl()}${path}`, {
      method: "POST",
      // keepalive lets the request outlive a page navigation (sendBeacon can't
      // carry the Authorization header, so fetch+keepalive is the right tool).
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn(`[track] beacon ${path} failed (non-fatal):`, err);
  }
}

// ─── Route memory → view source ───────────────────────────────────────────────
// RouteTracker (App.tsx) records each in-app path here; a PDP mount then derives
// WHERE the visit came from by classifying the previous route. This keeps source
// attribution in one place instead of threading state through every product link.

let previousPath: string | null = null;
let currentPath: string | null = null;

export function recordRouteChange(pathname: string): void {
  if (pathname === currentPath) return;
  previousPath = currentPath;
  currentPath = pathname;
}

export type ViewSource =
  | "direct" | "search" | "collection" | "home" | "wishlist"
  | "cart" | "spotlight" | "share" | "recommendation" | "other";

function deriveSource(): ViewSource {
  const prev = previousPath;
  if (prev === null) {
    // Fresh page load — an external referrer that isn't us means a shared link.
    try {
      if (document.referrer && new URL(document.referrer).origin !== window.location.origin) return "share";
    } catch { /* unparsable referrer */ }
    return "direct";
  }
  if (prev === "/") return "home";
  if (prev.startsWith("/search")) return "search";
  if (prev.includes("/product/")) return "recommendation"; // PDP → PDP (recommendations rail)
  if (prev.startsWith("/collections")) return "collection";
  if (prev.startsWith("/wishlist")) return "wishlist";
  if (prev.startsWith("/cart") || prev.startsWith("/checkout")) return "cart";
  return "other";
}

// ─── Product views ────────────────────────────────────────────────────────────
// Dedupe: React StrictMode double-mounts and refetch re-renders must not double
// count, but switching variants (new sku) is a genuine new view.
let lastViewKey = "";
let lastViewAt = 0;
const VIEW_DEDUPE_MS = 10_000;

export function trackProductView(slug: string, sku: string | undefined, categorySlug?: string): void {
  if (!slug) return;
  const key = `${slug}$${sku ?? ""}`;
  const now = Date.now();
  if (key === lastViewKey && now - lastViewAt < VIEW_DEDUPE_MS) return;
  lastViewKey = key;
  lastViewAt = now;

  const source = deriveSource();
  console.log(`[track] view  slug=${slug}  sku=${sku ?? "∅"}  source=${source}`);
  void postBeacon("/api/track/view", {
    visitorId: getVisitorId(),
    slug,
    sku: sku || undefined,
    categorySlug: categorySlug || undefined,
    source,
  });
}

// ─── Live presence heartbeat ──────────────────────────────────────────────────
const HEARTBEAT_MS = 30_000;
let heartbeatTimer: number | null = null;

function ping(): void {
  const path = window.location.pathname;
  // Admins watching dashboards aren't shoppers — don't count them as live visitors.
  if (path.startsWith("/admin")) return;
  void postBeacon("/api/track/heartbeat", { visitorId: getVisitorId(), path });
}

// Idempotent — safe to call from an effect that may run twice (StrictMode).
export function startHeartbeat(): () => void {
  if (heartbeatTimer !== null) return stopHeartbeat;

  ping(); // immediate, so a fresh visitor shows up live right away
  heartbeatTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") ping();
  }, HEARTBEAT_MS);

  // Coming back to the tab counts as being live again immediately.
  document.addEventListener("visibilitychange", onVisible);
  console.log("[track] heartbeat started");
  return stopHeartbeat;
}

function onVisible(): void {
  if (document.visibilityState === "visible") ping();
}

function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  document.removeEventListener("visibilitychange", onVisible);
}
