import { performance } from "perf_hooks";
import { type SupabaseClient } from "@supabase/supabase-js";
import { fms, type OpLogger } from "./logger.js";

// Fetch the products that own a set of SKUs (base_sku or variant_sku).
//
// SKU is the identity of a buyable item: base_sku and variant_sku are each globally
// unique, while slugs are non-unique AND mutable (a title edit re-slugifies on
// republish — see products.ts /detail, which 404s stale slugs for the same reason).
// Cart/wishlist/checkout rows used to enrich via their STORED product_slug, so a
// product rename made live rows unresolvable — the cart's self-heal then deleted
// them as "dead". Resolving by SKU makes the stored slug display-only.
//
// Two steps because PostgREST can't OR across a parent column (base_sku) and an
// embedded child column (variant_sku) in one query without also filtering the
// embedded variant list (needed in full for the colors UI):
//   1. skus → owning product ids (variant + base lookups, in parallel)
//   2. ids  → full product rows with the caller's select
export async function fetchProductsBySkus(
  db: SupabaseClient,
  skus: string[],
  select: string,
  log: OpLogger,
): Promise<{ data: unknown[] | null; error: { message: string; code?: string } | null }> {
  if (skus.length === 0) return { data: [], error: null };

  const t0Resolve = performance.now();
  const [variantHits, baseHits] = await Promise.all([
    db.from("product_variants").select("product_id").in("variant_sku", skus),
    db.from("products").select("id").in("base_sku", skus),
  ]);
  if (variantHits.error) return { data: null, error: variantHits.error };
  if (baseHits.error) return { data: null, error: baseHits.error };

  const ids = [
    ...new Set(
      [
        ...(variantHits.data ?? []).map((r) => r.product_id as string),
        ...(baseHits.data ?? []).map((r) => r.id as string),
      ].filter(Boolean),
    ),
  ];
  log.step(`sku→product resolve: ${fms(performance.now() - t0Resolve)}  skus=${skus.length}  products=${ids.length}`);

  if (ids.length === 0) return { data: [], error: null };

  const t0Fetch = performance.now();
  const { data, error } = await db.from("products").select(select).in("id", ids);
  log.step(`DB products by id: ${fms(performance.now() - t0Fetch)}  rows=${data?.length ?? 0}`);
  if (error) return { data: null, error };
  return { data: data ?? [], error: null };
}
