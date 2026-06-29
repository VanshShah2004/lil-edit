import { Router, type Request, type Response } from "express";
import { fetchProductBySku } from "../lib/persistCatalog.js";
import { publicSiteUrl } from "../lib/siteUrl.js";
import { buildProductOgMeta, renderShareHtml } from "../lib/ogTags.js";
import { createLog } from "../lib/logger.js";

const router = Router();

// Minimal redirect shell used whenever we can't resolve a product — a broken
// preview must never block the user from reaching the page.
function genericRedirect(url: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
<meta http-equiv="refresh" content="0; url=${url.replace(/"/g, "&quot;")}" />
<title>The Lil Edit</title></head>
<body><script>location.replace(${JSON.stringify(url)});</script></body></html>`;
}

// ─── GET /share/product/:category/:productPath ───────────────────────────────
// productPath is "slug$sku" (same format the PDP route uses). Returns a tiny HTML
// page carrying Open Graph / Twitter tags so link-preview crawlers (WhatsApp,
// Telegram, Facebook, iMessage, Slack, X…) render the product photo, title and
// price. Humans are bounced straight to the canonical PDP.
//
// Host-agnostic: works even when the storefront lives on a separate static host —
// point a bot-targeted rewrite at this route, or share this URL directly.
router.get("/product/:category/:productPath", async (req: Request, res: Response) => {
  const log = createLog().start("OG SHARE");
  const category = String(req.params.category ?? "");
  const productPath = String(req.params.productPath ?? "");
  const sep = productPath.indexOf("$");
  const slug = sep >= 0 ? productPath.slice(0, sep) : productPath;
  const sku = sep >= 0 ? productPath.slice(sep + 1) : "";

  const canonicalUrl = `${publicSiteUrl()}/collections/${category}/product/${productPath}`;

  log.step(`category=${category}  slug=${slug}  sku=${sku}`);

  // Always HTML, cacheable briefly; never throw a broken preview back at a crawler.
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");

  try {
    if (!sku) {
      log.warn("no sku in path — generic redirect").end("OG SHARE");
      res.send(genericRedirect(canonicalUrl));
      return;
    }

    const product = await fetchProductBySku(sku, log);
    if (!product || product.slug !== slug || product.category_slug !== category) {
      log.warn(`no match (found=${!!product}) — generic redirect`).end("OG SHARE");
      res.send(genericRedirect(canonicalUrl));
      return;
    }

    const meta = buildProductOgMeta(product, canonicalUrl, sku);
    log.success(`tags built  image=${meta.image ? "yes" : "none"}`).end("OG SHARE");
    res.send(renderShareHtml(meta, canonicalUrl));
  } catch (err) {
    log.error("failed — generic redirect", err).end("OG SHARE");
    res.send(genericRedirect(canonicalUrl));
  }
});

export default router;
