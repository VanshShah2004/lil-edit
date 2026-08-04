// Base URL of the customer storefront, used to build "View your order" links in emails.
// Prefer an explicit PUBLIC_SITE_URL; else the first CORS origin; else (dev only) the local
// Vite dev URL. Trailing slash trimmed. Shared by the admin status emails and the order
// confirmation email so the link is derived the same way everywhere.
let warnedMissingSiteUrl = false;

export function publicSiteUrl(): string {
  const explicit = process.env.PUBLIC_SITE_URL?.trim();
  const corsFirst = process.env.CORS_ORIGIN?.split(",")[0]?.trim();
  const resolved = explicit || corsFirst;
  if (resolved) return resolved.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production" && !warnedMissingSiteUrl) {
    warnedMissingSiteUrl = true;
    console.error(
      "CRITICAL: PUBLIC_SITE_URL and CORS_ORIGIN are both unset in production. " +
        "Share links, OG tags, and order emails are falling back to a localhost dev URL. " +
        "Set PUBLIC_SITE_URL on the backend process and restart it.",
    );
  }
  return "http://localhost:5174";
}
