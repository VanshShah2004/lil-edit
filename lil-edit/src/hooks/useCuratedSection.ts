import { useEffect, useState } from "react";
import {
  fetchSection,
  type ResolvedItem,
  type ResolvedProductItem,
  type ResolvedEditorialItem,
  type SectionKey,
} from "@/lib/curationApi";

// ─────────────────────────────────────────────────────────────────────────────
// Shared hook the storefront strips use to pull their curated items from the
// backend curation engine (GET /api/curation/sections).
//
// Graceful-degradation contract: if the section is disabled, unseeded (migration
// not yet applied), empty, or the request fails, `items` comes back empty and the
// consuming component falls back to its own hardcoded content — so the storefront
// never renders broken. Product sections additionally get a server-side random
// fallback, so an empty `items` here means "curation unavailable", not "no data".
// ─────────────────────────────────────────────────────────────────────────────
export interface UseCuratedSection {
  items: ResolvedItem[];
  products: ResolvedProductItem[];
  editorials: ResolvedEditorialItem[];
  title: string | null;
  subtitle: string | null;
  loading: boolean;
  /** True once the fetch settled (success or failure) — lets components avoid a flash. */
  ready: boolean;
}

interface State {
  items: ResolvedItem[];
  title: string | null;
  subtitle: string | null;
  loading: boolean;
  ready: boolean;
}

const INITIAL: State = { items: [], title: null, subtitle: null, loading: true, ready: false };

// `skip` lets a consumer (e.g. the admin preview, which feeds its own draft items)
// opt out of the network fetch entirely. The hook then stays at INITIAL/empty.
export function useCuratedSection(key: SectionKey, options?: { skip?: boolean }): UseCuratedSection {
  const skip = options?.skip ?? false;
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    console.log(`[useCuratedSection] loading "${key}"`);

    fetchSection(key)
      .then((section) => {
        if (cancelled) return;
        const list = section?.items ?? [];
        console.log(`[useCuratedSection] "${key}" → ${list.length} item(s)`);
        setState({
          items: list,
          title: section?.title ?? null,
          subtitle: section?.subtitle ?? null,
          loading: false,
          ready: true,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`[useCuratedSection] "${key}" failed — falling back to local content`, err);
        setState({ ...INITIAL, loading: false, ready: true });
      });

    return () => {
      cancelled = true;
    };
  }, [key, skip]);

  return {
    items: state.items,
    products: state.items.filter((i): i is ResolvedProductItem => i.kind === "product"),
    editorials: state.items.filter((i): i is ResolvedEditorialItem => i.kind === "editorial"),
    title: state.title,
    subtitle: state.subtitle,
    loading: state.loading,
    ready: state.ready,
  };
}

// Build the PDP route for a curated product. Mirrors QuickViewDrawer's `pdpUrl`.
export function pdpUrlFor(p: { categorySlug: string; slug: string; sku: string }): string {
  return `/collections/${p.categorySlug}/product/${p.slug}$${p.sku}`;
}

// Read a string field out of an editorial item's `meta` jsonb (size, object_position,
// mobile_image_url, desktop_image_url, …). Returns "" when absent so callers can
// fall back with `||`.
export function metaStr(meta: Record<string, unknown> | undefined, k: string): string {
  return meta && typeof meta[k] === "string" ? (meta[k] as string) : "";
}
