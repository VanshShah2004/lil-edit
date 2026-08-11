import { supabase } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/backend";

// ─── Section keys (mirror backend KNOWN_SECTION_KEYS) ────────────────────────
export const SECTION_KEYS = [
  "home_trending",
  "home_recommended",
  "search_popular",
  "search_discover",
  "home_shop_the_look",
  "home_featured_categories",
  "home_collage",
  "home_hero_plus",
  "collections_browse",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

// ─── Resolved (storefront) item shapes ───────────────────────────────────────
export interface ResolvedProductItem {
  kind: "product";
  id: string;
  /** Primary colour variant's sku — what storefront actions (heart, quick add, PDP link) use. */
  sku: string;
  /** The product's base_sku — the identity curated items are stored under (admin flows use this). */
  baseSku: string;
  slug: string;
  categorySlug: string;
  title: string;
  price: number;
  originalPrice: number;
  image: string | null;
  badges: string[];
  /** Ride-along data so QuickAddButton can add without a hydration round-trip.
      Optional: older cached payloads may not carry them (QuickAdd falls back to hydrating). */
  sizes?: string[];
  stock?: number | null;
  isUnlimited?: boolean;
}

export interface ResolvedEditorialItem {
  kind: "editorial";
  id: string;
  title: string | null;
  subtitle: string | null;
  image: string | null;
  link: string | null;
  badge: string | null;
  meta: Record<string, unknown>;
}

export type ResolvedItem = ResolvedProductItem | ResolvedEditorialItem;

export interface ResolvedSection {
  key: SectionKey;
  title: string | null;
  subtitle: string | null;
  enabled: boolean;
  itemType: "product" | "editorial" | "mixed";
  items: ResolvedItem[];
}

// ─── Admin shapes ────────────────────────────────────────────────────────────
export interface AdminSectionItem {
  id: string;
  sortOrder: number;
  kind: "product" | "editorial";
  productBaseSku: string | null;
  customTitle: string | null;
  customSubtitle: string | null;
  customImageUrl: string | null;
  linkUrl: string | null;
  badge: string | null;
  meta: Record<string, unknown>;
  isActive: boolean;
  product: ResolvedProductItem | null;
}

export interface AdminSection {
  key: SectionKey;
  title: string | null;
  subtitle: string | null;
  itemType: "product" | "editorial" | "mixed";
  isEnabled: boolean;
  maxItems: number;
  /** Optimistic-lock version — echoed back on save so concurrent edits 409 instead of clobbering. */
  updatedAt: string | null;
  items: AdminSectionItem[];
}

/** Thrown when a save is rejected because someone else modified the section first (HTTP 409). */
export class StaleSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleSaveError";
  }
}

// Payload shape accepted by PUT /sections/:key/items. All fields optional except kind.
export interface SectionItemInput {
  kind: "product" | "editorial";
  productBaseSku?: string | null;
  customTitle?: string | null;
  customSubtitle?: string | null;
  customImageUrl?: string | null;
  linkUrl?: string | null;
  badge?: string | null;
  meta?: Record<string, unknown>;
  isActive?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — no auth. Used by the storefront sections.
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchSections(keys: SectionKey[]): Promise<Record<string, ResolvedSection>> {
  const url = `${getBackendBaseUrl()}/api/curation/sections?keys=${keys.join(",")}`;
  console.log(`[curationApi] GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[curationApi] fetchSections failed (${res.status})`);
    throw new Error(`Curation fetch failed (${res.status})`);
  }
  const data = (await res.json()) as { sections: Record<string, ResolvedSection> };
  console.log(`[curationApi] fetchSections → ${Object.keys(data.sections ?? {}).length} section(s)`);
  return data.sections ?? {};
}

// Convenience for a single section.
export async function fetchSection(key: SectionKey): Promise<ResolvedSection | null> {
  const sections = await fetchSections([key]);
  return sections[key] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — bearer token required (requireAuth + requireAdmin on the backend).
// ─────────────────────────────────────────────────────────────────────────────
async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const url = `${getBackendBaseUrl()}${path}`;
  console.log(`[curationApi] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log(`[curationApi] ${init.method ?? "GET"} ${url} → ${res.status}`);
  return res;
}

export async function fetchAdminSections(): Promise<AdminSection[]> {
  const res = await authFetch(`/api/curation/admin/sections`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Admin sections fetch failed (${res.status})`);
  }
  const data = (await res.json()) as { sections: AdminSection[] };
  return data.sections ?? [];
}

// `expectedUpdatedAt` is the section version this draft was loaded against (pass the
// raw string — never round-trip it through Date, microsecond precision must survive).
// A 409 means someone else saved first; returns the NEW version so the caller can
// save again without a refetch.
export async function saveSectionItems(
  key: SectionKey,
  items: SectionItemInput[],
  expectedUpdatedAt: string | null = null,
): Promise<{ updatedAt: string | null }> {
  const res = await authFetch(`/api/curation/sections/${key}/items`, {
    method: "PUT",
    body: JSON.stringify({ items, expectedUpdatedAt }),
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    throw new StaleSaveError((body as { error?: string }).error ?? "Section was modified by someone else");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Save failed (${res.status})`);
  }
  const data = (await res.json().catch(() => ({}))) as { updatedAt?: string | null };
  return { updatedAt: data.updatedAt ?? null };
}

export async function updateSection(
  key: SectionKey,
  patch: { isEnabled?: boolean; title?: string; subtitle?: string },
): Promise<{ updatedAt: string | null }> {
  const res = await authFetch(`/api/curation/sections/${key}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Update failed (${res.status})`);
  }
  const data = (await res.json().catch(() => ({}))) as { updatedAt?: string | null };
  return { updatedAt: data.updatedAt ?? null };
}

// Resolve an unsaved draft exactly as the storefront would render it (incl. the
// product top-up), so the editor's live preview matches the live page. Read-only.
export async function previewSection(key: SectionKey, items: SectionItemInput[]): Promise<ResolvedItem[]> {
  const res = await authFetch(`/api/curation/sections/${key}/preview`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Preview failed (${res.status})`);
  }
  const data = (await res.json()) as { items: ResolvedItem[] };
  return data.items ?? [];
}

export async function searchProducts(q: string): Promise<ResolvedProductItem[]> {
  const res = await authFetch(`/api/curation/admin/product-search?q=${encodeURIComponent(q)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Product search failed (${res.status})`);
  }
  const data = (await res.json()) as { products: ResolvedProductItem[] };
  return data.products ?? [];
}
