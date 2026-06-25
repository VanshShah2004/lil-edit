// Base URL of the customer storefront, used to build "View your order" links in emails.
// Prefer an explicit PUBLIC_SITE_URL; else the first CORS origin; else the local Vite dev
// URL. Trailing slash trimmed. Shared by the admin status emails and the order
// confirmation email so the link is derived the same way everywhere.
export function publicSiteUrl(): string {
  const explicit = process.env.PUBLIC_SITE_URL?.trim();
  const corsFirst = process.env.CORS_ORIGIN?.split(",")[0]?.trim();
  return (explicit || corsFirst || "http://localhost:5174").replace(/\/$/, "");
}
