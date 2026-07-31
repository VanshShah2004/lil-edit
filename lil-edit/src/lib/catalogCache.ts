// Shared catalog cache — module scope survives SPA navigation.
// Imported by ManageProducts (reads/writes) and EditProduct/AddProduct (invalidation only).

export const LIST_TTL_MS   = 10 * 60_000; // 10 min — matches CATALOG_LIST_TTL_S on backend
export const DETAIL_TTL_MS = 2  * 60_000; // 2 min  — matches CATALOG_DETAIL_TTL_S on backend

// Cached payloads are intentionally opaque here so this module stays decoupled
// from page-level types; consumers narrow `data` to their own shape on read.
export interface ListCacheEntry   { data: unknown; timestamp: number; }
export interface DetailCacheEntry { data: { published?: unknown; draft?: unknown }; timestamp: number; }

export const listCache      = new Map<string, ListCacheEntry>();
export const detailCache    = new Map<string, DetailCacheEntry>();
export const listInFlight   = new Map<string, Promise<unknown>>();
export const detailInFlight = new Map<string, Promise<{ published?: unknown; draft?: unknown }>>();

export function listCacheKey(status: string, showAll: boolean): string {
  return `${status}_${showAll ? "ALL" : "10"}`;
}

export function isExpired(timestamp: number, ttlMs: number): boolean {
  return Date.now() - timestamp > ttlMs;
}

/**
 * Call after any successful mutation (draft save, launch, delete) so the
 * ManageProducts list re-fetches on next visit and shows the changed product
 * at the top (sorted by updated_at DESC on the backend).
 */
export function invalidateAfterMutation(baseSku?: string): void {
  listCache.clear();
  if (baseSku) detailCache.delete(baseSku);
}
