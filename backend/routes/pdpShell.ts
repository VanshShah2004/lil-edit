import { Router, type Request, type Response } from "express";
import { fetchProductBySku } from "../lib/persistCatalog.js";
import { publicSiteUrl } from "../lib/siteUrl.js";
import { buildProductOgMeta, injectOgIntoHtml, renderOgMetaTags, escapeHtml } from "../lib/ogTags.js";
import { createLog } from "../lib/logger.js";

// ─── PDP shell with per-product Open Graph tags ──────────────────────────────
// The storefront's static host rewrites /collections/:category/product/:productPath
// to this route (see render.yaml), so a shared link IS the canonical PDP URL —
// no /share redirect hop, no api.* host in the message.
//
// Unlike routes/share.ts (which redirects), this returns the real SPA shell with
// tags injected, because a redirect back to the PDP URL would re-enter the same
// rewrite and loop forever.
//
// This route serves REAL PAGE LOADS, not just crawler hits. It must never fail
// closed: every error path still returns usable HTML.

const router = Router();

// The shell is fetched from the static host rather than bundled here, so it always
// matches the asset hashes the static host is currently serving — the backend and
// the frontend deploy independently, and a bundled copy would go stale and point at
// 404'd JS/CSS. /index.html is a real file on the static host, so it is never
// rewritten back into this route (no loop).
const SHELL_TTL_MS = 60_000;
let shellCache: { html: string; at: number } | null = null;
let shellInflight: Promise<string | null> | null = null;

async function fetchShell(): Promise<string | null> {
  const log = createLog().start("PDP SHELL FETCH");
  try {
    const url = `${publicSiteUrl()}/index.html`;
    const res = await fetch(url, {
      headers: { "User-Agent": "lil-edit-backend/pdp-shell" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      log.warn(`status=${res.status} — keeping previous shell`).end("PDP SHELL FETCH");
      return shellCache?.html ?? null;
    }
    const html = await res.text();
    // Guard against caching an error page or a truncated body.
    if (!/<\/head>/i.test(html)) {
      log.warn("response has no </head> — not a shell, keeping previous").end("PDP SHELL FETCH");
      return shellCache?.html ?? null;
    }
    shellCache = { html, at: Date.now() };
    log.success(`cached  bytes=${html.length}`).end("PDP SHELL FETCH");
    return html;
  } catch (err) {
    // Serve the last known good shell rather than nothing. Staleness is bounded in
    // practice: if we can't reach the static host, neither can the browser's asset
    // requests, so a fresh shell would not have helped either.
    log.error("fetch failed — falling back to cached shell", err).end("PDP SHELL FETCH");
    return shellCache?.html ?? null;
  }
}

// Single-flight: a burst of PDP hits on a cold cache triggers one upstream fetch.
async function getShell(): Promise<string | null> {
  if (shellCache && Date.now() - shellCache.at < SHELL_TTL_MS) return shellCache.html;
  if (!shellInflight) {
    shellInflight = fetchShell().finally(() => {
      shellInflight = null;
    });
  }
  return shellInflight;
}

/** Warm the cache at boot so the first shopper doesn't pay the fetch. Fire-and-forget. */
export function warmPdpShell(): void {
  void getShell();
}

// Last-resort page when the shell is unreachable AND was never cached. Carries the
// OG tags so a crawler still gets a card, retries once (the failure is transient by
// nature), then degrades to a plain link rather than a blank screen. The retry is
// sessionStorage-guarded so it can never loop.
function fallbackHtml(title: string, canonicalUrl: string, ogBlock: string): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle} — The Lil Edit</title>
    ${ogBlock}
    <link rel="icon" type="image/png" href="/logo.png" />
  </head>
  <body style="font-family:system-ui,sans-serif;text-align:center;padding:3rem 1.5rem">
    <h1 style="font-size:1.25rem">${safeTitle}</h1>
    <p>We're having trouble loading this page.</p>
    <p><a href="${escapeHtml(canonicalUrl)}">Tap to retry</a> · <a href="${escapeHtml(publicSiteUrl())}">The Lil Edit</a></p>
    <script>
      try {
        if (!sessionStorage.getItem("pdpShellRetry")) {
          sessionStorage.setItem("pdpShellRetry", "1");
          location.reload();
        }
      } catch (e) {}
    </script>
  </body>
</html>`;
}

// productPath is "slug$sku", matching the SPA's PDP route.
router.get("/:category/:productPath", async (req: Request, res: Response) => {
  const log = createLog().start("PDP OG");
  const category = String(req.params.category ?? "");
  const productPath = String(req.params.productPath ?? "");
  const sep = productPath.indexOf("$");
  const slug = sep >= 0 ? productPath.slice(0, sep) : productPath;
  const sku = sep >= 0 ? productPath.slice(sep + 1) : "";

  const canonicalUrl = `${publicSiteUrl()}/collections/${category}/product/${productPath}`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Short shared cache: a crawler re-fetch is cheap, but price/stock edits must not
  // sit behind a long TTL. Browsers revalidate so a shopper never sees a stale page.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=120, must-revalidate");

  let shell: string | null = null;
  try {
    shell = await getShell();
  } catch (err) {
    log.error("getShell threw", err);
  }

  log.step(`category=${category}  slug=${slug}  sku=${sku}  shell=${shell ? "yes" : "MISSING"}`);

  try {
    if (!sku) {
      log.warn("no sku in path — plain shell").end("PDP OG");
      res.send(shell ?? fallbackHtml("The Lil Edit", canonicalUrl, ""));
      return;
    }

    const product = await fetchProductBySku(sku, log);
    if (!product || product.slug !== slug || product.category_slug !== category) {
      log.warn(`no match (found=${!!product}) — plain shell`).end("PDP OG");
      res.send(shell ?? fallbackHtml("The Lil Edit", canonicalUrl, ""));
      return;
    }

    const meta = buildProductOgMeta(product, canonicalUrl, sku);
    if (!shell) {
      log.warn("shell unavailable — OG-only fallback page").end("PDP OG");
      res.send(fallbackHtml(product.title, canonicalUrl, renderOgMetaTags(meta)));
      return;
    }

    log.success(`injected  image=${meta.image ? "yes" : "none"}`).end("PDP OG");
    res.send(injectOgIntoHtml(shell, meta));
  } catch (err) {
    // A DB hiccup must still render the product page — the SPA fetches its own data
    // client-side, so the plain shell is fully functional, just without a rich preview.
    log.error("failed — plain shell", err).end("PDP OG");
    res.send(shell ?? fallbackHtml("The Lil Edit", canonicalUrl, ""));
  }
});

export default router;
