// Open Graph / Twitter Card generation for product link previews.
//
// When a PDP URL is shared (WhatsApp, Telegram, Facebook, iMessage, Slack, X…),
// the receiving app's crawler fetches the URL and reads <meta> tags to build the
// preview card. SPAs return an empty shell to crawlers (no JS execution), so the
// product photo/title/price never appear. These helpers produce the tags from a
// product row; they're consumed both by the standalone /share route and by the
// optional SPA HTML injection in server.ts.
import type { PdpProductRow } from "./persistCatalog.js";

const SITE_NAME = "The Lil Edit";

export interface OgMeta {
  title: string;
  description: string;
  image: string;        // absolute URL (Supabase public URLs already are)
  url: string;          // canonical storefront PDP URL
  siteName: string;
  price?: number | null;
  currency?: string;
  type?: string;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Collapse whitespace and cap length so the description sits well in a preview card.
function truncate(s: string, max = 200): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// Pick the best image for the shared SKU: the matching variant's primary/first
// image (so the shared colour is shown), else a global (non-variant) primary/first
// image, else any image at all.
function resolveImage(product: PdpProductRow, sku: string): string {
  const images = (product.product_images ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (images.length === 0) return "";

  const pick = (list: typeof images): string =>
    list.find((i) => i.is_primary)?.image_url || list[0]?.image_url || "";

  const variant = (product.product_variants ?? []).find((v) => v.variant_sku === sku);
  if (variant) {
    const variantImg = pick(images.filter((i) => i.variant_id === variant.id));
    if (variantImg) return variantImg;
  }
  return pick(images.filter((i) => !i.variant_id)) || pick(images);
}

export function buildProductOgMeta(product: PdpProductRow, canonicalUrl: string, sku: string): OgMeta {
  const points = (product.description_points ?? []).filter(Boolean);
  const description = points.length
    ? truncate(points.join(" • "))
    : truncate(`${product.title} by ${product.brand}. Shop now at ${SITE_NAME}.`);
  return {
    title: product.title,
    description,
    image: resolveImage(product, sku),
    url: canonicalUrl,
    siteName: SITE_NAME,
    price: product.price,
    currency: "INR",
    type: "product",
  };
}

// The <meta>/<link> block. Indentation-free; callers place it as they need.
export function renderOgMetaTags(meta: OgMeta): string {
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const img = escapeHtml(meta.image);
  const url = escapeHtml(meta.url);
  const site = escapeHtml(meta.siteName);

  const lines = [
    `<meta property="og:type" content="${escapeHtml(meta.type ?? "website")}" />`,
    `<meta property="og:site_name" content="${site}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<link rel="canonical" href="${url}" />`,
  ];
  if (img) {
    lines.push(
      `<meta property="og:image" content="${img}" />`,
      `<meta property="og:image:secure_url" content="${img}" />`,
      `<meta property="og:image:alt" content="${t}" />`,
    );
  }
  if (meta.price != null) {
    lines.push(
      `<meta property="product:price:amount" content="${escapeHtml(String(meta.price))}" />`,
      `<meta property="product:price:currency" content="${escapeHtml(meta.currency ?? "INR")}" />`,
    );
  }
  lines.push(
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
  );
  if (img) lines.push(`<meta name="twitter:image" content="${img}" />`);

  return lines.join("\n    ");
}

// Standalone OG page for the /share route. Crawlers read the tags; real browsers
// are bounced to the canonical PDP via meta-refresh + JS replace.
export function renderShareHtml(meta: OgMeta, redirectUrl: string): string {
  const safeRedirect = escapeHtml(redirectUrl);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(meta.title)} — ${escapeHtml(meta.siteName)}</title>
    ${renderOgMetaTags(meta)}
    <meta http-equiv="refresh" content="0; url=${safeRedirect}" />
    <link rel="icon" type="image/png" href="/logo.png" />
  </head>
  <body>
    <p>Redirecting to <a href="${safeRedirect}">${safeRedirect}</a>…</p>
    <script>location.replace(${JSON.stringify(redirectUrl)});</script>
  </body>
</html>`;
}

// Inject OG tags into an existing index.html (SPA serving path). Swaps the SPA's
// default <title> for the product, then appends the tag block before </head>.
export function injectOgIntoHtml(template: string, meta: OgMeta): string {
  const withTitle = template.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(meta.title)} — ${escapeHtml(meta.siteName)}</title>`,
  );
  return withTitle.replace(/<\/head>/i, `    ${renderOgMetaTags(meta)}\n  </head>`);
}
