import { Router, type Request, type Response } from "express";
import { supabaseAdmin, supabaseAnon } from "../lib/supabase.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { adminMutationLimiter } from "../middleware/rateLimiters.js";
import { createLog, type OpLogger } from "../lib/logger.js";
import { redisGet, redisSet, redisDel, redisKey, CURATION_TTL_S } from "../lib/redis.js";

const router = Router();
const db = () => supabaseAdmin ?? supabaseAnon;

// The eight storefront strips this engine drives. The frontend asks for these by key.
const KNOWN_SECTION_KEYS = [
  "home_trending",
  "home_recommended",
  "search_popular",
  "search_discover",
  "home_shop_the_look",
  "home_featured_categories",
  "home_collage",
  "collections_featured",
] as const;
type SectionKey = (typeof KNOWN_SECTION_KEYS)[number];

function isKnownKey(k: string): k is SectionKey {
  return (KNOWN_SECTION_KEYS as readonly string[]).includes(k);
}

// ─── Row shapes ──────────────────────────────────────────────────────────────
interface SectionRow {
  id: string;
  section_key: string;
  title: string | null;
  subtitle: string | null;
  item_type: "product" | "editorial" | "mixed";
  is_enabled: boolean;
  max_items: number;
}

interface ItemRow {
  id: string;
  section_id: string;
  sort_order: number;
  kind: "product" | "editorial";
  product_base_sku: string | null;
  custom_title: string | null;
  custom_subtitle: string | null;
  custom_image_url: string | null;
  link_url: string | null;
  badge: string | null;
  meta: Record<string, unknown> | null;
  is_active: boolean;
}

interface ProductRow {
  id: string;
  base_sku: string;
  slug: string;
  category_slug: string;
  title: string;
  price: number | string;
  original_price: number | string | null;
  badges: string[] | null;
  is_featured: boolean;
  is_new_arrival: boolean;
  is_bestseller: boolean;
  is_trending: boolean;
}

// ─── Resolved (frontend) shapes ──────────────────────────────────────────────
interface ResolvedProduct {
  kind: "product";
  id: string;
  sku: string;
  slug: string;
  categorySlug: string;
  title: string;
  price: number;
  originalPrice: number;
  image: string | null;
  badges: string[];
}

interface ResolvedEditorial {
  kind: "editorial";
  id: string;
  title: string | null;
  subtitle: string | null;
  image: string | null;
  link: string | null;
  badge: string | null;
  meta: Record<string, unknown>;
}

type ResolvedItem = ResolvedProduct | ResolvedEditorial;

interface ResolvedSection {
  key: string;
  title: string | null;
  subtitle: string | null;
  enabled: boolean;
  itemType: "product" | "editorial" | "mixed";
  items: ResolvedItem[];
}

const PRODUCT_SELECT =
  "id, base_sku, slug, category_slug, title, price, original_price, badges, is_featured, is_new_arrival, is_bestseller, is_trending";

// Compose the badge labels shown on a product card: the product's own custom badges
// plus its merchandising flags rendered as labels (same composition the PDP rec list uses).
function composeBadges(p: ProductRow): string[] {
  return [
    ...(p.badges ?? []),
    ...(p.is_featured ? ["Featured"] : []),
    ...(p.is_new_arrival ? ["New Arrival"] : []),
    ...(p.is_trending ? ["Trending"] : []),
    ...(p.is_bestseller ? ["Bestseller"] : []),
  ];
}

// Build product_id → primary image URL. Prefer is_primary, else lowest sort_order, else first.
function buildPrimaryImageMap(
  imgs: Array<{ product_id: string; image_url: string; is_primary: boolean; sort_order: number }>,
): Map<string, string> {
  const byProduct = new Map<string, typeof imgs>();
  for (const img of imgs) {
    const arr = byProduct.get(img.product_id) ?? [];
    arr.push(img);
    byProduct.set(img.product_id, arr);
  }
  const map = new Map<string, string>();
  for (const [pid, arr] of byProduct) {
    const primary =
      arr.find((i) => i.is_primary) ??
      arr.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
    if (primary) map.set(pid, primary.image_url);
  }
  return map;
}

function toResolvedProduct(p: ProductRow, image: string | null, extraBadges: string[] = []): ResolvedProduct {
  const badges = [...new Set([...composeBadges(p), ...extraBadges])];
  return {
    kind: "product",
    id: p.id,
    sku: p.base_sku,
    slug: p.slug,
    categorySlug: p.category_slug,
    title: p.title,
    price: Number(p.price) || 0,
    originalPrice: Number(p.original_price ?? p.price) || 0,
    image,
    badges,
  };
}

// Attach primary images to a set of product rows, returning resolved products keyed by base_sku.
async function resolveProductRows(rows: ProductRow[], log: OpLogger): Promise<Map<string, ResolvedProduct>> {
  const out = new Map<string, ResolvedProduct>();
  if (rows.length === 0) return out;
  const ids = rows.map((r) => r.id);
  const { data: imgs, error } = await db()
    .from("product_images")
    .select("product_id, image_url, is_primary, sort_order")
    .in("product_id", ids);
  if (error) log.warn(`image fetch failed: ${error.message}`);
  const imageMap = buildPrimaryImageMap(
    (imgs ?? []) as Array<{ product_id: string; image_url: string; is_primary: boolean; sort_order: number }>,
  );
  for (const p of rows) out.set(p.base_sku, toResolvedProduct(p, imageMap.get(p.id) ?? null));
  return out;
}

// Look up published products by base_sku, returning sku → resolved product.
async function resolveProductsBySku(skus: string[], log: OpLogger): Promise<Map<string, ResolvedProduct>> {
  if (skus.length === 0) return new Map();
  const { data, error } = await db()
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("status", "PUBLISHED")
    .in("base_sku", skus);
  if (error) {
    log.warn(`product lookup failed: ${error.message}`);
    return new Map();
  }
  return resolveProductRows((data ?? []) as ProductRow[], log);
}

// Random/recent published products used both for the empty-section fallback AND to
// top up a partially-curated product section up to its max_items. For the trending
// section we prefer is_trending=true and guarantee a "Trending" badge; if too few
// trending products exist we top up with any published product (still trending-tagged).
// `excludeSkus` keeps already-curated products from being repeated in the top-up.
async function fallbackProducts(
  limit: number,
  opts: { trendingOnly?: boolean; excludeSkus?: Set<string> },
  log: OpLogger,
): Promise<ResolvedProduct[]> {
  if (limit <= 0) return [];
  const tagTrending = !!opts.trendingOnly;
  const exclude = opts.excludeSkus ?? new Set<string>();
  const collected: ProductRow[] = [];
  const seen = new Set<string>();
  const take = (p: ProductRow): void => {
    if (seen.has(p.id) || exclude.has(p.base_sku)) return;
    seen.add(p.id);
    collected.push(p);
  };

  // Fetch a little extra headroom so excluded SKUs don't starve the result.
  const headroom = limit + exclude.size;

  if (opts.trendingOnly) {
    const { data } = await db()
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("status", "PUBLISHED")
      .eq("is_trending", true)
      .limit(headroom);
    for (const p of (data ?? []) as ProductRow[]) take(p);
  }

  if (collected.length < limit) {
    // Top up with the most recent published products (newest first).
    const { data } = await db()
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("status", "PUBLISHED")
      .order("created_at", { ascending: false })
      .limit(headroom * 2);
    for (const p of (data ?? []) as ProductRow[]) {
      if (collected.length >= limit) break;
      take(p);
    }
  }

  const resolvedMap = await resolveProductRows(collected, log);
  const extra = tagTrending ? ["Trending"] : [];
  return collected
    .map((p) => {
      const r = resolvedMap.get(p.base_sku);
      if (!r) return null;
      return extra.length ? { ...r, badges: [...new Set([...r.badges, ...extra])] } : r;
    })
    .filter((x): x is ResolvedProduct => x !== null)
    .slice(0, limit);
}

// Resolve a section's raw item rows into storefront items, applying the empty-section
// fallback and the partial-curation top-up. Shared by the cached storefront read
// (getResolvedSection, DB rows) and the admin preview (unsaved draft rows).
async function resolveItems(section: SectionRow, itemRows: ItemRow[], log: OpLogger): Promise<ResolvedItem[]> {
  const key = section.section_key;

  if (itemRows.length === 0) {
    // ── Empty section → random published products (your configured fallback) ──
    // Editorial-only sections have no product fallback; they simply render empty.
    if (section.item_type === "editorial") {
      log.step(`section ${key} - empty editorial, no fallback`);
      return [];
    }
    const trendingOnly = key === "home_trending";
    const items = await fallbackProducts(section.max_items, { trendingOnly }, log);
    log.step(`section ${key} - fallback products=${items.length}  trending=${trendingOnly}`);
    return items;
  }

  // Resolve product items against the live catalog; pass editorial items through.
  const skus = itemRows.filter((r) => r.kind === "product" && r.product_base_sku).map((r) => r.product_base_sku as string);
  const productMap = await resolveProductsBySku(skus, log);

  let items = itemRows
    .map((r): ResolvedItem | null => {
      if (r.kind === "product") {
        const resolved = r.product_base_sku ? productMap.get(r.product_base_sku) : undefined;
        if (!resolved) return null; // product unpublished/deleted → skip
        // A per-item badge override (if set) is added on top of the product's own badges.
        return r.badge ? { ...resolved, id: r.id, badges: [...new Set([...resolved.badges, r.badge])] } : { ...resolved, id: r.id };
      }
      return {
        kind: "editorial",
        id: r.id,
        title: r.custom_title,
        subtitle: r.custom_subtitle,
        image: r.custom_image_url,
        link: r.link_url,
        badge: r.badge,
        meta: r.meta ?? {},
      };
    })
    .filter((x): x is ResolvedItem => x !== null);
  log.step(`section ${key} - curated items=${items.length}`);

  // Product sections auto-fill the remaining slots from the catalog, so a section
  // the admin only partially curated (e.g. 1 of 10) is never left sparse. The
  // admin's picks keep their order at the front; the rest are topped up below.
  if (section.item_type === "product" && items.length < section.max_items) {
    const haveSkus = new Set(
      items.filter((i): i is ResolvedProduct => i.kind === "product").map((i) => i.sku),
    );
    const need = section.max_items - items.length;
    const trendingOnly = key === "home_trending";
    const filler = await fallbackProducts(need, { trendingOnly, excludeSkus: haveSkus }, log);
    items = [...items, ...filler];
    log.step(`section ${key} - topped up with ${filler.length} fallback product(s) → total=${items.length}`);
  }
  return items;
}

// ─── Core: resolve a single section (cached) ─────────────────────────────────
async function getResolvedSection(key: SectionKey, log: OpLogger): Promise<ResolvedSection | null> {
  const rKey = redisKey("curation", key);
  const cached = await redisGet<ResolvedSection>(rKey, log);
  if (cached) {
    log.step(`section ${key} - L2 HIT`);
    return cached;
  }

  const { data: sectionData, error: sErr } = await db()
    .from("curated_sections")
    .select("id, section_key, title, subtitle, item_type, is_enabled, max_items")
    .eq("section_key", key)
    .maybeSingle();
  if (sErr) {
    log.warn(`section ${key} fetch failed: ${sErr.message}`);
    return null;
  }
  if (!sectionData) {
    log.warn(`section ${key} not seeded`);
    return null;
  }
  const section = sectionData as SectionRow;

  const { data: itemData, error: iErr } = await db()
    .from("curated_section_items")
    .select(
      "id, section_id, sort_order, kind, product_base_sku, custom_title, custom_subtitle, custom_image_url, link_url, badge, meta, is_active",
    )
    .eq("section_id", section.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (iErr) log.warn(`section ${key} items fetch failed: ${iErr.message}`);
  const itemRows = (itemData ?? []) as ItemRow[];
  const items = await resolveItems(section, itemRows, log);

  const resolved: ResolvedSection = {
    key: section.section_key,
    title: section.title,
    subtitle: section.subtitle,
    enabled: section.is_enabled,
    itemType: section.item_type,
    items,
  };

  await redisSet(rKey, resolved, CURATION_TTL_S, log);
  return resolved;
}

async function invalidateSection(key: string, log: OpLogger): Promise<void> {
  await redisDel(log, redisKey("curation", key));
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: GET /api/curation/sections?keys=home_trending,home_recommended
// Returns resolved, enabled sections for the storefront. Unknown keys are ignored.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sections", async (req: Request, res: Response) => {
  const log = createLog().start("CURATION SECTIONS");
  const raw = (req.query.keys as string | undefined) ?? "";
  const keys = raw.split(",").map((k) => k.trim()).filter(isKnownKey);
  log.step(`requested keys=${keys.length ? keys.join(",") : "(none)"}`);

  if (keys.length === 0) {
    log.warn("no valid keys").end("CURATION SECTIONS");
    res.json({ sections: {} });
    return;
  }

  try {
    const resolvedList = await Promise.all(keys.map((k) => getResolvedSection(k, log)));
    const sections: Record<string, ResolvedSection> = {};
    for (const s of resolvedList) {
      // Only surface enabled sections to the storefront.
      if (s && s.enabled) sections[s.key] = s;
    }
    log.success(`served ${Object.keys(sections).length}/${keys.length} sections`).end("CURATION SECTIONS");
    res.json({ sections });
  } catch (err) {
    log.error("failed", err).end("CURATION SECTIONS");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN routes — every endpoint below requires a valid token AND an admin role.
// ─────────────────────────────────────────────────────────────────────────────
router.use(requireAuth, requireAdmin);

// GET /api/curation/admin/sections — all sections + raw items + product previews.
router.get("/admin/sections", async (_req: Request, res: Response) => {
  const log = createLog().start("CURATION ADMIN LIST");
  try {
    const { data: sections, error: sErr } = await db()
      .from("curated_sections")
      .select("id, section_key, title, subtitle, item_type, is_enabled, max_items")
      .order("section_key", { ascending: true });
    if (sErr) throw sErr;

    const { data: items, error: iErr } = await db()
      .from("curated_section_items")
      .select(
        "id, section_id, sort_order, kind, product_base_sku, custom_title, custom_subtitle, custom_image_url, link_url, badge, meta, is_active",
      )
      .order("sort_order", { ascending: true });
    if (iErr) throw iErr;

    const itemRows = (items ?? []) as ItemRow[];

    // Resolve product previews (thumbnail/title/price) for all product items at once.
    const skus = [...new Set(itemRows.filter((r) => r.product_base_sku).map((r) => r.product_base_sku as string))];
    const productMap = await resolveProductsBySku(skus, log);

    const itemsBySection = new Map<string, ItemRow[]>();
    for (const r of itemRows) {
      const arr = itemsBySection.get(r.section_id) ?? [];
      arr.push(r);
      itemsBySection.set(r.section_id, arr);
    }

    const result = ((sections ?? []) as SectionRow[]).map((s) => ({
      key: s.section_key,
      title: s.title,
      subtitle: s.subtitle,
      itemType: s.item_type,
      isEnabled: s.is_enabled,
      maxItems: s.max_items,
      items: (itemsBySection.get(s.id) ?? []).map((r) => ({
        id: r.id,
        sortOrder: r.sort_order,
        kind: r.kind,
        productBaseSku: r.product_base_sku,
        customTitle: r.custom_title,
        customSubtitle: r.custom_subtitle,
        customImageUrl: r.custom_image_url,
        linkUrl: r.link_url,
        badge: r.badge,
        meta: r.meta ?? {},
        isActive: r.is_active,
        // Preview for product items so the editor can show a thumbnail; null if the
        // referenced product is no longer published.
        product: r.product_base_sku ? productMap.get(r.product_base_sku) ?? null : null,
      })),
    }));

    log.success(`served ${result.length} sections`).end("CURATION ADMIN LIST");
    res.json({ sections: result });
  } catch (err) {
    log.error("failed", err).end("CURATION ADMIN LIST");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PUT /api/curation/admin/sections/:key/items — atomic replace of the ordered list.
router.put("/sections/:key/items", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("CURATION SET ITEMS");
  const key = req.params.key as string;
  const adminId = (req as AuthenticatedRequest).userId;

  if (!isKnownKey(key)) {
    log.warn(`unknown key=${key}`).end("CURATION SET ITEMS");
    res.status(400).json({ error: `Unknown section key: ${key}` });
    return;
  }

  const body = req.body as { items?: unknown };
  if (!Array.isArray(body.items)) {
    log.warn("items not an array").end("CURATION SET ITEMS");
    res.status(400).json({ error: "Body must be { items: [...] }" });
    return;
  }

  // Normalise each item to the snake_case shape the RPC reads. Unknown fields are dropped.
  const items = body.items.map((raw) => {
    const it = raw as Record<string, unknown>;
    return {
      kind: it.kind === "editorial" ? "editorial" : "product",
      product_base_sku: it.productBaseSku ?? it.product_base_sku ?? null,
      custom_title: it.customTitle ?? it.custom_title ?? null,
      custom_subtitle: it.customSubtitle ?? it.custom_subtitle ?? null,
      custom_image_url: it.customImageUrl ?? it.custom_image_url ?? null,
      link_url: it.linkUrl ?? it.link_url ?? null,
      badge: it.badge ?? null,
      meta: it.meta ?? {},
      is_active: it.isActive ?? it.is_active ?? true,
    };
  });
  log.step(`admin=${adminId}  key=${key}  items=${items.length}`);

  try {
    const { error } = await db().rpc("curation_set_section_items", {
      p_section_key: key,
      p_items: items,
    });
    if (error) {
      log.error(`rpc failed code=${error.code} msg=${error.message}`, error).end("CURATION SET ITEMS");
      res.status(500).json({ error: error.message });
      return;
    }
    await invalidateSection(key, log);
    log.success(`replaced items  key=${key}  count=${items.length}`).end("CURATION SET ITEMS");
    res.json({ success: true });
  } catch (err) {
    log.error("failed", err).end("CURATION SET ITEMS");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/curation/admin/sections/:key/preview — resolve an UNSAVED draft exactly
// as the storefront would render it (incl. the partial-curation product top-up), so
// the admin editor's live preview matches the live page. Does not write anything.
router.post("/sections/:key/preview", async (req: Request, res: Response) => {
  const log = createLog().start("CURATION PREVIEW");
  const key = req.params.key as string;

  if (!isKnownKey(key)) {
    log.warn(`unknown key=${key}`).end("CURATION PREVIEW");
    res.status(400).json({ error: `Unknown section key: ${key}` });
    return;
  }

  const body = req.body as { items?: unknown };
  if (!Array.isArray(body.items)) {
    log.warn("items not an array").end("CURATION PREVIEW");
    res.status(400).json({ error: "Body must be { items: [...] }" });
    return;
  }

  try {
    const { data: sectionData, error: sErr } = await db()
      .from("curated_sections")
      .select("id, section_key, title, subtitle, item_type, is_enabled, max_items")
      .eq("section_key", key)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!sectionData) {
      res.status(404).json({ error: `Section not seeded: ${key}` });
      return;
    }
    const section = sectionData as SectionRow;

    // Turn the draft (camelCase, like the save payload) into ItemRow shape. Only active
    // items count; sort_order follows array position, mirroring the save RPC.
    const itemRows: ItemRow[] = body.items
      .map((raw, idx): ItemRow => {
        const it = raw as Record<string, unknown>;
        return {
          id: `preview-${idx}`,
          section_id: section.id,
          sort_order: idx,
          kind: it.kind === "editorial" ? "editorial" : "product",
          product_base_sku: (it.productBaseSku ?? it.product_base_sku ?? null) as string | null,
          custom_title: (it.customTitle ?? it.custom_title ?? null) as string | null,
          custom_subtitle: (it.customSubtitle ?? it.custom_subtitle ?? null) as string | null,
          custom_image_url: (it.customImageUrl ?? it.custom_image_url ?? null) as string | null,
          link_url: (it.linkUrl ?? it.link_url ?? null) as string | null,
          badge: (it.badge ?? null) as string | null,
          meta: (it.meta ?? {}) as Record<string, unknown>,
          is_active: (it.isActive ?? it.is_active ?? true) as boolean,
        };
      })
      .filter((r) => r.is_active);

    log.step(`key=${key}  draft items=${itemRows.length}`);
    const items = await resolveItems(section, itemRows, log);
    log.success(`resolved ${items.length} item(s)`).end("CURATION PREVIEW");
    res.json({ items });
  } catch (err) {
    log.error("failed", err).end("CURATION PREVIEW");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/curation/admin/sections/:key — toggle enabled / edit heading.
router.patch("/sections/:key", adminMutationLimiter, async (req: Request, res: Response) => {
  const log = createLog().start("CURATION PATCH SECTION");
  const key = req.params.key as string;
  if (!isKnownKey(key)) {
    log.warn(`unknown key=${key}`).end("CURATION PATCH SECTION");
    res.status(400).json({ error: `Unknown section key: ${key}` });
    return;
  }

  const body = req.body as { isEnabled?: unknown; title?: unknown; subtitle?: unknown };
  const patch: Record<string, unknown> = {};
  if (typeof body.isEnabled === "boolean") patch.is_enabled = body.isEnabled;
  if (typeof body.title === "string") patch.title = body.title.trim() || null;
  if (typeof body.subtitle === "string") patch.subtitle = body.subtitle.trim() || null;

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  log.step(`key=${key}  patch=${Object.keys(patch).join(",")}`);

  try {
    const { error } = await db().from("curated_sections").update(patch).eq("section_key", key);
    if (error) {
      log.error(`update failed: ${error.message}`, error).end("CURATION PATCH SECTION");
      res.status(500).json({ error: error.message });
      return;
    }
    await invalidateSection(key, log);
    log.success(`updated  key=${key}`).end("CURATION PATCH SECTION");
    res.json({ success: true });
  } catch (err) {
    log.error("failed", err).end("CURATION PATCH SECTION");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/curation/admin/product-search?q= — thin product picker for the editor.
router.get("/admin/product-search", async (req: Request, res: Response) => {
  const log = createLog().start("CURATION PRODUCT SEARCH");
  const q = ((req.query.q as string | undefined) ?? "").trim();
  log.step(`q="${q}"`);

  try {
    let query = db()
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("status", "PUBLISHED")
      .order("created_at", { ascending: false })
      .limit(20);

    if (q) {
      // PostgREST .or() — escape the comma/paren chars that would corrupt the filter.
      const safe = q.replace(/[,()*]/g, " ").trim();
      query = query.or(`title.ilike.%${safe}%,base_sku.ilike.%${safe}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as ProductRow[];
    const resolved = await resolveProductRows(rows, log);
    const products = rows.map((r) => resolved.get(r.base_sku)).filter(Boolean);

    log.success(`${products.length} products`).end("CURATION PRODUCT SEARCH");
    res.json({ products });
  } catch (err) {
    log.error("failed", err).end("CURATION PRODUCT SEARCH");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
